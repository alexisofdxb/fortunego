// ---------------------------------------------------------------------------
// PlotGo world prototype — standalone Three.js environment on /world.
// Kenney "Nature Kit" (CC0, https://kenney.nl/assets/nature-kit) scattered on
// a ground plane with an RTS camera. The game itself is untouched; this page
// exists to evaluate the future environment/renderer direction.
// ---------------------------------------------------------------------------
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODELS = "/world/models/";

// Deterministic scatter (same world every load).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260927);

// --- Renderer / scene -------------------------------------------------------
const canvas = document.getElementById("world") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec8e8);
scene.fog = new THREE.Fog(0x9ec8e8, 120, 340);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);

// Lights: warm sun + sky/ground bounce.
const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
sun.position.set(60, 90, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a6b3a, 0.9));

// --- Ground: vertex-colored grass with a dirt clearing in the middle --------
const WORLD_RADIUS = 380;
const PLOT_RADIUS = 24; // cleared area reserved for the future plot

function buildGround(): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(WORLD_RADIUS, 128, 0, Math.PI * 2);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const grassA = new THREE.Color(0x5e8c4a);
  const grassB = new THREE.Color(0x6f9c52);
  const grassC = new THREE.Color(0x527a3e);
  const dirt = new THREE.Color(0x9a7d53);
  const tmp = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    const n = Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.045) * 0.6;
    tmp.copy(grassA).lerp(grassB, THREE.MathUtils.clamp(0.5 + n * 0.35, 0, 1));
    if (n < -0.55) tmp.lerp(grassC, 0.6);
    const clearing = THREE.MathUtils.smoothstep(PLOT_RADIUS + 4 - r, 0, 8);
    tmp.lerp(dirt, clearing);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
scene.add(buildGround());

// (The future plot area is the bare dirt clearing — no overlay grid.)

// --- Asset loading + instanced scattering ------------------------------------
type ScatterSpec = {
  file: string;
  count: number;
  minR: number;
  maxR: number;
  scale: [number, number];
  shadow?: boolean;
};

const FOREST: ScatterSpec[] = [
  { file: "tree_default", count: 90, minR: PLOT_RADIUS + 6, maxR: 150, scale: [0.9, 1.4] },
  { file: "tree_oak", count: 70, minR: PLOT_RADIUS + 8, maxR: 170, scale: [0.9, 1.5] },
  { file: "tree_pineTallA", count: 60, minR: PLOT_RADIUS + 10, maxR: 190, scale: [0.9, 1.4] },
  { file: "tree_fat", count: 30, minR: PLOT_RADIUS + 6, maxR: 120, scale: [0.8, 1.2] },
  { file: "tree_detailed", count: 40, minR: PLOT_RADIUS + 8, maxR: 160, scale: [0.9, 1.3] },
  { file: "plant_bushLarge", count: 80, minR: PLOT_RADIUS + 4, maxR: 120, scale: [0.8, 1.4] },
  { file: "plant_bushSmall", count: 90, minR: PLOT_RADIUS + 3, maxR: 100, scale: [0.8, 1.5] },
  { file: "rock_largeA", count: 18, minR: PLOT_RADIUS + 5, maxR: 160, scale: [0.7, 1.3] },
  { file: "rock_smallA", count: 50, minR: PLOT_RADIUS + 3, maxR: 140, scale: [0.7, 1.4] },
  { file: "grass", count: 220, minR: PLOT_RADIUS + 1, maxR: 90, scale: [0.8, 1.6], shadow: false },
  { file: "flower_yellowA", count: 60, minR: PLOT_RADIUS + 2, maxR: 70, scale: [0.8, 1.3], shadow: false },
  { file: "flower_redA", count: 45, minR: PLOT_RADIUS + 2, maxR: 70, scale: [0.8, 1.3], shadow: false },
  { file: "mushroom_tanGroup", count: 24, minR: PLOT_RADIUS + 4, maxR: 80, scale: [0.8, 1.3], shadow: false },
  { file: "log_large", count: 12, minR: PLOT_RADIUS + 6, maxR: 100, scale: [0.8, 1.2] },
];

const loader = new GLTFLoader();
const worldGroup = new THREE.Group();
scene.add(worldGroup);

function scatterTransforms(spec: ScatterSpec): THREE.Matrix4[] {
  const matrices: THREE.Matrix4[] = [];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < spec.count; i++) {
    // Squared falloff keeps the middle sparse, the rim dense.
    const t = rand();
    const r = spec.minR + (spec.maxR - spec.minR) * t * t;
    const theta = rand() * Math.PI * 2;
    pos.set(Math.cos(theta) * r, 0, Math.sin(theta) * r);
    quat.setFromAxisAngle(up, rand() * Math.PI * 2);
    const s = spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]);
    scale.set(s, s, s);
    matrices.push(new THREE.Matrix4().compose(pos, quat, scale));
  }
  return matrices;
}

