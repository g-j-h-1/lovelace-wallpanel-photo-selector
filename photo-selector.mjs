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

/** Select a single image from the full pool on every transition. */
export function selectPhoto(items, recent = [], historySize = 5, random = Math.random) {
  const pool = items.filter(item => Number.isFinite(Number(item.weight)) && Number(item.weight) > 0);
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
  const total = eligible.reduce((sum, item) => sum + Number(item.weight), 0);
  let ticket = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
  for (const item of eligible) {
    ticket -= Number(item.weight);
    if (ticket < 0) return item.url;
  }
  return eligible.at(-1).url;
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

/** Boost rating weights for remembered visitors; keep the full library available. */
export function viewerPhotoPool(items, state, now = Date.now()) {
  const expires = Date.parse(state?.attributes?.expires_at || "");
  const matches = state?.attributes?.matches;
  if (state?.state !== "matched" || !Number.isFinite(expires) || expires <= now || !Array.isArray(matches)) return items;
  const counts = new Map(matches.filter(m => m && typeof m.path === "string" && Number.isInteger(m.people) && m.people > 0).map(m => [m.path, m.people]));
  return items.map(item => {
    const people = Math.min(100, counts.get(item.path) || 0);
    return { ...item, weight: Number(item.weight) * (1 + 9 * people * people) };
  });
}

/** Keep history strict while alternatives exist, releasing oldest entries on exhaustion. */
export function selectViewerPhoto(items, state, recent = [], historySize = 50, random = Math.random, now = Date.now()) {
  const size = Math.max(0, Math.floor(Number(historySize) || 0));
  const weighted = viewerPhotoPool(items, state, now).filter(item => Number.isFinite(item.weight) && item.weight > 0);
  if (!weighted.length) return null;
  const last = recent.at(-1);
  const pool = weighted.length > 1 ? weighted.filter(item => item.url !== last) : weighted;
  let history = size ? recent.slice(-size) : [];
  let available = pool.filter(item => !history.includes(item.url));
  while (!available.length && history.length) {
    history = history.slice(1);
    available = pool.filter(item => !history.includes(item.url));
  }
  if (!available.length) available = pool;
  const previous = weighted.find(item => item.url === last);
  if (previous?.orientation === "portrait" && available.some(item => item.orientation === "landscape")) {
    available = available.filter(item => item.orientation === "landscape");
  }
  return selectPhoto(available, [], 0, random);
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
      ? { url, path: photo.path, weight: getRatingFrequency(photo.rating, ratingFrequencies), orientation: photo.orientation }
      : null;
  });
  return candidates.filter(Boolean);
}
