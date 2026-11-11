/**
 * Google Meet–style tile packing: given N tiles in a W×H box, pick the column/row split whose
 * tiles fill the most area without becoming too extreme in aspect (so 3 people in a wide window
 * become 3 full-height columns, 4 become a 2×2, etc). Tiles FILL their cell (video is object-cover
 * cropped, avatars centred) — matching how Meet fills the stage.
 */
export interface GridPlan {
  cols: number;
  rows: number;
  /** Cell size the tiles fill. */
  tileW: number;
  tileH: number;
}

/** Above this, the grid caps visible tiles and shows a single "+K more" tile in the last slot. */
export const MAX_TILES = 16;

// A tile is "comfortable" between these aspects; outside the band its score is penalised so the
// packer avoids one-row-of-many (too wide) or one-tall-column (too narrow) arrangements.
const AR_LO = 9 / 16;
const AR_HI = 16 / 9;

export function bestGrid(
  n: number,
  width: number,
  height: number,
  opts: { gap?: number } = {},
): GridPlan {
  const gap = opts.gap ?? 8;
  if (n <= 0 || width <= 0 || height <= 0) return { cols: 0, rows: 0, tileW: 0, tileH: 0 };

  let best = { cols: 1, rows: n, cellW: 0, cellH: 0, score: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = (height - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const ar = cellW / cellH;
    const penalty = ar < AR_LO ? ar / AR_LO : ar > AR_HI ? AR_HI / ar : 1;
    const score = cellW * cellH * penalty;
    if (score > best.score) best = { cols, rows, cellW, cellH, score };
  }

  return {
    cols: best.cols,
    rows: best.rows,
    tileW: Math.floor(best.cellW),
    tileH: Math.floor(best.cellH),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Priority mosaic
 *
 * Equal packing is the wrong default for a committee: the delegate holding the floor and
 * the chair carry the room, while twenty camera-off attendees are just presence. The mosaic
 * splits the stage into two zones — two large heroes, and a stacked column of the next few
 * broadcasters whose last cell is a single "+N more" absorbing everyone else. Deliberately
 * no third zone of small tiles: below a readable size a tile is clutter, not presence.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The slice of a stage participant the tiering rules actually read. */
export interface MosaicSubject {
  uid: string;
  role?: string;
  camOff: boolean;
  hasFloor: boolean;
  /** You always get a tile — see the pin in `planMosaic`. */
  isLocal?: boolean;
}

export interface MosaicPlan<T extends MosaicSubject> {
  heroes: T[];
  mid: T[];
  /** Everyone left after the two zones — rendered as a single "+N more" cell under `mid`. */
  overflow: number;
}

export const MOSAIC_HEROES = 2;
export const MOSAIC_MID = 3;

/** Below these the mosaic reads worse than Meet packing — two people want two big halves. */
export const MOSAIC_MIN_WIDTH = 760;

/** True when the mosaic is worth it: enough room across, and enough people to tier. */
export function shouldMosaic(participants: MosaicSubject[], width: number): boolean {
  if (width < MOSAIC_MIN_WIDTH) return false;
  const audience = participants.filter((p) => p.camOff).length;
  return participants.length > 4 || audience > 0;
}

const isChair = (role?: string) => {
  const r = (role || "").toLowerCase();
  return r.includes("chair") && !r.includes("vice");
};

/**
 * Tier an already-ranked participant list (floor → local → live cameras → flags, as sorted in
 * LiveVideoRoom) into the two mosaic zones. Pure — no DOM, no measuring.
 */
export function planMosaic<T extends MosaicSubject>(participants: T[]): MosaicPlan<T> {
  const taken = new Set<string>();
  const take = (p: T) => { taken.add(p.uid); return p; };
  const free = () => participants.filter((p) => !taken.has(p.uid));

  // Heroes: the floor-holder, then the chair, then whoever is on camera.
  const heroes: T[] = [];
  const floor = participants.find((p) => p.hasFloor);
  if (floor) heroes.push(take(floor));
  const chair = participants.find((p) => !taken.has(p.uid) && isChair(p.role));
  if (chair && heroes.length < MOSAIC_HEROES) heroes.push(take(chair));
  for (const p of free()) {
    if (heroes.length >= MOSAIC_HEROES) break;
    if (p.camOff) continue;
    heroes.push(take(p));
  }
  // Both hero slots always fill, camera or not: with no small-tile zone to fall back on, a lone
  // chair stretched across the whole hero band reads worse than a flag sharing it.
  for (const p of free()) {
    if (heroes.length >= MOSAIC_HEROES) break;
    heroes.push(take(p));
  }

  // Mid: the next broadcasters, backfilled with audience when nobody else is on camera.
  const mid: T[] = [];
  for (const p of free()) {
    if (mid.length >= MOSAIC_MID) break;
    if (p.camOff) continue;
    mid.push(take(p));
  }
  for (const p of free()) {
    if (mid.length >= MOSAIC_MID) break;
    mid.push(take(p));
  }

  const overflow = free().length;

  // The "+N more" cell costs a mid slot, so dropping that tile adds it to the count.
  const plan: MosaicPlan<T> =
    overflow > 0 && mid.length >= MOSAIC_MID
      ? { heroes, mid: mid.slice(0, -1), overflow: overflow + 1 }
      : { heroes, mid, overflow };

  return pinLocal(participants, plan);
}

/**
 * YOU ALWAYS SEE YOURSELF.
 *
 * Both tiering loops skip `camOff`, so a camera-off local user is passed over twice and collapses
 * into "+N more". For a chair that also silently removes the procedure bar, which renders INSIDE
 * their own tile (LiveVideoRoom's `chairBar`) — the control disappears along with the tile and
 * there is no error to notice.
 *
 * Runs LAST, after the "+N more" accounting, because that step pops the final mid tile: pinning
 * before it just fed the local user straight back into the overflow it was rescuing them from.
 *
 * Only reachable when something already overflowed, so this SWAPS rather than appends — the
 * "+N more" cell already owns the leftover space, and growing `mid` would push it off the column.
 */
function pinLocal<T extends MosaicSubject>(participants: T[], plan: MosaicPlan<T>): MosaicPlan<T> {
  const local = participants.find((p) => p.isLocal);
  if (!local) return plan;
  if (plan.heroes.some((p) => p.uid === local.uid)) return plan;
  if (plan.mid.some((p) => p.uid === local.uid)) return plan;

  // Displace the least prominent shown tile; it takes the local user's place in the overflow count,
  // so the total stays exact.
  const dropped = plan.mid.length >= 1 ? 1 : 0;
  return {
    heroes: plan.heroes,
    mid: [...plan.mid.slice(0, plan.mid.length - dropped), local],
    overflow: plan.overflow - 1 + dropped,
  };
}
