"use client";

/**
 * Live MUN video engine (Agora Interactive Live Streaming).
 *
 * Chairs/EB join as broadcasters (host) and publish camera+mic immediately. Delegates
 * join as audience in ultra-low latency and only publish when the chair puts them on the
 * floor — signalled by their uid appearing in `session.live.stage`, which this hook watches
 * live. Promotion re-requests a publisher token, switches the client role, and publishes;
 * demotion reverses it. The token role is authoritative (issued by our server), so a client
 * cannot self-promote.
 *
 * SSR-safe: the Agora SDK is imported lazily inside the effect (never at module top level),
 * so this survives Next.js prerendering. Guarded against React 19 strict-mode double-mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IAgoraRTCClient, IAgoraRTCRemoteUser, ICameraVideoTrack, IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { makeSessionId, subscribeSession } from "@/lib/services/sessionService";
import { ceremonySessionId, type CeremonyKind } from "@/lib/services/liveControlService";
import { fetchAgoraToken } from "./token";

export interface AgoraLiveState {
  configured: boolean;                       // NEXT_PUBLIC_AGORA_APP_ID present
  connecting: boolean;
  joined: boolean;
  publishing: boolean;                       // we are a live broadcaster
  /**
   * What the token server granted on the last token: true = may broadcast, false = audience
   * only (e.g. a marking-only staffer the console shows host controls to), null = not asked yet.
   * The server decides this, so it is the one to label controls by.
   */
  hostGranted: boolean | null;
  role: "host" | "audience";
  onStage: boolean;                          // our uid is on the chair-granted stage
  sessionEnded: boolean;                     // chair closed / finalized the session → video off
  remoteUsers: IAgoraRTCRemoteUser[];        // remote broadcasters (chairs + active speaker)
  localCameraTrack: ICameraVideoTrack | null;
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  toggleMic: () => void;
  toggleCam: () => void;
  screenSharing: boolean;                     // we are sharing our screen (swaps the camera)
  localScreenTrack: any | null;
  screenSupported: boolean;                   // browser exposes getDisplayMedia
  toggleScreenShare: () => void;
}

function dedupe(users: IAgoraRTCRemoteUser[]): IAgoraRTCRemoteUser[] {
  const map = new Map<string | number, IAgoraRTCRemoteUser>();
  for (const u of users) map.set(u.uid, u);
  return Array.from(map.values());
}

/** Friendly message for a camera-acquisition failure. */
function cameraErrorMessage(e: any): string {
  const name = `${e?.name || ""} ${e?.code || ""} ${e?.message || ""}`;
  if (name.includes("NotReadable") || name.includes("NOT_READABLE"))
    return "Camera is in use by another app or tab — broadcasting audio only.";
  if (name.includes("NotAllowed") || name.includes("Permission") || name.includes("PERMISSION_DENIED"))
    return "Camera/mic permission denied — check your browser settings.";
  if (name.includes("NotFound") || name.includes("DEVICES_NOT_FOUND"))
    return "No camera found — broadcasting audio only.";
  return "Camera unavailable — broadcasting audio only.";
}

// Agora log levels: N shows severity N and above (0 DEBUG … 3 ERROR, 4 NONE).
const AGORA_LOG_BASELINE = 2; // WARNING+ERROR (cuts INFO/DEBUG chatter)

/**
 * Run an Agora device-track factory with the SDK's console output muted, so a handled
 * "camera in use / not found" failure doesn't spam console.error and trip the Next.js dev
 * error overlay. We surface a friendly message ourselves. Real (unhandled) errors elsewhere
 * still log at the baseline level.
 */
async function quietly(AgoraRTC: any, fn: () => Promise<any>): Promise<any> {
  try { AgoraRTC.setLogLevel?.(4); } catch { /* noop */ }
  try { return await fn(); }
  finally { try { AgoraRTC.setLogLevel?.(AGORA_LOG_BASELINE); } catch { /* noop */ } }
}

/** Enumerate inputs (no permission prompt) so we can say "unavailable" without calling the SDK. */
async function probeDevices(AgoraRTC: any): Promise<{ hasCam: boolean; hasMic: boolean }> {
  try {
    const [cams, mics] = await Promise.all([
      AgoraRTC.getCameras?.(true).catch(() => []),
      AgoraRTC.getMicrophones?.(true).catch(() => []),
    ]);
    return { hasCam: (cams || []).length > 0, hasMic: (mics || []).length > 0 };
  } catch {
    return { hasCam: true, hasMic: true }; // couldn't probe → let track creation decide
  }
}