async function loadScatter(spec: ScatterSpec): Promise<void> {
  const gltf = await loader.loadAsync(`${MODELS}${spec.file}.glb`);
  let source: THREE.Mesh | null = null;
  gltf.scene.traverse((child) => {
    if (!source && (child as THREE.Mesh).isMesh) source = child as THREE.Mesh;
  });
  if (!source) return;
  const geometry = (source as THREE.Mesh).geometry;
  const material = (source as THREE.Mesh).material;
  const instanced = new THREE.InstancedMesh(geometry, Array.isArray(material) ? material[0]! : material, spec.count);
  instanced.castShadow = spec.shadow !== false;
  instanced.receiveShadow = false;
  const matrices = scatterTransforms(spec);
  matrices.forEach((matrix, i) => instanced.setMatrixAt(i, matrix));
  instanced.instanceMatrix.needsUpdate = true;
  worldGroup.add(instanced);
}

async function buildWorld(): Promise<void> {
  // Small concurrency pool keeps the loader honest on slow disks.
  const queue = [...FOREST];
  const workers = Array.from({ length: 6 }, async () => {
    let spec: ScatterSpec | undefined;
    while ((spec = queue.shift())) await loadScatter(spec);
  });
  await Promise.all(workers);
  console.log(`world ready — ${FOREST.reduce((n, s) => n + s.count, 0)} instances`);
}

// --- RTS camera ---------------------------------------------------------------
const controls = {
  target: new THREE.Vector3(0, 0, 0),
  azimuth: -Math.PI / 4,
  pitch: THREE.MathUtils.degToRad(52),
  distance: 70,
  minDistance: 14,
  maxDistance: 100,
};

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

function rayToGround(clientX: number, clientY: number): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, hit) ? hit : null;
}

let panning = false;
let lastX = 0;
let lastY = 0;
let rotating = false;

// Held-movement keys (WASD + arrows) for keyboard panning / rotation.
const keys = new Set<string>();

// Left-drag on empty ground pans; right/middle-drag also pan; Shift+right-drag
// rotates. (There is nothing to select in this prototype, so left-drag is free.)
function beginPan(e: PointerEvent, rotate: boolean) {
  panning = true;
  rotating = rotate;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  if (e.button === 0) beginPan(e, false);
  if (e.button === 2) beginPan(e, e.shiftKey);
  if (e.button === 1) beginPan(e, false);
});
canvas.addEventListener("pointermove", (e) => {
  if (!panning) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (rotating) {
    controls.azimuth -= dx * 0.008;
    controls.pitch = THREE.MathUtils.clamp(
      controls.pitch + dy * 0.005,
      THREE.MathUtils.degToRad(25),
      THREE.MathUtils.degToRad(72),
    );
  } else {
    // Pan parallel to the ground: move the target with the drag, scaled by zoom.
    const speed = controls.distance * 0.0016;
    const forward = new THREE.Vector3(Math.sin(controls.azimuth), 0, Math.cos(controls.azimuth));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    controls.target.addScaledVector(right, dx * speed).addScaledVector(forward, dy * speed);
    clampTarget();
  }
});
canvas.addEventListener("pointerup", (e) => {
  panning = false;
  rotating = false;
  canvas.releasePointerCapture(e.pointerId);
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const before = rayToGround(e.clientX, e.clientY);
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    controls.distance = THREE.MathUtils.clamp(controls.distance * factor, controls.minDistance, controls.maxDistance);
    // Zoom at cursor: after changing distance, re-aim so the ground point under
    // the cursor stays under the cursor.
    if (before) {
      const after = rayToGround(e.clientX, e.clientY);
      if (after) controls.target.add(before.clone().sub(after));
      clampTarget();
    }
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});
window.addEventListener("blur", () => keys.clear());

/** Keyboard movement, applied per frame. */
function applyKeyboard(dtSeconds: number) {
  const moveSpeed = controls.distance * 0.9 * dtSeconds;
  const forward = new THREE.Vector3(Math.sin(controls.azimuth), 0, Math.cos(controls.azimuth));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  if (keys.has("w") || keys.has("arrowup")) controls.target.addScaledVector(forward, -moveSpeed);
  if (keys.has("s") || keys.has("arrowdown")) controls.target.addScaledVector(forward, moveSpeed);
  if (keys.has("a") || keys.has("arrowleft")) controls.target.addScaledVector(right, -moveSpeed);
  if (keys.has("d") || keys.has("arrowright")) controls.target.addScaledVector(right, moveSpeed);
  if (keys.has("q")) controls.azimuth += 1.4 * dtSeconds;
  if (keys.has("e")) controls.azimuth -= 1.4 * dtSeconds;
  if (keys.size) clampTarget();
}

function clampTarget() {
  controls.target.x = THREE.MathUtils.clamp(controls.target.x, -WORLD_RADIUS * 0.7, WORLD_RADIUS * 0.7);
  controls.target.z = THREE.MathUtils.clamp(controls.target.z, -WORLD_RADIUS * 0.7, WORLD_RADIUS * 0.7);
}

function updateCamera() {
  const { target, azimuth, pitch, distance } = controls;
  const y = Math.sin(pitch) * distance;
  const horizontal = Math.cos(pitch) * distance;
  camera.position.set(
    target.x - Math.sin(azimuth) * horizontal,
    y,
    target.z - Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(target);
  // Keep the shadow box centered on what we're looking at.
  sun.target.position.copy(target);
  sun.position.set(target.x + 60, 90, target.z + 30);
  const s = 90;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.updateProjectionMatrix();
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Clock for frame-rate-independent keyboard movement.
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  applyKeyboard(Math.min(clock.getDelta(), 0.1));
  updateCamera();
  renderer.render(scene, camera);
});

buildWorld().catch((error) => {
  console.error("world build failed", error);
});
