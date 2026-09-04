"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSaturnScene, type SaturnSceneApi } from "@/lib/saturnScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";

type CameraState = "off" | "starting" | "on" | "error";

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  rotate: "ROTATE",
  zoom: "ZOOM",
};

const GESTURE_LABEL: Record<TrackerStatus["gesture"], string> = {
  none: "",
  palm: "✋ PALM",
  fist: "✊ FIST",
};

export default function SaturnOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SaturnSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle", gesture: "none" });
  const [error, setError] = useState<string | null>(null);
  const [showHud, setShowHud] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createSaturnScene(container);
    sceneRef.current = scene;
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle", gesture: "none" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
        case "y":
        case "Y":
          setShowHud((prev) => !prev);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures]);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      {/* Video/canvas always in DOM for tracker, hidden via CSS when not needed */}
      <div className={`camera-panel${cameraOn ? " visible" : ""} ${showHud ? "" : " hud-hidden"}`}>
        <video ref={videoRef} muted playsInline className="camera-video" />
        <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
<div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]} ${GESTURE_LABEL[status.gesture]}`
              : "SHOW HANDS"}
          </div>
      </div>

      {showHud && (
        <>
          <div className="hud hud-title">SATURN ORB</div>

          <div className="hud hud-hint">
            <div>
              <span className="key">DRAG</span> spin&nbsp;&nbsp;
              <span className="key">SCROLL</span> zoom
            </div>
            {cameraOn ? (
              <div>
                <span className="key">PALM + MOVE</span> rotate&nbsp;&nbsp;
                <span className="key">FIST + MOVE 3D</span> zoom (right/up/forward = in)
              </div>
            ) : (
              <div>
                <span className="key">G</span> hand gestures&nbsp;&nbsp;
                <span className="key">R</span> reset&nbsp;&nbsp;
                <span className="key">+/−</span> zoom
              </div>
            )}
            <div>
              <span className="key">Y</span> toggle HUD
            </div>
          </div>

          <div className="hud hud-controls">
            {error && <div className="hud-error">{error}</div>}

            <div className="hud-row">
              <button
                type="button"
                className="hud-btn"
                aria-pressed={cameraOn}
                onClick={toggleGestures}
                disabled={camera === "starting"}
              >
                {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
              </button>
            </div>
            <div className="hud-row">
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
                +
              </button>
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
                RESET
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}