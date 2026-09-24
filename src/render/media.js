/**
 * Load-failure panels for images and video.
 *
 * Every `<img>` and `<video>` a document renders is followed by a hidden
 * `.media-fail` panel. `MEDIA_SCRIPT` reveals it when the element fails at view
 * time and fills in what happened (an expired signed link, a missing file, an
 * unsupported video format, or no network) and the Open and Copy link actions.
 * The actions are added only on failure, so a page with many images does not
 * carry every URL three times. The panel is built from spans so it stays valid
 * inside the `<p>` a markdown image sits in.
 *
 * `linkState` and `failureText` are pure and exported for tests; the script
 * embeds their source, so the browser runs the same code the tests do.
 *
 * With scripts blocked the panel never shows; the `img::before/::after` rules in
 * `shell.js` draw a failed image's alt text in a hairline box instead.
 *
 * @module render/media
 */

import { unescapeHtml } from "./math.js";

/** @typedef {"image" | "video"} MediaKind */
/** @typedef {"expired" | "signed" | "plain" | "data"} LinkState */

/**
 * What kind of link a media src is. A URL carrying `X-Amz-Date` and
 * `X-Amz-Expires` is an S3 presign, and it is `expired` once `now` is past the
 * signing time plus the lifetime. Signed params that do not parse still count
 * as `signed`.
 *
 * @param {string} src
 * @param {number} [now] epoch milliseconds
 * @returns {LinkState}
 */
export function linkState(src, now = Date.now()) {
  if (/^data:/i.test(src)) return "data";
  let params;
  try {
    params = new URL(src, "https://base.invalid/").searchParams;
  } catch {
    return "plain";
  }
  const date = params.get("X-Amz-Date");
  const expires = params.get("X-Amz-Expires");
  if (date === null && expires === null) return "plain";
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(date || "");
  const seconds = Number(expires);
  if (!m || expires === null || !Number.isFinite(seconds)) return "signed";
  const signedAt = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return now > signedAt + seconds * 1000 ? "expired" : "signed";
}

/**
 * The panel's two lines for a failure. An expired link is reported first
 * because coming back online will not fix it; an unsupported format only
 * applies to video.
 *
 * @param {MediaKind} kind
 * @param {{ state: LinkState, offline: boolean, unsupported: boolean }} why
 * @returns {[title: string, cause: string]}
 */
export function failureText(kind, { state, offline, unsupported }) {
  if (state === "expired") {
    return ["This link has expired.", "Signed S3 links stop working after their time limit. Ask for the document to be republished."];
  }
  if (offline) return ["You're offline.", `This ${kind} will load when you're back online.`];
  if (unsupported && kind === "video") {
    return ["This video format isn't supported here.", "Use an mp4 with H.264 video and AAC audio."];
  }
  const title = `Couldn't load this ${kind}.`;
  if (state === "signed") return [title, "The file may have been moved or removed from storage."];
  if (state === "data") return [title, "The embedded file data could not be read."];
  return [title, "The server did not return the file."];
}

const icon = (key, cls) => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-${key}"/></svg>`;

/** An attribute's value from a tag in any quoting style, decoded, or "". */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? unescapeHtml(m[1] ?? m[2] ?? m[3]) : "";
}

/**
 * The hidden panel for one media element. `tag` is the element's markup, read
 * for its width/height, which fix the panel's aspect ratio.
 *
 * @param {MediaKind} kind
 * @param {string} tag
 */
export function failPanel(kind, tag) {
  const w = Number(attr(tag, "width"));
  const h = Number(attr(tag, "height"));
  const ratio = w > 0 && h > 0 ? ` style="aspect-ratio:${w}/${h}"` : "";
  return `<span class="media-fail" data-kind="${kind}" role="status" hidden${ratio}>${icon(`${kind}-off`, "mf-icon")}` +
    `<span class="mf-title">Couldn't load this ${kind}.</span><span class="mf-cause"></span><span class="mf-actions"></span></span>`;
}

// A link is matched whole so a panel (which holds links) never lands inside it.
const MEDIA = /<a\b[^>]*>[\s\S]*?<\/a>|<video\b[\s\S]*?<\/video>|<img\b[^>]*>/gi;

/**
 * Put a failure panel after every image and video in an HTML fragment. An
 * image inside a link gets its panel after the link.
 *
 * @param {string} html
 * @param {{ media: boolean }} ctx set when a panel was added, so the document carries the script
 */