export function useAgoraLive(opts: {
  eventId: string;
  committeeId: string;
  dateStr: string;
  myUid: string;
  amHost: boolean;      // chair/EB/organizer running this session
  enabled: boolean;     // mount the video engine
  /**
   * GHOST OBSERVER (App Admin). Hard-pins the client to audience for its whole life: never
   * publishes, never creates a local track, never requests a device, never calls
   * setClientRole("host").
   *
   * That last one is the load-bearing part. Per the Agora SDK, in `mode: "live"` a remote
   * client is told about a joiner ONLY if that joiner is a host — but a role switch AFTER
   * joining DOES fire `user-joined` on every remote client. So the observer must never
   * transition, not merely never intend to.
   *
   * The server half is src/app/api/agora/token, which refuses to mint a publisher token for
   * this caller. Belt AND braces, because Agora does not enforce the publish privilege on
   * SUBSCRIBER tokens unless co-host authentication is enabled on the project.
   */
  observer?: boolean;
  /**
   * Event-wide CEREMONY room instead of a committee sitting. Replaces committeeId/dateStr as
   * the room identity: the session doc is the reserved `__ceremony__{kind}` and the channel is
   * derived with the eventId folded in (see agoraChannelForCeremony). `amHost` is the organizer.
   */
  ceremony?: CeremonyKind;
}): AgoraLiveState {
  const {
    eventId, committeeId, dateStr, myUid, amHost, enabled, observer = false, ceremony,
  } = opts;
  const configured = !!process.env.NEXT_PUBLIC_AGORA_APP_ID;

  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hostGranted, setHostGranted] = useState<boolean | null>(null);
  const [onStage, setOnStage] = useState(false);
  const [ended, setEnded] = useState(false); // session closed / finalized by the chair
  const [localCameraTrack, setLocalCameraTrack] = useState<ICameraVideoTrack | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [localScreenTrack, setLocalScreenTrack] = useState<any | null>(null);

  const screenSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const rtcRef = useRef<any>(null);
  const micTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const camTrackRef = useRef<ICameraVideoTrack | null>(null);
  const screenTrackRef = useRef<any>(null);
  const desiredPubRef = useRef(false);
  const applyingRef = useRef(false);
  const broadcastingRef = useRef(false); // intent (not derived from tracks → survives a camera failure)

  // Surface a misconfigured build in the console. The on-screen gate already names the missing vars,
  // but this makes "why is there no camera on the deployed site?" obvious without reading the source.
  useEffect(() => {
    if (enabled && !configured) {
      console.warn(
        "[agora] NEXT_PUBLIC_AGORA_APP_ID is not set in this build — live video is disabled. " +
        "Set it on Vercel and REDEPLOY (it is inlined at build time). Raising a hand still works without video.",
      );
    }
  }, [enabled, configured]);

  // ── Track the chair-granted stage (drives promote/demote) ────────────────────────
  useEffect(() => {
    if (!enabled || !eventId || !myUid) return;
    if (!ceremony && (!committeeId || !dateStr)) return;
    const sessionId = ceremony ? ceremonySessionId(ceremony) : makeSessionId(committeeId, dateStr);
    const unsub = subscribeSession(eventId, sessionId, (s) => {
      setOnStage((s?.live?.stage || []).includes(myUid));
      // End the video for everyone when the chair closes/finalizes the session OR ends the call
      // (call-ended keeps the session open; clearing the flag makes clients auto-rejoin).
      setEnded(s?.phase === "closed" || !!s?.finalized || !!s?.live?.callEnded);
    });
    return () => unsub();
  }, [enabled, eventId, committeeId, dateStr, myUid, ceremony]);

  // Acquire the camera on demand (initial promote, or a manual retry after a busy camera
  // frees up). A camera failure never aborts the broadcast — we stay audio-only.
  const startCamera = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const AgoraRTC = rtcRef.current;
    if (!client || !AgoraRTC || camTrackRef.current || !broadcastingRef.current) return;
    const { hasCam } = await probeDevices(AgoraRTC);
    if (!hasCam) { setCamOn(false); setError("No camera found — broadcasting audio only."); return; }
    try {
      const cam = await quietly(AgoraRTC, () => AgoraRTC.createCameraVideoTrack());
      camTrackRef.current = cam;
      await client.publish([cam]);
      setLocalCameraTrack(cam);
      setCamOn(true);
      setError(null);
    } catch (e: any) {
      console.warn("[agora] startCamera", e);
      camTrackRef.current?.close();
      camTrackRef.current = null;
      setCamOn(false);
      setError(cameraErrorMessage(e));
    }
  }, []);

  // ── Screen share (swap mode) — replaces the camera stream while active ────────────
  const stopScreenShare = useCallback(async (): Promise<void> => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    const client = clientRef.current;
    try { await client?.unpublish([screen]).catch(() => {}); } catch { /* noop */ }
    try { screen.stop?.(); screen.close?.(); } catch { /* noop */ }
    screenTrackRef.current = null;
    setLocalScreenTrack(null);
    setScreenSharing(false);
    // Restore the camera (it was only unpublished, not closed) if we're still broadcasting.
    if (client && broadcastingRef.current && camTrackRef.current) {
      try { await client.publish([camTrackRef.current]); }
      catch (e) { console.warn("[agora] restore camera", e); }
    }
  }, []);

  const toggleScreenShare = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const AgoraRTC = rtcRef.current;
    if (!client || !AgoraRTC || !broadcastingRef.current) return;
    if (screenTrackRef.current) { await stopScreenShare(); return; }
    try {
      // "disable" → returns a single video track (no captured system audio) to keep the swap simple.
      const screen = await quietly(AgoraRTC, () =>
        AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" }, "disable"));
      screenTrackRef.current = screen;
      // The browser's own "Stop sharing" bar ends the track → mirror that back into state.
      screen.on?.("track-ended", () => { void stopScreenShare(); });
      // Swap: unpublish the camera (kept alive for later), publish the screen.
      if (camTrackRef.current) await client.unpublish([camTrackRef.current]).catch(() => {});
      await client.publish([screen]);
      setLocalScreenTrack(screen);
      setScreenSharing(true);
      setError(null);
    } catch (e: any) {
      console.warn("[agora] screen share", e);
      try { screenTrackRef.current?.close?.(); } catch { /* noop */ }
      screenTrackRef.current = null;
      setScreenSharing(false);
      // User dismissed the picker → not an error worth showing.
      const s = `${e?.name || ""} ${e?.message || ""}`;
      if (!/Permission|NotAllowed|Cancel|cancel/i.test(s)) setError("Screen share failed to start.");
      // If the swap half-happened, make sure the camera is back on air.
      if (camTrackRef.current) { try { await client.publish([camTrackRef.current]); } catch { /* noop */ } }
    }
  }, [stopScreenShare]);

  // ── Publish / unpublish transition (serialized; converges on the latest desire) ──
  const applyPublishState = useCallback(async () => {
    if (observer) return; // ghost observer never transitions role — see the `observer` opt
    if (applyingRef.current) return;
    applyingRef.current = true;
    // Snapshot intent so the finally can tell whether THIS run made a transition.
    // Only a run that actually flipped broadcastingRef may re-converge — otherwise a
    // no-progress early return (client not ready, token denied, renewToken threw) would
    // re-invoke synchronously with the same inputs and recurse until the stack overflows.
    const before = broadcastingRef.current;
    try {
      const client = clientRef.current;
      const AgoraRTC = rtcRef.current;
      if (!client || !AgoraRTC) return;
      // renewToken/setClientRole require an established channel connection. During a
      // strict-mode double-mount clientRef can point at a client that hasn't joined yet;
      // bail (the joined-gated effect re-runs applyPublishState once it's CONNECTED).
      if (client.connectionState !== "CONNECTED") return;

      const desired = desiredPubRef.current;
      // Compare against INTENT, not track presence — so a camera that failed to open
      // (audio-only) doesn't look like "not broadcasting" and retry-loop forever.
      if (desired === broadcastingRef.current) return;

      if (desired) {
        // Promote → host. Server must agree (publisher token) or we stay audience.
        const tok = await fetchAgoraToken(eventId, committeeId, dateStr, ceremony);
        setHostGranted(tok.role === "publisher");
        if (tok.role !== "publisher") return;
        await client.renewToken(tok.token);
        await client.setClientRole("host");
        broadcastingRef.current = true; // set intent up-front → no re-entry loop
        setError(null);

        // Mic + camera acquired INDEPENDENTLY (a busy/missing camera must not stop the
        // delegate from being heard). Probe first so a missing device reads as "unavailable"
        // rather than throwing an internal SDK error.
        const { hasCam, hasMic } = await probeDevices(AgoraRTC);
        const toPublish: any[] = [];

        if (!micTrackRef.current && hasMic) {
          try { micTrackRef.current = await quietly(AgoraRTC, () => AgoraRTC.createMicrophoneAudioTrack()); }
          catch (e) { console.warn("[agora] microphone unavailable", e); }
        }
        if (micTrackRef.current) toPublish.push(micTrackRef.current);
        setMicOn(!!micTrackRef.current);

        if (!camTrackRef.current && hasCam) {
          try { camTrackRef.current = await quietly(AgoraRTC, () => AgoraRTC.createCameraVideoTrack()); }
          catch (e: any) {
            console.warn("[agora] camera unavailable", e);
            camTrackRef.current = null;
            setError(cameraErrorMessage(e));
          }
        }
        if (camTrackRef.current) { toPublish.push(camTrackRef.current); setLocalCameraTrack(camTrackRef.current); }
        setCamOn(!!camTrackRef.current);

        // Clear, non-scary messaging when a device is simply missing.
        if (!hasMic && !hasCam) setError("No camera or microphone found — you can watch but can’t broadcast.");
        else if (!hasCam) setError("No camera found — broadcasting audio only.");

        if (toPublish.length) await client.publish(toPublish);
        setPublishing(true);
      } else {
        // Demote → audience. Unpublish, close tracks (incl. any screen share), downgrade role.
        broadcastingRef.current = false;
        const tracks = [micTrackRef.current, camTrackRef.current, screenTrackRef.current].filter(Boolean) as any[];
        if (tracks.length) await client.unpublish(tracks).catch(() => {});
        micTrackRef.current?.stop(); micTrackRef.current?.close();
        camTrackRef.current?.stop(); camTrackRef.current?.close();
        try { screenTrackRef.current?.stop?.(); screenTrackRef.current?.close?.(); } catch { /* noop */ }
        micTrackRef.current = null;
        camTrackRef.current = null;
        screenTrackRef.current = null;
        setLocalCameraTrack(null);
        setLocalScreenTrack(null);
        setScreenSharing(false);
        setPublishing(false);
        setError(null);
        try {
          const tok = await fetchAgoraToken(eventId, committeeId, dateStr, ceremony);
          await client.renewToken(tok.token);
        } catch { /* keep going — role downgrade is the important part */ }
        await client.setClientRole("audience", { level: 2 }); // 2 = ultra-low latency
      }
    } catch (e: any) {
      console.error("[agora] applyPublishState", e);
      setError(e?.message || "Video role change failed");
    } finally {
      applyingRef.current = false;
      // Converge only if THIS run made progress (transitioned) yet the desire has since
      // flipped again — never on a no-progress return, which would spin forever.
      if (broadcastingRef.current !== before && desiredPubRef.current !== broadcastingRef.current)
        void applyPublishState();
    }
  }, [eventId, committeeId, dateStr, observer, ceremony]);

  // Recompute desired publish state whenever host status / stage membership changes.
  useEffect(() => {
    if (!joined) return;
    desiredPubRef.current = !observer && (amHost || onStage);
    void applyPublishState();
  }, [joined, amHost, onStage, observer, applyPublishState]);

  // ── Join / leave the channel ─────────────────────────────────────────────────────
  // Each effect run owns its OWN client + `cancelled` flag. Teardown waits for the in-flight
  // join to settle before leaving, so a React strict-mode double-mount (or fast remount)
  // never leaks a joined client that would collide with the next join on the same uid.
  useEffect(() => {
    // `ended` gates the join: when the chair closes/finalizes, this effect re-runs, its
    // cleanup leaves the channel, and it does NOT rejoin. On Reopen, `ended` flips back and
    // it rejoins.
    // A ceremony room is identified by eventId + kind, so it has no committee or date to check.
    if (!enabled || !configured || ended || !eventId || !myUid) return;
    if (!ceremony && (!committeeId || !dateStr)) return;
    let cancelled = false;
    let localClient: IAgoraRTCClient | null = null;

    const connect = (async () => {
      try {
        setConnecting(true);
        setError(null);
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        if (cancelled) return;
        try { AgoraRTC.setLogLevel(AGORA_LOG_BASELINE); } catch { /* noop */ }
        rtcRef.current = AgoraRTC;
        localClient = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        clientRef.current = localClient;
        const client = localClient;

        client.on("user-published", async (user, mediaType) => {
          // A stream can be delivered while we're still mid-join (or already leaving), where
          // subscribe throws "INVALID_OPERATION: not joined". Skip it — the post-join sweep
          // below (or the delegate re-publishing) picks it up once we're CONNECTED.
          if (cancelled || client.connectionState !== "CONNECTED") return;
          try {
            await client.subscribe(user, mediaType);
            if (mediaType === "audio") user.audioTrack?.play();
            setRemoteUsers((prev) => dedupe([...prev, user]));
          } catch (e) { console.error("[agora] subscribe", e); }
        });
        client.on("user-unpublished", (user, mediaType) => {
          if (mediaType === "audio") user.audioTrack?.stop();
          setRemoteUsers((prev) => dedupe([...prev])); // track ref changed → re-render
        });
        client.on("user-joined", (user) => setRemoteUsers((prev) => dedupe([...prev, user])));
        client.on("user-left", (user) =>
          setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid)));
        client.on("token-privilege-will-expire", async () => {
          try {
            const t = await fetchAgoraToken(eventId, committeeId, dateStr, ceremony);
            await client.renewToken(t.token);
          } catch (e) { console.error("[agora] renewToken", e); }
        });

        const tok = await fetchAgoraToken(eventId, committeeId, dateStr, ceremony);
        if (cancelled) return;
        setHostGranted(!observer && tok.role === "publisher");
        // An observer joins as audience and stays there. Belt (server never mints them a
        // publisher token) and braces (this never asks for host even if one arrived).
        if (!observer && tok.role === "publisher") await client.setClientRole("host");
        else await client.setClientRole("audience", { level: 2 });
        await client.join(tok.appId, tok.channel, tok.token, myUid);
        if (cancelled) { await client.leave().catch(() => {}); return; }
        setJoined(true);
        setConnecting(false);

        // Subscribe to anyone who was already publishing during our join handshake — those
        // `user-published` events fired before CONNECTED and were skipped by the guard above.
        for (const u of client.remoteUsers) {
          if (cancelled || client.connectionState !== "CONNECTED") break;
          for (const mt of ["audio", "video"] as const) {
            if (mt === "audio" ? !u.hasAudio : !u.hasVideo) continue;
            try {
              await client.subscribe(u, mt);
              if (mt === "audio") u.audioTrack?.play();
            } catch (e) { console.error("[agora] subscribe(existing)", e); }
          }
          setRemoteUsers((prev) => dedupe([...prev, u]));
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error("[agora] join", e);
          setError(e?.message || "Failed to join live video");
          setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const teardown = async () => {
        try {
          micTrackRef.current?.stop(); micTrackRef.current?.close();
          camTrackRef.current?.stop(); camTrackRef.current?.close();
          try { screenTrackRef.current?.stop?.(); screenTrackRef.current?.close?.(); } catch { /* noop */ }
          if (localClient) {
            localClient.removeAllListeners();
            await localClient.leave().catch(() => {});
          }
        } catch (e) { console.error("[agora] cleanup", e); }
        micTrackRef.current = null;
        camTrackRef.current = null;
        screenTrackRef.current = null;
        broadcastingRef.current = false;
        if (clientRef.current === localClient) clientRef.current = null;
      };
      connect.then(teardown, teardown);
      setJoined(false);
      setPublishing(false);
      setRemoteUsers([]);
      setLocalCameraTrack(null);
    };
  }, [enabled, configured, ended, eventId, committeeId, dateStr, myUid, observer, ceremony]);

  const toggleMic = useCallback(() => {
    const t = micTrackRef.current;
    if (!t) return;
    const next = !t.enabled;
    void t.setEnabled(next);
    setMicOn(next);
  }, []);

  const toggleCam = useCallback(() => {
    // Redundant (startCamera bails on !broadcastingRef) but stated locally: an observer must
    // never reach a getUserMedia call, and this is the one path that acquires a device lazily.
    if (observer) return;
    const t = camTrackRef.current;
    if (!t) { void startCamera(); return; } // no track (busy/denied earlier) → retry
    const next = !t.enabled;
    void t.setEnabled(next);
    setCamOn(next);
  }, [startCamera, observer]);

  return {
    configured,
    connecting,
    joined,
    publishing,
    hostGranted,
    role: publishing ? "host" : "audience",
    onStage,
    sessionEnded: ended,
    remoteUsers,
    localCameraTrack,
    micOn,
    camOn,
    error,
    toggleMic,
    toggleCam,
    screenSharing,
    localScreenTrack,
    screenSupported,
    toggleScreenShare,
  };
}
