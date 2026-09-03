# Saturn Orb

A Saturn-like holographic wireframe sphere with gesture control — built with **Next.js**, **Three.js**, and **MediaPipe** hand tracking.

## Features

- **Wireframe Saturn system**: Central core sphere with latitude/longitude grid, multi-layered ring system with radial spokes, 60 orbiting micro-spheres forming a sparse spherical grid, connecting proximity lines, and 5 nested grid shells
- **Grayscale aesthetic**: Pure white-on-black, no color
- **Hand gesture control** (webcam):
  - ✋ **Open palm + move** — Rotate camera around the system
  - ✊ **Make a fist** — Zoom 50% closer (can zoom inside the core sphere)
  - Release fist — Zoom back out
- **Keyboard fallback**: `G` toggle gestures, `R` reset view, `+/-` zoom, mouse drag/scroll
- **Post-processing**: Bloom + subtle chromatic aberration

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and allow camera access for gesture control.

## Controls

| Input | Action |
|-------|--------|
| **Palm + move** | Rotate camera |
| **Fist (hold)** | Zoom in 50% |
| **Release fist** | Zoom out |
| `G` | Toggle hand tracking |
| `R` | Reset view |
| `+` / `-` | Zoom in / out |
| Mouse drag | Rotate |
| Mouse scroll | Zoom |

## Project Structure

```
saturn-orb/
├── app/
│   ├── globals.css      # Grayscale HUD styles
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── SaturnOrb.tsx    # Main component, HUD, gesture wiring
├── lib/
│   ├── saturnScene.ts   # Three.js scene: core, rings, orbiters, grid shells
│   └── handTracker.ts   # MediaPipe hand landmarker + palm/fist detection
├── package.json
├── tsconfig.json
└── next.config.ts
```

## Tech Stack

- **Next.js 16** (App Router, React 19)
- **Three.js r185** (WebGL, post-processing via EffectComposer)
- **MediaPipe Tasks Vision** (HandLandmarker, GPU/CPU fallback)
- **TypeScript**

## License

MIT License

Copyright (c) 2026 canedroid

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

[@canedroid](https://github.com/canedroid)