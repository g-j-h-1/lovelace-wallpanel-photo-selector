/**
 * Photo ordering for the WallPanel Photo Selector.
 * Kept independent of the card so the selection rules can be unit-tested.
 */
export const DEFAULT_RATING_FREQUENCIES = Object.freeze({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 });

export function getRatingFrequency(rating, frequencies = {}) {
  const key = String(Math.max(0, Math.min(5, Number(rating) || 0)));
  const configured = frequencies && Object.prototype.hasOwnProperty.call(frequencies, key)
    ? Number(frequencies[key])
    : DEFAULT_RATING_FREQUENCIES[key];
  return Number.isFinite(configured) ? Math.max(0, configured) : DEFAULT_RATING_FREQUENCIES[key];
}

/** Cap recent-history exclusions to 25% of selectable photographs. */
export function effectiveHistorySize(items, configuredSize = 5) {
  const eligibleCount = items.filter(item => Number.isFinite(Number(item.weight)) && Number(item.weight) > 0).length;
  const requested = Math.max(0, Math.floor(Number(configuredSize) || 0));
  return Math.min(requested, Math.floor(eligibleCount / 4));
}

/** Append a photo, evicting a weighted-random member of the oldest half at capacity. */
export function appendWeightedHistory(recent = [], selected, size = 5, random = Math.random) {
  const limit = Math.max(0, Math.floor(Number(size) || 0));
  if (!limit) return [];
  const history = recent.slice(-limit);
  if (!selected) return history;
  const next = history.filter(url => url !== selected);
  if (next.length >= limit) {
    const oldestCount = Math.ceil(limit / 2);
    const total = oldestCount * (oldestCount + 1) / 2;
    let ticket = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
    let removeIndex = oldestCount - 1;
    for (let i = 0; i < oldestCount; i++) {
      ticket -= oldestCount - i;
      if (ticket < 0) { removeIndex = i; break; }
    }
    next.splice(removeIndex, 1);
  }
  next.push(selected);
  return next;
}

/** Select a single image from the full pool on every transition. */
export function selectPhoto(items, recent = [], historySize = 5, random = Math.random, preferredNames = [], excludedNames = []) {
  const excluded = new Set(excludedNames.map(name => String(name).trim().toLocaleLowerCase()).filter(Boolean));
  const pool = items.filter(item => Number.isFinite(Number(item.weight)) && Number(item.weight) > 0 &&
    !(item.people || []).some(name => excluded.has(String(name).trim().toLocaleLowerCase())));
  if (!pool.length) return null;
  const last = recent.at(-1);
  const previous = pool.find(item => item.url === last);
  const requireLandscape = previous?.orientation === "portrait" && pool.some(item => item.orientation === "landscape");
  const oriented = requireLandscape ? pool.filter(item => item.orientation === "landscape") : pool;
  const cappedHistorySize = effectiveHistorySize(pool, historySize);
  const history = cappedHistorySize > 0 ? recent.slice(-cappedHistorySize) : [];
  let eligible = oriented.filter(item => !history.includes(item.url));
  // For small collections relax the oldest exclusions, never rating-zero exclusions.
  for (let n = 1; !eligible.length && n <= history.length; n++) {
    eligible = oriented.filter(item => !history.slice(n).includes(item.url));
  }
  if (!eligible.length) eligible = oriented;
  // Prefer identified people after rating, orientation and recent-history exclusions.
  // If no eligible matching photograph exists, retain the ordinary slideshow.
  const preferred = new Set(preferredNames.map(name => String(name).trim().toLocaleLowerCase()).filter(Boolean));
  if (preferred.size) {
    // Prefer the photograph containing the greatest number of currently
    // recognised people, rather than treating any single match equally.
    const matchCount = item => new Set((item.people || [])
      .map(name => String(name).trim().toLocaleLowerCase())
      .filter(name => preferred.has(name))).size;
    const bestCount = Math.max(0, ...eligible.map(matchCount));
    if (bestCount > 0) eligible = eligible.filter(item => matchCount(item) === bestCount);
  }
  const total = eligible.reduce((sum, item) => sum + Number(item.weight), 0);
  let ticket = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (const item of eligible) {
    ticket -= Number(item.weight);
    if (ticket < 0) return item.url;
  }
  return eligible.at(-1).url;
}

/** Parse the optional Home Assistant recognised-people text helper. */
export function parseRecognisedPeople(value) {
  if (typeof value !== "string") return [];
  const ignored = new Set(["none", "unknown", "unavailable", "null", "undefined"]);
  const names = value.split(",").map(name => name.trim())
    .filter(name => name && !ignored.has(name.toLowerCase()));
  return [...new Set(names)];
}

export function filterPhotos(items, include = "", exclude = "") {
  const includeRegex = include ? new RegExp(include, "i") : null;
  const excludeRegex = exclude ? new RegExp(exclude, "i") : null;
  return items.filter(item => {
    const encodedFilename = item.url.split("?")[0].split("/").at(-1);
    let filename = encodedFilename;
    try {
      filename = decodeURIComponent(encodedFilename);
    } catch (_error) {
      // An invalid URL escape must not abort the entire slideshow.
    }
    return (!includeRegex || includeRegex.test(filename)) && (!excludeRegex || !excludeRegex.test(filename));
  });
}
/**
 * Match Home Assistant media-source IDs to scanner-relative photo metadata.
 * WallPanel's media browser supplies IDs such as
 * media-source://media_source/local/PortalPhotos/album/photo.jpg.
 */
export function matchPhotoMetadata(urls, photos, mediaFolder = "PortalPhotos", ratingFrequencies = {}) {
  const metadata = new Map((photos || []).map((photo) => [photo.path, photo]));
  const folderPrefix = mediaFolder ? `${mediaFolder}/` : "";
  const candidates = urls.map((url) => {
    const marker = "/local/";
    const position = url.indexOf(marker);
    if (position < 0) return null;
    let relativePath;
    try {
      relativePath = decodeURIComponent(url.slice(position + marker.length));
    } catch (_error) {
      relativePath = url.slice(position + marker.length);
    }
    if (folderPrefix) {
      if (!relativePath.startsWith(folderPrefix)) return null;
      relativePath = relativePath.slice(folderPrefix.length);
    }
    const photo = metadata.get(relativePath);
    return photo
      ? { url, weight: getRatingFrequency(photo.rating, ratingFrequencies), orientation: photo.orientation, people: Array.isArray(photo.people) ? photo.people : [] }
      : null;
  });
  return candidates.filter(Boolean);
}
