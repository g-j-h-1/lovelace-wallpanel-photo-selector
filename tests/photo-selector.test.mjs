import test from "node:test";
import assert from "node:assert/strict";
import { getRatingFrequency, matchPhotoMetadata, selectPhoto, filterPhotos, effectiveHistorySize, wredHistoryEligibility, parseRecognisedPeople } from "../photo-selector.mjs";

const photos = [
  { url: "p", orientation: "portrait", weight: 1 },
  { url: "l", orientation: "landscape", weight: 5 },
  { url: "l2", orientation: "landscape", weight: 1 },
];
test("zero-rated defaults to zero weight but is configurable", () => {
  assert.equal(getRatingFrequency(0), 0);
  assert.equal(getRatingFrequency(0, {0: 3}), 3);
});
test("weighted choice runs independently on each selection", () => {
  assert.equal(selectPhoto(photos, [], 0, () => 0.5), "l");
  assert.equal(selectPhoto(photos, [], 0, () => 0), "p");
});
test("recent photos are excluded within the effective history cap", () => {
  const pool = Array.from({length: 8}, (_, i) => ({url: String(i), orientation: "landscape", weight: 1}));
  assert.equal(selectPhoto(pool, ["0", "1"], 2, () => 0), "0");
  assert.notEqual(selectPhoto(pool, ["0", "1"], 2, () => 0), "1");
  // A two-image library has a zero-length exclusion window.
  assert.equal(selectPhoto(pool.slice(0, 2), ["0", "1"], 2, () => 0), "0");
});
test("portrait must be followed by landscape where available", () => {
  assert.notEqual(selectPhoto(photos, ["p"], 1, () => 0), "p");
});
test("zero weights are never restored during history fallback", () => {
  assert.equal(selectPhoto([{url:"x",weight:0,orientation:"landscape"}], [], 0), null);
});
test("unmatched metadata is excluded individually", () => {
  const urls = ["media-source://media_source/local/PortalPhotos/known.jpg", "media-source://media_source/local/PortalPhotos/missing.jpg"];
  const result = matchPhotoMetadata(urls, [{path:"known.jpg",rating:4,orientation:"landscape"}], "PortalPhotos");
  assert.equal(result.length, 1);
  assert.equal(result[0].weight, 4);
});
test("filename include and exclude regex filters are case insensitive", () => {
  const result = filterPhotos([{url:"/local/2026-Rugby.JPG"}, {url:"/local/2026-Private.jpg"}, {url:"/local/2025-Rugby.jpg"}], "^2026", "private");
  assert.deepEqual(result.map(x=>x.url), ["/local/2026-Rugby.JPG"]);
});
test("invalid regex throws instead of silently passing", () => {
  assert.throws(() => filterPhotos(photos, "[", ""), SyntaxError);
});

test("history never exceeds a quarter of selectable photos", () => {
  const pool = Array.from({length: 10}, (_, i) => ({url: String(i), weight: 1, orientation: "landscape"}));
  assert.equal(effectiveHistorySize(pool, 50), 2);
  assert.equal(effectiveHistorySize(pool.slice(0, 3), 50), 0);
  assert.equal(effectiveHistorySize(pool.concat([{url:"excluded",weight:0}]), 50), 2);
  assert.equal(effectiveHistorySize(pool, 1), 1);
});
test("selection ignores stale history beyond the 25 percent cap", () => {
  const pool = Array.from({length: 8}, (_, i) => ({url: String(i), weight: 1, orientation: "landscape"}));
  assert.equal(selectPhoto(pool, ["0","1","2","3","4","5","6","7"], 50, () => 0), "0");
});

test("malformed URL escape does not abort filename filtering", () => {
  const result = filterPhotos([{url:"/local/photo%ZZ.jpg"}], "photo", "");
  assert.equal(result.length, 1);
});

test("metadata matching is restricted to the indexed media folder", () => {
  const urls = [
    "media-source://media_source/local/PortalPhotos/known.jpg",
    "media-source://media_source/local/OtherPhotos/known.jpg"
  ];
  const matched = matchPhotoMetadata(urls, [{path:"known.jpg",rating:5,orientation:"landscape"}], "PortalPhotos");
  assert.deepEqual(matched.map(item => item.url), [urls[0]]);
});


test("recognition text excludes Unknown and None but keeps multiple named people", () => {
  assert.deepEqual(parseRecognisedPeople(" Person B, Unknown, Person A "), ["Person B", "Person A"]);
  assert.deepEqual(parseRecognisedPeople("None"), []);
  assert.deepEqual(parseRecognisedPeople("unavailable"), []);
});

test("named-person photographs are prioritised without changing rating eligibility", () => {
  const pool = [
    {url: "unrelated", weight: 5, orientation: "landscape", people: []},
    {url: "samuel", weight: 1, orientation: "landscape", people: ["Person A"]},
    {url: "excluded", weight: 0, orientation: "landscape", people: ["Person A"]}
  ];
  assert.equal(selectPhoto(pool, [], 0, () => 0, ["Person A"]), "samuel");
  assert.equal(selectPhoto(pool, [], 0, () => 0, ["Not indexed"]), "unrelated");
});

test("portrait-landscape requirement still wins when a recognised photo is portrait", () => {
  const pool = [
    {url: "prior", weight: 1, orientation: "portrait", people: ["Person A"]},
    {url: "another-portrait", weight: 1, orientation: "portrait", people: ["Person A"]},
    {url: "landscape", weight: 1, orientation: "landscape", people: []}
  ];
  assert.equal(selectPhoto(pool, ["prior"], 0, () => 0, ["Person A"]), "landscape");
});

