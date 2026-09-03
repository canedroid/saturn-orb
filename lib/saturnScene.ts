import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface SaturnSceneApi {
  rotateBy(deltaTheta: number, deltaPhi: number): void;
  zoomBy(factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  dispose(): void;
}

const HOME_POSITION = new THREE.Vector3(0, 0.5, 12);
const MIN_DISTANCE = 0.15;
const MAX_DISTANCE = 80;

export function createSaturnScene(container: HTMLElement): SaturnSceneApi {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.01, 500);
  camera.position.copy(HOME_POSITION);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.5,
    0.3,
    0.05,
  );
  composer.addPass(bloom);

  const chromaticShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.002 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - vec2(0.5);
        float d = length(dir);
        float offset = uIntensity * d;
        float flicker = 1.0 + 0.01 * sin(uTime * 20.0) * sin(uTime * 4.3);
        vec4 cr = texture2D(tDiffuse, vUv + dir * offset);
        vec4 cg = texture2D(tDiffuse, vUv);
        vec4 cb = texture2D(tDiffuse, vUv - dir * offset * 0.5);
        gl_FragColor = vec4(cr.r, cg.g * 1.05, cb.b * 0.7, 1.0) * flicker;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.1, 1.0, 0.8), 0.15);
      }
    `,
  };
  const chromaticPass = new ShaderPass(chromaticShader);
  composer.addPass(chromaticPass);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.zoomSpeed = 1.5;
  controls.enablePan = false;

  const C_WHITE = 0xffffff;
  const C_DIM = 0x888888;
  const C_FAINT = 0x444444;
  const C_BRIGHT = 0xffffff;

  const saturnGroup = new THREE.Group();
  scene.add(saturnGroup);

  function createGlowMaterial(color: number, opacity: number, size: number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const c = (color >> 16) & 255;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, `rgba(${c}, ${c}, ${c}, ${opacity})`);
    grad.addColorStop(0.4, `rgba(${c}, ${c}, ${c}, ${opacity * 0.3})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(color),
    });
  }

  // CENTRAL CORE SPHERE - wireframe grid sphere
  const coreRadius = 1.0;
  const coreGeo = new THREE.SphereGeometry(coreRadius, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({
    color: C_WHITE,
    transparent: true,
    opacity: 0.03,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  saturnGroup.add(coreMesh);

  // Core wireframe - dense grid
  const coreWireGeo = new THREE.IcosahedronGeometry(coreRadius * 0.98, 4);
  const coreWireEdges = new THREE.EdgesGeometry(coreWireGeo);
  const coreWireMat = new THREE.LineBasicMaterial({
    color: C_FAINT,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreWire = new THREE.LineSegments(coreWireEdges, coreWireMat);
  saturnGroup.add(coreWire);

  // Inner core wireframe (denser)
  const innerWireGeo = new THREE.IcosahedronGeometry(coreRadius * 0.7, 5);
  const innerWireEdges = new THREE.EdgesGeometry(innerWireGeo);
  const innerWireMat = new THREE.LineBasicMaterial({
    color: C_DIM,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerWire = new THREE.LineSegments(innerWireEdges, innerWireMat);
  saturnGroup.add(innerWire);

  // Core center point
  const centerGeo = new THREE.SphereGeometry(0.02, 8, 8);
  const centerMat = new THREE.MeshBasicMaterial({
    color: C_WHITE,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const centerPoint = new THREE.Mesh(centerGeo, centerMat);
  saturnGroup.add(centerPoint);

  // RING SYSTEM - thin wireframe rings
  const ringGroup = new THREE.Group();
  saturnGroup.add(ringGroup);

  const ringInnerRadius = 1.4;
  const ringOuterRadius = 3.0;
  const ringSegments = 200;

  // Multiple thin ring lines
  for (let layer = 0; layer < 12; layer++) {
    const r = ringInnerRadius + (layer / 11) * (ringOuterRadius - ringInnerRadius);
    const ringGeo = new THREE.RingGeometry(r - 0.008, r + 0.008, ringSegments, 1);
    const opacity = 0.08 + (layer % 3 === 0 ? 0.12 : 0);
    const ringMat = new THREE.MeshBasicMaterial({
      color: C_WHITE,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringGroup.add(ringMesh);
  }

  // Radial spokes in rings
  for (let spoke = 0; spoke < 24; spoke++) {
    const angle = (spoke / 24) * Math.PI * 2;
    const spokeGeo = new THREE.BufferGeometry();
    const spokePts: THREE.Vector3[] = [];
    for (let r = ringInnerRadius; r <= ringOuterRadius; r += 0.02) {
      spokePts.push(new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle)));
    }
    spokeGeo.setFromPoints(spokePts);
    const spokeMat = new THREE.LineBasicMaterial({
      color: C_FAINT,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const spokeLine = new THREE.Line(spokeGeo, spokeMat);
    ringGroup.add(spokeLine);
  }

  // Ring dust - very fine particles
  const ringDustCount = 2000;
  const ringDustPos = new Float32Array(ringDustCount * 3);
  for (let i = 0; i < ringDustCount; i++) {
    const r = ringInnerRadius + Math.random() * (ringOuterRadius - ringInnerRadius);
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 0.02;
    ringDustPos[i * 3] = r * Math.cos(theta);
    ringDustPos[i * 3 + 1] = y;
    ringDustPos[i * 3 + 2] = r * Math.sin(theta);
  }
  const ringDustGeo = new THREE.BufferGeometry();
  ringDustGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringDustPos, 3));
  const dotCanvas = document.createElement("canvas");
  dotCanvas.width = dotCanvas.height = 16;
  const dCtx = dotCanvas.getContext("2d")!;
  const dGrad = dCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
  dGrad.addColorStop(0, "rgba(255,255,255,1)");
  dGrad.addColorStop(0.5, "rgba(200,200,200,0.3)");
  dGrad.addColorStop(1, "rgba(0,0,0,0)");
  dCtx.fillStyle = dGrad;
  dCtx.fillRect(0, 0, 16, 16);
  const ringDustMat = new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dotCanvas),
    size: 0.008,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    color: C_WHITE,
  });
  const ringDust = new THREE.Points(ringDustGeo, ringDustMat);
  ringGroup.add(ringDust);

  // ORBITING SPHERES - tiny, many, forming a sparse grid shell
  const orbitSpheres: THREE.Mesh[] = [];
  const orbitData: { radius: number; speed: number; tilt: number; phase: number; size: number }[] = [];

  const orbitCount = 60;
  const sharedGeo = new THREE.SphereGeometry(0.015, 12, 12);

  for (let i = 0; i < orbitCount; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: C_WHITE,
      transparent: true,
      opacity: 0.4 + Math.random() * 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(sharedGeo, mat);
    saturnGroup.add(sphere);

    // Distribute in spherical shells between rings and outer space
    const shell = Math.floor(Math.random() * 4);
    const baseRadius = 3.5 + shell * 3.0;
    const radius = baseRadius + (Math.random() - 0.5) * 1.5;
    const speed = (0.02 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1);
    const tilt = (Math.random() - 0.5) * Math.PI * 0.8;
    const phase = Math.random() * Math.PI * 2;
    const size = 0.01 + Math.random() * 0.015;
    sphere.scale.setScalar(size / 0.015);

    orbitSpheres.push(sphere);
    orbitData.push({ radius, speed, tilt, phase, size });
  }

  // CONNECTING LINES - sparse web between nearby spheres
  const lineGroup = new THREE.Group();
  saturnGroup.add(lineGroup);

  const maxLines = orbitCount * 3;
  const linePositions = new Float32Array(maxLines * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: C_FAINT,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lineGroup.add(lines);

  // SPHERICAL GRID SHELLS - wireframe spheres at various radii
  const gridShells = [1.1, 2.0, 4.0, 7.0, 12.0];
  gridShells.forEach((r, si) => {
    const shellGeo = new THREE.IcosahedronGeometry(r, 2 + si);
    const shellEdges = new THREE.EdgesGeometry(shellGeo);
    const shellMat = new THREE.LineBasicMaterial({
      color: C_WHITE,
      transparent: true,
      opacity: 0.04 * (1 - si * 0.15),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shellWire = new THREE.LineSegments(shellEdges, shellMat);
    saturnGroup.add(shellWire);
    shellWire.userData = { baseOpacity: shellMat.opacity, radius: r };
  });

  // LATITUDE/LONGITUDE GRID LINES on core sphere
  const gridLineGroup = new THREE.Group();
  saturnGroup.add(gridLineGroup);

  // Latitude lines
  for (let lat = -80; lat <= 80; lat += 10) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const r = coreRadius * 1.001;
    const y = r * Math.cos(phi);
    const ringR = r * Math.sin(phi);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      pts.push(new THREE.Vector3(ringR * Math.cos(a), y, ringR * Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: C_FAINT,
      transparent: true,
      opacity: lat % 30 === 0 ? 0.12 : 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    gridLineGroup.add(new THREE.Line(geo, mat));
  }

  // Longitude lines
  for (let lon = 0; lon < 180; lon += 15) {
    const pts: THREE.Vector3[] = [];
    for (let lat = -90; lat <= 90; lat += 3) {
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      const r = coreRadius * 1.001;
      pts.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: C_FAINT,
      transparent: true,
      opacity: lon % 45 === 0 ? 0.12 : 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    gridLineGroup.add(new THREE.Line(geo, mat));
  }

  // Ambient particles - sparse, far out
  const ambientCount = 800;
  const ambientPos = new Float32Array(ambientCount * 3);
  for (let i = 0; i < ambientCount; i++) {
    const rr = 15 + Math.pow(Math.random(), 0.6) * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    ambientPos[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
    ambientPos[i * 3 + 1] = rr * Math.cos(phi);
    ambientPos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
  }
  const ambientGeo = new THREE.BufferGeometry();
  ambientGeo.setAttribute("position", new THREE.Float32BufferAttribute(ambientPos, 3));
  const ambientMat = new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dotCanvas),
    size: 0.02,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    color: C_DIM,
  });
  const ambientPoints = new THREE.Points(ambientGeo, ambientMat);
  saturnGroup.add(ambientPoints);

  // CAMERA CONTROL
  const sphericalScratch = new THREE.Spherical();
  const offsetScratch = new THREE.Vector3();
  let targetDistance = HOME_POSITION.length();
  let currentDistance = targetDistance;

  function rotateBy(deltaTheta: number, deltaPhi: number) {
    offsetScratch.copy(camera.position).sub(controls.target);
    sphericalScratch.setFromVector3(offsetScratch);
    sphericalScratch.theta -= deltaTheta;
    sphericalScratch.phi = THREE.MathUtils.clamp(
      sphericalScratch.phi - deltaPhi,
      0.01,
      Math.PI - 0.01,
    );
    sphericalScratch.makeSafe();
    offsetScratch.setFromSpherical(sphericalScratch);
    camera.position.copy(controls.target).add(offsetScratch);
    camera.lookAt(controls.target);
  }

  function zoomBy(factor: number) {
    targetDistance = THREE.MathUtils.clamp(
      currentDistance * factor,
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
  }

  function zoomIn() {
    zoomBy(0.5);
  }

  function zoomOut() {
    zoomBy(2.0);
  }

  function resetView() {
    camera.position.copy(HOME_POSITION);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
    currentDistance = targetDistance = HOME_POSITION.length();
  }

  // ANIMATION
  const clock = new THREE.Clock();
  let rafId = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Smooth zoom interpolation
    currentDistance += (targetDistance - currentDistance) * 0.08;
    offsetScratch.copy(camera.position).sub(controls.target);
    offsetScratch.setLength(currentDistance);
    camera.position.copy(controls.target).add(offsetScratch);

    // Core pulse - subtle
    const corePulse = 1 + Math.sin(t * 1.2) * 0.02;
    coreMesh.scale.setScalar(corePulse);
    coreWire.scale.setScalar(corePulse);
    innerWire.scale.setScalar(corePulse);
    centerPoint.scale.setScalar(1 + Math.sin(t * 3) * 0.3);

    // Core wire rotation
    coreWire.rotation.y += 0.0015;
    coreWire.rotation.x += 0.0008;
    innerWire.rotation.y -= 0.001;
    innerWire.rotation.z += 0.0005;

    // Grid lines subtle pulse
    gridLineGroup.children.forEach((line, i) => {
      if (line instanceof THREE.Line) {
        const mat = line.material as THREE.LineBasicMaterial;
        const baseOp = (mat as any).userData?.baseOpacity || mat.opacity;
        mat.opacity = baseOp * (i % 2 === 0 ? 1 + Math.sin(t * 2 + i) * 0.15 : 1);
      }
    });

    // Grid shells pulse
    saturnGroup.traverse((obj) => {
      if (obj.userData.baseOpacity !== undefined && obj instanceof THREE.LineSegments) {
        const mat = obj.material as THREE.LineBasicMaterial;
        mat.opacity = obj.userData.baseOpacity * (1 + Math.sin(t * 1.5 + obj.userData.radius) * 0.2);
      }
    });

    // Ring rotation
    ringGroup.rotation.z += 0.0003;

    // Ring dust subtle wave
    const ringDustPosArr = ringDustGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < ringDustCount; i++) {
      const baseIdx = i * 3;
      ringDustPosArr[baseIdx + 1] = Math.sin(t * 2 + i * 0.05) * 0.005;
    }
    ringDustGeo.attributes.position.needsUpdate = true;

    // Orbit spheres
    for (let i = 0; i < orbitCount; i++) {
      const sphere = orbitSpheres[i];
      const data = orbitData[i];
      const a = t * data.speed + data.phase;
      const x = data.radius * Math.cos(a) * Math.cos(data.tilt);
      const y = data.radius * Math.sin(data.tilt) * Math.sin(a * 0.7) + Math.sin(a * 0.4 + data.tilt * 0.5) * 0.2;
      const z = data.radius * Math.sin(a) * Math.cos(data.tilt);
      sphere.position.set(x, y, z);
    }

    // Update connecting lines - only connect nearby spheres
    const linePosArr = lineGeo.attributes.position.array as Float32Array;
    let lineIdx = 0;
    const connectDist = 4.0;
    for (let i = 0; i < orbitCount && lineIdx < maxLines; i++) {
      for (let j = i + 1; j < orbitCount && lineIdx < maxLines; j++) {
        const p1 = orbitSpheres[i].position;
        const p2 = orbitSpheres[j].position;
        const dist = p1.distanceTo(p2);
        if (dist < connectDist) {
          const alpha = 1 - dist / connectDist;
          linePosArr[lineIdx * 6] = p1.x;
          linePosArr[lineIdx * 6 + 1] = p1.y;
          linePosArr[lineIdx * 6 + 2] = p1.z;
          linePosArr[lineIdx * 6 + 3] = p2.x;
          linePosArr[lineIdx * 6 + 4] = p2.y;
          linePosArr[lineIdx * 6 + 5] = p2.z;
          lineIdx++;
        }
      }
    }
    lineGeo.setDrawRange(0, lineIdx * 2);
    lineGeo.attributes.position.needsUpdate = true;

    // Line opacity pulse
    lineMat.opacity = 0.05 + Math.sin(t * 0.8) * 0.03;

    // Ambient particles
    ambientPoints.rotation.y += 0.00005;

    // Bloom subtle pulse
    bloom.strength = 1.2 + Math.sin(t * 0.5) * 0.3;

    // Chromatic aberration time
    chromaticPass.uniforms.uTime.value = t;

    controls.update();
    composer.render();
  }

  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        const anyMat = mat as THREE.Material & { map?: THREE.Texture };
        anyMat.map?.dispose();
        mat.dispose();
      }
    });
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    rotateBy,
    zoomBy,
    zoomIn,
    zoomOut,
    resetView,
    dispose,
  };
}