export function withFailPanels(html, ctx) {
  return html.replace(MEDIA, (tag) => {
    if (/^<a\b/i.test(tag)) {
      const imgs = tag.match(/<img\b[^>]*>/gi) ?? [];
      if (imgs.length) ctx.media = true;
      return tag + imgs.map((img) => failPanel("image", img)).join("");
    }
    ctx.media = true;
    return tag + failPanel(/^<video/i.test(tag) ? "video" : "image", tag);
  });
}

/**
 * Reveals a panel when its media fails. Listeners go on each element at load
 * (no inline handlers: the upload policy rejects them), and an image that
 * failed before this ran is caught by `complete && naturalWidth === 0`. The
 * actions are the outlined pills: "Open in new tab" and "Copy link", which the
 * copy script handles through `data-copy`. A data: src gets neither, since a
 * tab will not open one. A failed zoom thumbnail loses its lightbox link. Panels shown for being offline
 * reset and retry when the network comes back.
 */
export const MEDIA_SCRIPT = `(() => {
  const linkState = ${linkState};
  const failureText = ${failureText};
  const hostOf = (el) => el.closest("a") || el;
  const panelOf = (el) => {
    const next = hostOf(el).nextElementSibling;
    return next && next.classList.contains("media-fail") ? next : null;
  };
  const srcOf = (el) => {
    if (el.tagName === "IMG") return el.currentSrc || el.getAttribute("src") || "";
    const source = el.querySelector("source");
    return el.currentSrc || el.getAttribute("src") || (source && source.getAttribute("src")) || "";
  };
  const pill = (tag, icon, text) => {
    const el = document.createElement(tag);
    el.className = "copy";
    el.innerHTML = '<svg class="copy-icon" viewBox="0 0 16 16" aria-hidden="true"><use href="#icon-' + icon + '"/></svg><span></span>';
    el.lastChild.textContent = text;
    return el;
  };
  const actions = (panel, src) => {
    const box = panel.querySelector(".mf-actions");
    if (!src || /^data:/i.test(src) || box.firstChild) return;
    const open = pill("a", "open", "Open in new tab");
    open.href = src;
    open.target = "_blank";
    open.rel = "noopener";
    const copy = pill("button", "copy", "Copy link");
    copy.type = "button";
    copy.dataset.copy = src;
    box.append(open, copy);
  };
  const fail = (el, unsupported) => {
    const panel = panelOf(el);
    if (!panel || !panel.hidden) return;
    const offline = !navigator.onLine;
    const src = srcOf(el);
    const [title, cause] = failureText(panel.dataset.kind, { state: linkState(src, Date.now()), offline, unsupported });
    panel.querySelector(".mf-title").textContent = title;
    panel.querySelector(".mf-cause").textContent = cause;
    actions(panel, src);
    panel.dataset.offline = offline ? "1" : "";
    panel.hidden = false;
    el.hidden = true;
    const host = hostOf(el);
    if (host.matches("a.zoom")) {
      host.dataset.href = host.getAttribute("href") || "";
      host.removeAttribute("href");
      host.setAttribute("aria-disabled", "true");
    }
  };
  for (const img of document.querySelectorAll("img")) {
    if (!panelOf(img)) continue;
    img.addEventListener("error", () => fail(img, false));
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) img.decode().catch(() => fail(img, false));
  }
  for (const video of document.querySelectorAll("video")) {
    if (!panelOf(video)) continue;
    const sources = video.querySelectorAll("source");
    const last = sources[sources.length - 1];
    const unsupported = () => (video.error && video.error.code === 4) || (!!last && !!last.type && video.canPlayType(last.type) === "");
    if (last) last.addEventListener("error", () => fail(video, unsupported()));
    video.addEventListener("error", () => fail(video, unsupported()));
    // Every source already failed: no source left and nothing loaded.
    setTimeout(() => { if (video.networkState === 3 && video.readyState === 0) fail(video, unsupported()); }, 0);
  }
  addEventListener("online", () => {
    for (const panel of document.querySelectorAll(".media-fail[data-offline='1']")) {
      const host = panel.previousElementSibling;
      const el = host && (host.matches("img, video") ? host : host.querySelector("img"));
      if (!el) continue;
      panel.hidden = true;
      el.hidden = false;
      if (host.dataset.href) host.setAttribute("href", host.dataset.href), host.removeAttribute("aria-disabled");
      if (el.tagName === "VIDEO") el.load();
      else el.src = el.getAttribute("src");
    }
  });
})();`;