test("person metadata is passed through from indexed photographs", () => {
  const urls = ["media-source://media_source/local/PortalPhotos/known.jpg"];
  const matched = matchPhotoMetadata(urls, [
    {path: "known.jpg", rating: 3, orientation: "landscape", people: ["Person A", "Person B"]}
  ], "PortalPhotos");
  assert.deepEqual(matched[0].people, ["Person A", "Person B"]);
});

test("group photos outrank photos containing just one recognised person", () => {
  const pool = [
    {url:"a", weight:5, orientation:"landscape", people:["Person A"]},
    {url:"b", weight:5, orientation:"landscape", people:["Person B"]},
    {url:"both", weight:1, orientation:"landscape", people:["Person A","Person B"]},
    {url:"other", weight:5, orientation:"landscape", people:[]},
  ];
  assert.equal(selectPhoto(pool, [], 0, () => 0, ["Person A","Person B"]), "both");
  assert.equal(selectPhoto(pool, [], 0, () => 0, ["Person A"]), "a");
  assert.equal(selectPhoto(pool, ["both"], 0, () => 0, ["Person B"]), "b");
});

test("WRED protects newest half and progressively admits older history", () => {
  const pool = Array.from({length: 8}, (_, i) => ({url: String(i), weight: 1}));
  const history = ["0", "1", "2", "3", "4", "5"];
  assert.deepEqual(wredHistoryEligibility(pool, history, 6, () => 0).map(x => x.url), ["0", "1", "2", "6", "7"]);
  assert.deepEqual(wredHistoryEligibility(pool, history, 6, () => 0.99).map(x => x.url), ["0", "6", "7"]);
});
test("recognised photos in protected half never override history", () => {
  const pool = [
    ...Array.from({length: 5}, (_,i)=>({url:"me"+i,weight:1,orientation:"landscape",people:["Me"]})),
    ...Array.from({length: 163}, (_,i)=>({url:"other"+i,weight:1,orientation:"landscape",people:[]}))
  ];
  const history = [
    ...Array.from({length: 5}, (_,i)=>"me"+i),
    ...Array.from({length: 37}, (_,i)=>"other"+i)
  ];
  // All five recognised photos are now in the oldest half and are eligible.
  assert.ok(selectPhoto(pool, history, 42, () => 0, ["Me"]).startsWith("me"));
  const protectedHistory = [
    ...Array.from({length: 37}, (_,i)=>"other"+i),
    ...Array.from({length: 5}, (_,i)=>"me"+i)
  ];
  assert.ok(selectPhoto(pool, protectedHistory, 42, () => 0, ["Me"]).startsWith("other"));
});
test("five recognised photos wait until the halfway point of 42-entry history", () => {
  const pool = [
    ...Array.from({length: 5}, (_,i)=>({url:"me"+i,weight:1,orientation:"landscape",people:["Me"]})),
    ...Array.from({length: 163}, (_,i)=>({url:"other"+i,weight:1,orientation:"landscape",people:[]}))
  ];
  let history = [...Array.from({length: 37}, (_,i)=>"other"+i), ...Array.from({length: 5}, (_,i)=>"me"+i)];
  for (let i=0; i<17; i++) {
    const chosen = selectPhoto(pool, history, 42, () => 0, ["Me"]);
    assert.ok(chosen.startsWith("other"), `recognised image appeared too early at transition ${i}`);
    history = [...history, chosen].slice(-42);
  }
  assert.ok(selectPhoto(pool, history, 42, () => 0, ["Me"]).startsWith("me"));
});
test("older history entries receive stronger selection weighting", () => {
  const pool = [
    {url:"old",weight:1,orientation:"landscape",people:["Me"]},
    {url:"young",weight:1,orientation:"landscape",people:["Me"]},
    ...Array.from({length: 30}, (_,i)=>({url:"other"+i,weight:1,orientation:"landscape",people:[]}))
  ];
  const history = ["old","young","other0","other1","other2","other3","other4","other5"];
  // Both can be admitted at a low random draw; older has higher weight.
  assert.equal(selectPhoto(pool, history, 8, () => 0, ["Me"]), "old");
  assert.ok(selectPhoto(pool, history, 8, () => 0.99, ["Me"]).startsWith("other"));
});
test("a single recognised photo in protected history yields unrelated photos", () => {
  const pool = [
    {url:"a",weight:1,orientation:"landscape",people:["A"]},
    ...Array.from({length: 12}, (_,i)=>({url:"other"+i,weight:1,orientation:"landscape",people:[]}))
  ];
  assert.notEqual(selectPhoto(pool, ["a"], 8, () => 0.99, ["A"]), "a");
});

test("WRED admission delays first recognised replay and varies order", () => {
  const pool = [
    ...Array.from({length: 5}, (_,i)=>({url:"me"+i,weight:1,orientation:"landscape",people:["Me"]})),
    ...Array.from({length: 163}, (_,i)=>({url:"other"+i,weight:1,orientation:"landscape",people:[]}))
  ];
  // The oldest recognised photo has only just entered the older half.
  const history = ["me0", ...Array.from({length: 36}, (_,i)=>"other"+i), "me1","me2","me3","me4"];
  // A high random draw rejects the early WRED candidate and shows another photo.
  assert.ok(selectPhoto(pool, history, 42, () => 0.99, ["Me"]).startsWith("other"));
  // A low random draw admits the older recognised photo.
  assert.equal(selectPhoto(pool, history, 42, () => 0, ["Me"]), "me0");
});
