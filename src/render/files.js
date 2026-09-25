/**
 * The `file` fence: download cards with a type glyph, size and kind, and an
 * expiry pill that counts down.
 *
 * Each card is a row: the 24px glyph, the name in mono, one meta line
 * (`48.2 MB · APK · Android package` plus the pill), an optional note, and the
 * actions on the right: Download (filled, with the `download` attribute), Open
 * in new tab, and Copy link, which the copy script handles through `data-copy`.
 * A list is the same rows on one surface with a hairline between.
 *
 * A card's expiry is its `expires`, or when its src is an S3 presign, the
 * signing time plus the lifetime. The server writes the date in UTC, which is
 * what a reader with scripts blocked sees. `FILES_SCRIPT` rewrites it in the
 * reader's zone, switches to a countdown inside 48 hours, and ticks once a
 * minute. A card already past its expiry renders expired: Download and Open are
 * replaced by a line saying so, and Copy link stays.
 *
 * @module render/files
 */

import { escapeHtml } from "./parse.js";
import { expiryLabel, fileType, fmtBytes, fmtWhen, signedExpiry } from "./filetypes.js";

/** @typedef {{ src: string, name: string, size: number, kind?: string, expires?: string, note?: string }} FileItem */

const icon = (key, cls) => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-${key}"/></svg>`;

/** When a file's link stops working, in epoch ms, or null when it does not say. */
export function expiryOf(item) {
  if (item.expires) return Date.parse(item.expires);
  const signed = signedExpiry(item.src);
  return signed === undefined || Number.isNaN(signed) ? null : signed;
}

const goneText = (ms, utc) => `This link expired ${fmtWhen(ms, utc)}. Ask for it to be republished.`;

/**
 * One card. `now` decides only whether it renders already expired; the pill
 * text itself is the UTC date, since a countdown written at render time would
 * be stale by the time anyone reads it.
 *
 * @param {FileItem} it
 * @param {number} now
 * @param {Set<string>} icons collects the glyph keys the sprite must carry
 */
function card(it, now, icons) {
  const type = fileType(it.name, it.kind);
  icons.add(type.icon);
  const src = escapeHtml(it.src);
  const name = escapeHtml(it.name);
  const exp = expiryOf(it);
  const gone = exp !== null && exp <= now;
  const meta = [fmtBytes(Number(it.size)), type.ext && type.ext.toUpperCase(), type.label].filter(Boolean).join(" · ");
  const pill = exp === null ? "" : gone
    ? `<span class="fc-pill critical">Expired</span>`
    : `<span class="fc-pill">Expires ${escapeHtml(fmtWhen(exp, true))}</span>`;
  const note = it.note ? `<div class="fc-note">${escapeHtml(it.note)}</div>` : "";
  const goneLine = exp === null ? "" : `<div class="fc-gone"${gone ? "" : " hidden"}>${escapeHtml(goneText(exp, true))}</div>`;
  const hide = gone ? " hidden" : "";
  const actions =
    `<a class="copy primary" data-live href="${src}" download="${name}"${hide}>${icon("download", "copy-icon")}<span>Download</span></a>` +
    `<a class="copy" data-live href="${src}" target="_blank" rel="noopener"${hide}>${icon("open", "copy-icon")}<span>Open in new tab</span></a>` +
    `<button type="button" class="copy" data-copy="${src}" hidden>${icon("copy", "copy-icon")}<span>Copy link</span></button>`;
  return `<div class="file"${exp === null ? "" : ` data-expires="${exp}"`}>` +
    `<svg class="ft-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${type.icon}"/></svg>` +
    `<div class="fc-main"><div class="fc-name">${name}</div><div class="fc-meta"><span>${escapeHtml(meta)}</span>${pill}</div>` +
    `${note}${goneLine}</div><div class="fc-actions">${actions}</div></div>`;
}

/**
 * Render a `file` block (normalized: `data` is always a list).
 *
 * @param {{ data: unknown }} block
 * @param {{ fileIcons: Set<string>, files: boolean }} ctx
 * @param {number} [now] epoch ms; tests pin it
 */
export function renderFiles(block, ctx, now = Date.now()) {
  const items = /** @type {FileItem[]} */ ((Array.isArray(block.data) ? block.data : [block.data])
    .filter((x) => x && typeof x === "object"));
  if (!items.length) return "";
  ctx.files = true;
  return `<div class="files">${items.map((it) => card(it, now, ctx.fileIcons)).join("")}</div>`;
}

/**
 * Keeps each card's pill current: the date in the reader's zone when more than
 * 48 hours out, a countdown inside that, and the expired state once it passes.
 * One interval for the page, once a minute, and it only rewrites text: no
 * per-second repaint and no animation.
 */
export const FILES_SCRIPT = `(() => {
  const expiryLabel = ${expiryLabel};
  const fmtWhen = ${fmtWhen};
  const cards = document.querySelectorAll(".file[data-expires]");
  if (!cards.length) return;
  const tick = () => {
    const now = Date.now();
    for (const card of cards) {
      const ms = Number(card.dataset.expires);
      const { text, tone, state } = expiryLabel(ms, now);
      const pill = card.querySelector(".fc-pill");
      pill.textContent = text;
      pill.className = tone ? "fc-pill " + tone : "fc-pill";
      const gone = state === "expired";
      const line = card.querySelector(".fc-gone");
      line.textContent = "This link expired " + fmtWhen(ms) + ". Ask for it to be republished.";
      line.hidden = !gone;
      for (const a of card.querySelectorAll("a[data-live]")) a.hidden = gone;
    }
  };
  tick();
  setInterval(tick, 60000);
})();`;
