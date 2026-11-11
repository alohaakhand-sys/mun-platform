/**
 * Session-chat folding + thread keying.
 *
 * Also a purity guard, like the roll-call suite: this runs in a plain node environment with no
 * Firebase config, so if `sessionChatModel.ts` ever gains a value-import of `sessionChatService`
 * every case here fails at import time.
 */
import { describe, it, expect } from "vitest";
import {
  BROADCAST_THREAD, CHAT_MAX_CHARS,
  foldThreads, normalizeChatText, threadKeyFor, totalUnread,
  type SessionChatMessage,
} from "./sessionChatModel";

const T0 = 1_700_000_000_000;

function msg(over: Partial<SessionChatMessage> = {}): SessionChatMessage {
  return {
    threadKey: "u_in", fromRole: "delegate", fromUid: "u_in", fromName: "Rahim",
    country: "India", text: "hello", sentAt: T0, ...over,
  };
}

describe("threadKeyFor", () => {
  const attendance = { u_in: { country: "India" }, u_fr: { country: "" } };

  it("returns the uid for anyone on the roll", () => {
    expect(threadKeyFor(attendance, "u_in")).toBe("u_in");
  });

  it("still returns the uid when the delegation label is blank — the key is never the country", () => {
    expect(threadKeyFor(attendance, "u_fr")).toBe("u_fr");
  });

  it("returns null off the roll, so the caller disables the composer instead of writing", () => {
    expect(threadKeyFor(attendance, "u_ghost")).toBeNull();
    expect(threadKeyFor(undefined, "u_in")).toBeNull();
    expect(threadKeyFor(attendance, "")).toBeNull();
  });
});

describe("normalizeChatText", () => {
  it("trims", () => expect(normalizeChatText("  hi  ")).toBe("hi"));
  it("clamps to the ceiling the rules enforce", () => {
    expect(normalizeChatText("x".repeat(CHAT_MAX_CHARS + 50))).toHaveLength(CHAT_MAX_CHARS);
  });
});

describe("foldThreads", () => {
  it("returns nothing for an empty feed", () => {
    expect(foldThreads([], {}, "dais")).toEqual([]);
  });

  it("groups one delegate's messages, oldest first, and carries the display labels", () => {
    const out = foldThreads([
      msg({ text: "second", sentAt: T0 + 1000 }),
      msg({ text: "first", sentAt: T0 }),
    ], {}, "dais");

    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("u_in");
    expect(out[0].messages.map((m) => m.text)).toEqual(["first", "second"]);
    expect(out[0].lastText).toBe("second");
    expect(out[0].lastAt).toBe(T0 + 1000);
    expect(out[0].country).toBe("India");
    expect(out[0].name).toBe("Rahim");
  });

  it("orders threads by most recent activity", () => {
    const out = foldThreads([
      msg({ threadKey: "u_in", fromUid: "u_in", sentAt: T0 }),
      msg({ threadKey: "u_fr", fromUid: "u_fr", country: "France", sentAt: T0 + 5000 }),
    ], {}, "dais");
    expect(out.map((t) => t.key)).toEqual(["u_fr", "u_in"]);
  });

  it("pins the broadcast lane first even when it is the stalest thread", () => {
    const out = foldThreads([
      msg({ threadKey: BROADCAST_THREAD, fromRole: "dais", fromUid: "u_chair", country: "", sentAt: T0 }),
      msg({ threadKey: "u_in", sentAt: T0 + 90_000 }),
    ], {}, "delegate");
    expect(out[0].key).toBe(BROADCAST_THREAD);
    expect(out[0].isBroadcast).toBe(true);
    expect(out[1].isBroadcast).toBe(false);
  });

  it("counts only the OTHER side as unread — the dais never sees its own replies as unread", () => {
    const feed = [
      msg({ text: "a", sentAt: T0 }),
      msg({ text: "b", sentAt: T0 + 1 }),
      msg({ fromRole: "dais", fromUid: "u_chair", fromName: "Chair", text: "noted", sentAt: T0 + 2 }),
    ];
    expect(foldThreads(feed, {}, "dais")[0].unread).toBe(2);   // the two delegate notes
    expect(foldThreads(feed, {}, "delegate")[0].unread).toBe(1); // the one dais reply
  });

  it("treats an absent seen-stamp as everything unread", () => {
    const out = foldThreads([msg(), msg({ sentAt: T0 + 1 })], {}, "dais");
    expect(out[0].unread).toBe(2);
  });

  it("clears unread up to the seen stamp, inclusive", () => {
    const feed = [msg({ sentAt: T0 }), msg({ sentAt: T0 + 10 }), msg({ sentAt: T0 + 20 })];
    expect(foldThreads(feed, { u_in: T0 + 10 }, "dais")[0].unread).toBe(1);
    expect(foldThreads(feed, { u_in: T0 + 20 }, "dais")[0].unread).toBe(0);
  });

  it("clamps to zero when the seen stamp is ahead of the feed (clock skew, another device)", () => {
    expect(foldThreads([msg()], { u_in: T0 + 999_999 }, "dais")[0].unread).toBe(0);
  });

  it("keeps seen stamps per thread — reading one delegate does not clear another", () => {
    const out = foldThreads([
      msg({ threadKey: "u_in", fromUid: "u_in" }),
      msg({ threadKey: "u_fr", fromUid: "u_fr", country: "France" }),
    ], { u_in: T0 }, "dais");
    expect(out.find((t) => t.key === "u_in")!.unread).toBe(0);
    expect(out.find((t) => t.key === "u_fr")!.unread).toBe(1);
  });

  it("skips rows with no thread key rather than inventing a bucket", () => {
    expect(foldThreads([msg({ threadKey: "" })], {}, "dais")).toEqual([]);
  });

  it("leaves the labels blank on a dais-only thread — there is no delegate message to read them from", () => {
    const out = foldThreads([
      msg({ threadKey: "u_new", fromRole: "dais", fromUid: "u_chair", country: "", fromName: "Chair" }),
    ], {}, "dais");
    expect(out[0].country).toBe("");
    expect(out[0].name).toBe("");
  });
});

describe("totalUnread", () => {
  it("sums every thread", () => {
    const out = foldThreads([
      msg({ threadKey: "u_in", fromUid: "u_in", sentAt: T0 }),
      msg({ threadKey: "u_fr", fromUid: "u_fr", sentAt: T0 + 1 }),
      msg({ threadKey: "u_fr", fromUid: "u_fr", sentAt: T0 + 2 }),
    ], {}, "dais");
    expect(totalUnread(out)).toBe(3);
  });

  it("is zero for an empty fold", () => expect(totalUnread([])).toBe(0));
});
