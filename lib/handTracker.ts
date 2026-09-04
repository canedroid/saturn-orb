import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WRIST = 0;
const THUMB_TIP = 4;
const THUMB_IP = 3;
const INDEX_TIP = 8;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_MCP = 13;
const PINKY_TIP = 20;
const PINKY_MCP = 17;

const ROTATE_SPEED = 4.5;
const SMOOTHING = 0.35;

// Zoom via Z-axis (hand depth)
const ZOOM_SENSITIVITY = 12.0;
const Z_DEAD_ZONE = 0.0015;
const Z_SMOOTHING = 0.7;

export type GestureMode = "idle" | "rotate" | "zoom";

export interface TrackerStatus {
  hands: number;
  mode: GestureMode;
  gesture: "none" | "palm" | "fist";
}

export interface HandTrackerCallbacks {
  onRotate(deltaTheta: number, deltaPhi: number): void;
  onZoom(factor: number): void;
  onStatus(status: TrackerStatus): void;
}

interface Point {
  x: number;
  y: number;
}

interface HandState {
  grab: Point;
  prevZ: number | null;
  zVelocity: number;
  wasFist: boolean;
  wasPalm: boolean;
}

export class HandTracker {
  private video: HTMLVideoElement;
  private overlay: HTMLCanvasElement;
  private callbacks: HandTrackerCallbacks;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private lastVideoTime = -1;

  private handStates = new Map<string, HandState>();
  private prevMode: GestureMode = "idle";
  private prevGrab: Point | null = null;
  private lastStatus: TrackerStatus = { hands: 0, mode: "idle", gesture: "none" };

