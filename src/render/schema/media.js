/**
 * `timeline`, `slides` and `video` fences.
 *
 * @module render/schema/media
 */

import {
  Ctx, ptr, wantObject, wantNonEmptyArray, wantText, optionalString,
  optionalEnum, wantUrl, unknownKeys,
} from "./common.js";

/** Where an entry sits relative to now; drives the marker's fill. */
export const TIMELINE_STATES = /** @type {const} */ (["done", "now", "next"]);

/** `[{ when, what, note?, state? }]` in source order. */
export function validateTimeline(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "timeline");
  if (!wantNonEmptyArray(ctx, block.data, "", "at least one entry")) return;

  /** @type {unknown[]} */ (block.data).forEach((item, i) => {
    const at = ptr("", i);
    if (!wantObject(ctx, item, at, "an entry { when, what }")) return;
    // `when` is display text ("Aug 12", "Next"), not a date: a timeline is
    // ordered by the author, unlike `chart schedule` which is drawn to scale.
    wantText(ctx, item.when, ptr(at, "when"), "a date label");
    wantText(ctx, item.what, ptr(at, "what"), "an entry title");
    optionalString(ctx, item.note, ptr(at, "note"));
    optionalEnum(ctx, item.state, ptr(at, "state"), TIMELINE_STATES);
    unknownKeys(ctx, item, at, ["when", "what", "note", "state"]);
  });
}

/** `[{ src, caption?, alt? }]`, one entry per slide. */
export function validateSlides(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "slides");
  if (!wantNonEmptyArray(ctx, block.data, "", "at least one slide")) return;

  /** @type {unknown[]} */ (block.data).forEach((slide, i) => {
    const at = ptr("", i);
    if (!wantObject(ctx, slide, at, "a slide { src }")) return;
    wantUrl(ctx, slide.src, ptr(at, "src"));
    optionalString(ctx, slide.caption, ptr(at, "caption"));
    optionalString(ctx, slide.alt, ptr(at, "alt"));
    unknownKeys(ctx, slide, at, ["src", "caption", "alt"]);
  });
}

/** `{ src, poster?, caption? }`: one clip, never a bare link. */
export function validateVideo(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "video");
  if (!wantObject(ctx, block.data, "", "an object { src }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  wantUrl(ctx, body.src, "/src");
  if (body.poster !== undefined) wantUrl(ctx, body.poster, "/poster");
  optionalString(ctx, body.caption, "/caption");
  unknownKeys(ctx, body, "", ["src", "poster", "caption"]);
}
