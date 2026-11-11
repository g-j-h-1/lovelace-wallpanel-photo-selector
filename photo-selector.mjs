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

/**
 * Apply weighted random early drop (WRED) to recent-history exclusions.
 * The newest half remains protected. Photos in the oldest half become
 * increasingly eligible with age (linear probability from 0 to 1).
 * The final displayed image is always protected when history is enabled.
 */
export function wredHistoryEligibility(items, recent = [], historySize = 5, random = Math.random) {
  const history = recent.slice(-Math.max(0, Math.floor(Number(historySize) || 0)));
  if (!history.length) return items;
  const protectedCount = Math.ceil(history.length / 2);
  const oldestCount = history.length - protectedCount;
  const latestIndex = new Map(history.map((url, index) => [url, index]));
  return items.filter(item => {
    const index = latestIndex.get(item.url);
    if (index === undefined) return true;
    if (index >= oldestCount) return false;
    // Oldest entry is fully eligible; more recent entries progressively less so.
    return random() < (oldestCount - index) / oldestCount;
  });
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
  const preferred = new Set(preferredNames.map(name => String(name).trim().toLocaleLowerCase()).filter(Boolean));
  const matchCount = item => new Set((item.people || [])
    .map(name => String(name).trim().toLocaleLowerCase())
    .filter(name => preferred.has(name))).size;

  // History eligibility comes BEFORE facial-recognition preference. Never
  // re-admit a recent recognised-person photo just because its pool is small.
  // The newest half of history is strictly excluded; the older half is
  // available with an age-dependent selection weight.
  const historyIndex = new Map(history.map((url, index) => [url, index]));
  const olderCount = Math.floor(history.length / 2);
  const candidates = oriented.map(item => {
    const index = historyIndex.get(item.url);
    if (index !== undefined && index >= olderCount) return null;
    // Entries outside history have full weight. In the older half, the oldest
    // gets full weight and the youngest gets 1/olderCount of its normal weight.
    const ageFactor = index === undefined ? 1 : (olderCount - index) / olderCount;
    return { ...item, weight: Number(item.weight) * ageFactor };
  }).filter(Boolean);
  if (!candidates.length) return null;

  const bestCount = preferred.size ? Math.max(0, ...candidates.map(matchCount)) : 0;
  const eligible = bestCount > 0 ? candidates.filter(item => matchCount(item) === bestCount) : candidates;
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