  constructor(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement,
    callbacks: HandTrackerCallbacks,
  ) {
    this.video = video;
    this.overlay = overlay;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" as const },
      });
    }

    this.running = true;
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.handStates.clear();
    this.prevMode = "idle";
    this.prevGrab = null;
    const ctx = this.overlay.getContext("2d");
    ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.emitStatus({ hands: 0, mode: "idle", gesture: "none" });
  }

  private loop = () => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    if (!this.landmarker || this.video.readyState < 2) return;
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    this.processHands(result.landmarks, result.handedness.map((h) => h[0]?.categoryName ?? "?"));
    this.drawOverlay(result.landmarks);
  };

  private isPalm(landmarks: NormalizedLandmark[]): boolean {
    const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
    const mcps = [INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    let extended = 0;
    for (let i = 0; i < 4; i++) {
      if (landmarks[tips[i]].y < landmarks[mcps[i]].y - 0.02) extended++;
    }
    return extended >= 3;
  }

  private isFist(landmarks: NormalizedLandmark[]): boolean {
    const tips = [INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
    const mcps = [INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
    let curled = 0;
    for (let i = 0; i < 4; i++) {
      if (landmarks[tips[i]].y > landmarks[mcps[i]].y + 0.02) curled++;
    }
    const thumbTucked = landmarks[THUMB_TIP].x < landmarks[THUMB_IP].x - 0.02;
    return curled >= 3 && thumbTucked;
  }

  private processHands(
    landmarks: NormalizedLandmark[][],
    labels: string[],
  ): void {
    const seen = new Set<string>();
    let palmCount = 0;
    let fistCount = 0;
    let primaryGrab: Point | null = null;
    let primaryZVelocity = 0;

    landmarks.forEach((lm: NormalizedLandmark[], i: number) => {
      const label = labels[i];
      seen.add(label);

      const isPalm = this.isPalm(lm);
      const isFist = this.isFist(lm);

      if (isPalm) palmCount++;
      if (isFist) fistCount++;

      // Screen-space grab point (mirrored X for natural feel)
      const raw: Point = {
        x: 1 - (lm[INDEX_TIP].x + lm[MIDDLE_TIP].x) / 2,
        y: (lm[INDEX_TIP].y + lm[MIDDLE_TIP].y) / 2,
      };

      // Z from wrist (MediaPipe: closer to camera = smaller Z)
      const currentZ = lm[WRIST].z ?? 0;

      let state = this.handStates.get(label);
      if (!state) {
        state = { grab: raw, prevZ: currentZ, zVelocity: 0, wasFist: false, wasPalm: false };
        this.handStates.set(label, state);
      }

      // Smooth grab point
      state.grab = {
        x: state.grab.x + (raw.x - state.grab.x) * SMOOTHING,
        y: state.grab.y + (raw.y - state.grab.y) * SMOOTHING,
      };

      // Smooth Z velocity
      const rawZDelta = state.prevZ !== null ? currentZ - state.prevZ : 0;
      state.zVelocity = state.zVelocity * Z_SMOOTHING + rawZDelta * (1 - Z_SMOOTHING);
      state.prevZ = currentZ;

      // Palm starts/stays in rotation mode
      if (isPalm) {
        if (!state.wasPalm && this.prevMode === "idle") {
          this.prevMode = "rotate";
          this.prevGrab = { ...state.grab };
        }
        if (this.prevMode === "rotate") {
          primaryGrab = state.grab;
        }
      }

      // Fist starts zoom mode (Z-axis only)
      if (isFist) {
        if (!state.wasFist && this.prevMode === "idle") {
          this.prevMode = "zoom";
        }
        // Track Z velocity for zoom, but don't track X/Y for rotation
        primaryZVelocity = state.zVelocity;
      }

      state.wasPalm = isPalm;
      state.wasFist = isFist;
    });

    // Clean up lost hands
    for (const key of this.handStates.keys()) {
      if (!seen.has(key)) this.handStates.delete(key);
    }

    let mode: GestureMode = "idle";
    let gesture: "none" | "palm" | "fist" = "none";

    if (palmCount > 0 && this.prevMode === "rotate") {
      mode = "rotate";
      gesture = "palm";
    } else if (fistCount > 0) {
      mode = "zoom";
      gesture = "fist";
    } else if (this.prevMode === "rotate" || this.prevMode === "zoom") {
      this.prevMode = "idle";
      this.prevGrab = null;
    }

    // Rotation from X/Y grab delta (PALM ONLY)
    if (mode === "rotate" && primaryGrab && this.prevGrab) {
      const grab: Point = primaryGrab;
      const prev: Point = this.prevGrab;
      const dx = grab.x - prev.x;
      const dy = grab.y - prev.y;
      if (Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4) {
        this.callbacks.onRotate(dx * ROTATE_SPEED, dy * ROTATE_SPEED);
      }
      this.prevGrab = { x: grab.x, y: grab.y };
    } else if (mode !== "rotate") {
      this.prevGrab = null;
    }

    // Zoom from Z velocity (FIST ONLY)
    if (mode === "zoom" && Math.abs(primaryZVelocity) > Z_DEAD_ZONE) {
      // Z decreases (negative) = hand moving toward camera = zoom IN (factor < 1)
      // Z increases (positive) = hand moving away = zoom OUT (factor > 1)
      const factor = 1 - primaryZVelocity * ZOOM_SENSITIVITY;
      this.callbacks.onZoom(factor);
    }

    this.emitStatus({ hands: landmarks.length, mode, gesture });
  }

  private emitStatus(status: TrackerStatus): void {
    if (
      status.hands !== this.lastStatus.hands ||
      status.mode !== this.lastStatus.mode ||
      status.gesture !== this.lastStatus.gesture
    ) {
      this.lastStatus = status;
      this.callbacks.onStatus(status);
    }
  }

  private drawOverlay(landmarks: NormalizedLandmark[][]): void {
    const ctx = this.overlay.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.overlay;
    ctx.clearRect(0, 0, width, height);

    for (const lm of landmarks) {
      const palm = this.isPalm(lm);
      const fist = this.isFist(lm);

      let color = "rgba(255,255,255,0.4)";
      if (fist) color = "#ff6666";
      else if (palm) color = "#88ff88";
      const lineWidth = fist || palm ? 3 : 1;

      const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [5, 9], [9, 10], [10, 11], [11, 12],
        [9, 13], [13, 14], [14, 15], [15, 16],
        [13, 17], [17, 18], [18, 19], [19, 20],
        [0, 17],
      ];

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (const [a, b] of connections) {
        const ax = (1 - lm[a].x) * width;
        const ay = lm[a].y * height;
        const bx = (1 - lm[b].x) * width;
        const by = lm[b].y * height;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      ctx.fillStyle = color;
      for (let i = 0; i < 21; i++) {
        const x = (1 - lm[i].x) * width;
        const y = lm[i].y * height;
        const r = (fist || palm) ? 5 : 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      const label = fist ? "FIST (ZOOM)" : palm ? "PALM (ROTATE)" : "";
      if (label) {
        ctx.fillStyle = color;
        ctx.font = "bold 14px monospace";
        ctx.fillText(label, (1 - lm[WRIST].x) * width + 10, lm[WRIST].y * height - 10);
      }
    }
  }
}