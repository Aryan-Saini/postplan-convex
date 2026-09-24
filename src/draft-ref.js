/**
 * Turn whatever the user pasted into a draft id: a bare id, or any URL the server
 * hands out for it (`/d/<id>`, `/d/<id>/raw`, `/d/<id>/v/<n>`, `/d/<id>/v/<n>/raw`).
 * `version` is set when the URL pins one. Returns null for anything else.
 *
 * @param {string} input
 * @returns {{ draftId: string, version: number | null } | null}
 */
export function parseDraftRef(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    let pathname;
    try {
      pathname = new URL(text).pathname;
    } catch {
      return null;
    }
    const match = pathname.match(/^\/d\/([^/]+)(?:\/v\/(\d+))?(?:\/raw)?\/*$/);
    if (!match) return null;
    const draftId = decodeURIComponent(match[1]);
    return { draftId, version: match[2] ? Number(match[2]) : null };
  }

  return /^[A-Za-z0-9_-]+$/.test(text) ? { draftId: text, version: null } : null;
}
