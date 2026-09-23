/**
 * `flow` and `sequence` fences.
 *
 * Both primitives in `diagram.mjs` throw when an edge or a message names
 * something that does not exist, so the reference checks here are what keep a
 * bad diagram a diagnostic rather than a crash.
 *
 * @module render/schema/diagram
 */

import {
  Ctx, ptr, show, wantObject, wantArray, wantNonEmptyArray, wantText,
  optionalString, optionalBoolean, optionalEnum, unknownKeys,
} from "./common.js";

/** Node shapes `flow()` draws. */
export const NODE_SHAPES = /** @type {const} */ (["box", "round", "diamond", "store"]);

/** Tones a flow node may carry; `bad` is the rejection path in the gallery. */
const NODE_TONES = /** @type {const} */ (["good", "warn", "bad", "flat"]);

/**
 * `{ cols: [[node]], edges: [{ from, to, label? }] }`. Node ids are unique
 * across every column and every edge endpoint must name one.
 */
export function validateFlow(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "flow");
  if (!wantObject(ctx, block.data, "", "an object { cols, edges }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  unknownKeys(ctx, body, "", ["title", "note", "cols", "edges"]);

  /** @type {Set<string>} */
  const ids = new Set();
  if (wantNonEmptyArray(ctx, body.cols, "/cols", "at least one column")) {
    /** @type {unknown[]} */ (body.cols).forEach((col, c) => {
      const cp = ptr("", "cols", c);
      if (!wantNonEmptyArray(ctx, col, cp, "at least one node")) return;
      /** @type {unknown[]} */ (col).forEach((node, r) => {
        const np = ptr(cp, r);
        if (!wantObject(ctx, node, np, "a node { id, label }")) return;
        if (wantText(ctx, node.id, ptr(np, "id"), "a node id")) {
          const id = /** @type {string} */ (node.id);
          if (ids.has(id)) ctx.at(ptr(np, "id"), `duplicate node id ${JSON.stringify(id)}; ids must be unique across columns`);
          ids.add(id);
        }
        wantText(ctx, node.label, ptr(np, "label"), "a node label");
        optionalEnum(ctx, node.shape, ptr(np, "shape"), NODE_SHAPES);
        optionalEnum(ctx, node.tone, ptr(np, "tone"), NODE_TONES);
        unknownKeys(ctx, node, np, ["id", "label", "shape", "tone"]);
      });
    });
  }

  if (wantArray(ctx, body.edges, "/edges", "an array of edges")) {
    /** @type {unknown[]} */ (body.edges).forEach((edge, i) => {
      const ep = ptr("", "edges", i);
      if (!wantObject(ctx, edge, ep, "an edge { from, to }")) return;
      for (const end of /** @type {const} */ (["from", "to"])) {
        if (!wantText(ctx, edge[end], ptr(ep, end), "a node id")) continue;
        if (!ids.has(/** @type {string} */ (edge[end]))) {
          ctx.at(ptr(ep, end), `no node with id ${show(edge[end])}; ids: ${[...ids].join(" ")}`);
        }
      }
      optionalString(ctx, edge.label, ptr(ep, "label"));
      unknownKeys(ctx, edge, ep, ["from", "to", "label"]);
    });
  }
}

/**
 * `{ actors: [name], msgs: [{ from, to, label, dashed?, note? }] }`. Every
 * endpoint has to be one of the declared actors; `sequence()` throws otherwise.
 */
export function validateSequence(errors, block, file) {
  const ctx = new Ctx(errors, file, block.line, "sequence");
  if (!wantObject(ctx, block.data, "", "an object { actors, msgs }")) return;
  const body = /** @type {Record<string, unknown>} */ (block.data);

  optionalString(ctx, body.title, "/title");
  optionalString(ctx, body.note, "/note");
  unknownKeys(ctx, body, "", ["title", "note", "actors", "msgs"]);

  /** @type {Set<string>} */
  const actors = new Set();
  if (wantNonEmptyArray(ctx, body.actors, "/actors", "at least one actor")) {
    /** @type {unknown[]} */ (body.actors).forEach((a, i) => {
      const ap = ptr("", "actors", i);
      if (!wantText(ctx, a, ap, "an actor name")) return;
      const name = /** @type {string} */ (a);
      if (actors.has(name)) ctx.at(ap, `duplicate actor ${JSON.stringify(name)}; a lane is addressed by name`);
      actors.add(name);
    });
  }

  if (wantNonEmptyArray(ctx, body.msgs, "/msgs", "at least one message")) {
    /** @type {unknown[]} */ (body.msgs).forEach((msg, i) => {
      const mp = ptr("", "msgs", i);
      if (!wantObject(ctx, msg, mp, "a message { from, to, label }")) return;
      for (const end of /** @type {const} */ (["from", "to"])) {
        if (!wantText(ctx, msg[end], ptr(mp, end), "an actor name")) continue;
        if (!actors.has(/** @type {string} */ (msg[end]))) {
          ctx.at(ptr(mp, end), `no actor named ${show(msg[end])}; actors: ${[...actors].join(" ")}`);
        }
      }
      wantText(ctx, msg.label, ptr(mp, "label"), "a message label");
      optionalBoolean(ctx, msg.dashed, ptr(mp, "dashed"));
      optionalString(ctx, msg.note, ptr(mp, "note"));
      unknownKeys(ctx, msg, mp, ["from", "to", "label", "dashed", "note"]);
    });
  }
}
