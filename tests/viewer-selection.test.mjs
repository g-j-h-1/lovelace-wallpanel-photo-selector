import test from "node:test";
import assert from "node:assert/strict";
import { viewerPhotoPool, selectPhoto, selectViewerPhoto, matchPhotoMetadata } from "../photo-selector.mjs";

const items = [
  { url: "a", path: "a.jpg", weight: 5, orientation: "landscape" },
  { url: "b", path: "b.jpg", weight: 1, orientation: "landscape" },
  { url: "c", path: "c.jpg", weight: 0, orientation: "landscape" }
];
const state = paths => ({ state: "matched", attributes: { matches: paths.map(path => ({path,people:1})), expires_at: "2026-11-07T18:00:15Z" } });
const now = Date.parse("2026-11-07T18:00:00Z");

test("fresh matches boost weights without excluding other photos", () => {
  const pool = viewerPhotoPool(items, state(["b.jpg"]), now);
  assert.deepEqual(pool.map(i => i.weight), [5,10,0]);
  assert.equal(selectPhoto(pool, [], 0, () => 0), "a");
  assert.equal(selectPhoto(pool, [], 0, () => .5), "b");
});
test("expired, unavailable and malformed viewer state use the normal pool", () => {
  for (const value of [undefined, {state: "error"}, {state:"matched",attributes:{paths: "b.jpg"}}, state(["b.jpg"])]) {
    assert.equal(viewerPhotoPool(items, value, now + 16000), items);
  }
});
test("viewer matching cannot bypass ratings or absent files", () => {
  assert.deepEqual(viewerPhotoPool(items, state(["c.jpg", "deleted.jpg"]), now).map(i => i.weight), [5,1,0]);
});
test("relative paths survive media metadata mapping including URL encoding", () => {
  const [item] = matchPhotoMetadata(["media-source://media_source/local/PortalPhotos/album/a%20b.jpg"],
    [{path:"album/a b.jpg",rating:5,orientation:"portrait"}]);
  assert.equal(item.path, "album/a b.jpg");
});

test("more remembered people increase the boost, while zero ratings stay excluded", () => {
  const group = {state:"matched",attributes:{matches:[{path:"a.jpg",people:1},{path:"b.jpg",people:2},{path:"c.jpg",people:3}],expires_at:"2026-11-07T18:00:15Z"}};
  assert.deepEqual(viewerPhotoPool(items, group, now).map(i => i.weight), [50,37,0]);
});

test("a tiny matching pool does not bypass history or stall the slideshow", () => {
  const group = {state:"matched",attributes:{matches:[{path:"a.jpg",people:1},{path:"b.jpg",people:2}],expires_at:"2026-11-07T18:00:15Z"}};
  assert.equal(selectViewerPhoto(items, group, ["b"], 50, () => 0, now), "a");
  assert.equal(selectViewerPhoto(items, group, ["b", "a"], 50, () => 0, now), "b");
});
test("photos become eligible only after falling out of configured history", () => {
  assert.equal(selectViewerPhoto(items, state(["b.jpg"]), ["b","a"], 1, () => 0, now), "b");
});
test("recognition offline uses rating weights and still advances if all photos are recent", () => {
  assert.equal(selectViewerPhoto(items, {state:"error"}, ["a","b"], 50, () => 0, now), "a");
});
test("history remains strict when the wider library contains alternatives", () => {
  const pool = [...items, {url:"d",path:"d.jpg",weight:1,orientation:"landscape"}];
  assert.equal(selectViewerPhoto(pool, state(["b.jpg"]), ["b","a"], 50, () => 0, now), "d");
});
test("a single eligible photo is returned instead of stalling", () => {
  assert.equal(selectViewerPhoto([items[0]], state(["a.jpg"]), ["a"], 50, () => 0, now), "a");
});
