import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import createNanoUi from './nanoui.mjs';
import { PreviewData } from './preview_data.js';
import { decodeModelResponse } from './model_transport.js';
import {
  bindings,
  FRAME_BYTES,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  hashPackedFrame,
  unpackPackedMsbFrame,
} from './model_bindings.js';
import { pickVisibleButton } from './picking.js';
import {
  attachPreservingWorldTransform,
  validPoseQuaternion,
  modelTiltQuaternion,
  poseBlendWeight,
} from './pose_transform.js';

const status = document.querySelector('#status');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#fafaf8');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('role', 'img');
renderer.domElement.setAttribute('aria-label', 'Crabit 手表与实时 NanoUI 屏幕');
renderer.domElement.setAttribute('aria-description', '拖动旋转，滚轮或双指缩放。点实体侧键，或用方向键和 Enter 操作；长按确认返回。');
renderer.domElement.tabIndex = 0;
document.body.prepend(renderer.domElement);
const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableDamping = true;
controls.enabled = false;
controls.enableRotate = false;
controls.enableZoom = false;
scene.add(new THREE.HemisphereLight(0xffffff, 0x9099a3, 2.4));
const light = new THREE.DirectionalLight(0xffffff, 2.5);
light.position.set(-3, 6, -8);
scene.add(light);

const canvas = document.createElement('canvas');
canvas.width = FRAME_WIDTH;
canvas.height = FRAME_HEIGHT;
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('无法创建 OLED 画布');
ctx.fillStyle = 'black';
ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
const pixels = ctx.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;
texture.magFilter = THREE.NearestFilter;
texture.minFilter = THREE.NearestFilter;
texture.generateMipmaps = false;

const buttons = [];
const pickables = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const targetPose = new THREE.Quaternion();
const heldKeys = new Map();
let active = null;
let runtime = null;
let runtimeStarted = false;
let liveData = null;
let runtimeKind = 'unavailable';
let sequence = null;
let frameHash = null;
let frameCount = 0;
let simulationElapsedMs = 0;
let animationLastAt = null;
let animationHandle = null;
let disposed = false;
let model;
let poseRoot;
let screenPanel;
let presentationActive = true;
let followMode = false;
let loaded = false;

function showStatus(message, visible = true) {
  status.textContent = message;
  status.hidden = !visible;
  status.style.display = visible ? 'grid' : 'none';
}

function fail(error) {
  if (disposed) return;
  runtimeKind = 'error';
  showStatus(`预览无法运行：${error?.message ?? error}`);
  release(true);
  stopAnimation();
  if (runtimeStarted) {
    runtime._crabit_sim_stop();
    runtimeStarted = false;
  }
}

window.addEventListener('error', event => fail(event.error ?? event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));

function named(root, name) {
  let result;
  root.traverse(node => {
    if (node.name.replaceAll('.', '') === name.replaceAll('.', '')) result = node;
  });
  if (!result) throw new Error(`模型缺少部件 ${name}`);
  return result;
}

function boxProxy(bounds, key = null) {
  const size = bounds.getSize(new THREE.Vector3());
  const object = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z));
  object.position.copy(bounds.getCenter(new THREE.Vector3()));
  object.visible = false;
  object.userData.key = key;
  scene.add(object);
  attachPreservingWorldTransform(poseRoot, object);
  object.updateMatrixWorld(true);
  pickables.push(object);
  return object;
}

function attachScreen(root) {
  const screen = named(root, bindings.screen);
  const bounds = new THREE.Box3().setFromObject(screen);
  screen.traverse(node => {
    if (node.isMesh) node.material = new THREE.MeshBasicMaterial({ color: 0x050505 });
  });
  const width = bounds.getSize(new THREE.Vector3()).x * bindings.screenWidthFraction;
  // OLED has a 2:1 active area. Keep the CAD housing and give only its front
  // surface an unlit pixel plane, independent of the old image's UV rotation.
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  panel.position.copy(bounds.getCenter(new THREE.Vector3()));
  panel.position.z = bounds.min.z - 0.003;
  panel.rotation.y = Math.PI;
  scene.add(panel);
  attachPreservingWorldTransform(poseRoot, panel);
  screenPanel = panel;
}

function attachButtons(root) {
  for (const binding of bindings.buttons) {
    const node = named(root, binding.mesh);
    let cap;
    node.traverse(child => {
      // In this CAD export mat_28 is the protruding actuator. Keep solder
      // contacts and switch base stationary while the actuator moves.
      if (child.isMesh && child.material?.name.startsWith('mat_28')) cap = child;
    });
    if (!cap) throw new Error(`模型缺少按帽 ${binding.mesh}`);
    const bounds = new THREE.Box3().setFromObject(node);
    bounds.expandByScalar(0.10);
    const proxy = boxProxy(bounds, binding.key);
    buttons.push({ ...binding, node, cap, proxy, origin: cap.position.clone(),
      axis: new THREE.Vector3(...binding.inward), amount: 0, target: 0 });
  }
}

function pick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
    -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return pickVisibleButton(raycaster, model, screenPanel, buttons, pickables);
}

let lastRuntimeNow = 0;
function runtimeNow() {
  const activeRemainder = animationLastAt === null || !presentationActive || document.hidden
    ? 0
    : Math.max(0, performance.now() - animationLastAt);
  lastRuntimeNow = Math.max(lastRuntimeNow, Math.floor(simulationElapsedMs + activeRemainder));
  return lastRuntimeNow >>> 0;
}

function sendButton(key, pressed) {
  if (!runtimeStarted || disposed) return;
  runtime._crabit_sim_button(key, pressed, runtimeNow());
}

function updateControlAvailability() {
  controls.enabled = presentationActive && !followMode && active === null;
  controls.enableRotate = true;
  controls.enableZoom = true;
}

function press(key, source, pointerId = null) {
  if (!presentationActive || !loaded || !runtimeStarted || document.hidden || disposed) return false;
  if (active?.source === source) return true;
  if (active) release(true);
  active = { key, source, pointer: pointerId };
  const button = buttons.find(candidate => candidate.key === key);
  if (button) button.target = 1;
  updateControlAvailability();
  sendButton(key, 1);
  return true;
}

function release(cancel = false) {
  if (!active) return;
  const { key } = active;
  active = null;
  const button = buttons.find(candidate => candidate.key === key);
  if (button) button.target = 0;
  sendButton(key, cancel ? -1 : 0);
  updateControlAvailability();
}

function stopAnimation() {
  if (animationHandle !== null) cancelAnimationFrame(animationHandle);
  animationHandle = null;
  animationLastAt = null;
}

function startAnimation() {
  if (disposed || !loaded || !presentationActive || document.hidden || animationHandle !== null) return;
  animationLastAt = null;
  animationHandle = requestAnimationFrame(animate);
}

function updateFrame() {
  const generation = runtime._crabit_sim_generation() >>> 0;
  if (generation === sequence) return;
  const pointerValue = runtime._crabit_sim_frame();
  const start = Number(pointerValue) >>> 0;
  const heap = runtime.HEAPU8;
  if (!pointerValue || !heap || start + FRAME_BYTES > heap.length) {
    throw new Error('NanoUI 返回了无效画面指针');
  }
  // Copy before drawing: the simulator owns this borrowed memory and may
  // replace its contents on the next step.
  const packed = heap.slice(start, start + FRAME_BYTES);
  unpackPackedMsbFrame(packed, pixels.data);
  ctx.putImageData(pixels, 0, 0);
  texture.needsUpdate = true;
  sequence = generation;
  frameHash = hashPackedFrame(packed);
  frameCount++;
}

function animate(now) {
  animationHandle = null;
  if (disposed || !presentationActive || document.hidden || !loaded) {
    animationLastAt = null;
    return;
  }
  const elapsed = animationLastAt === null ? 0 : Math.max(0, now - animationLastAt);
  animationLastAt = now;
  simulationElapsedMs += elapsed;
  const dt = Math.min(elapsed / 1000, 0.1);
  liveData?.tick();
  runtime._crabit_sim_step(runtimeNow());
  updateFrame();
  if (poseRoot && followMode) poseRoot.quaternion.slerp(targetPose, poseBlendWeight(dt));
  for (const button of buttons) {
    button.amount += (button.target - button.amount) * (1 - Math.exp(-dt * 32));
    button.cap.position.copy(button.origin).addScaledVector(button.axis, button.amount * 0.055);
  }
  controls.update();
  renderer.render(scene, camera);
  animationHandle = requestAnimationFrame(animate);
}

function resize() {
  const width = Math.max(innerWidth, 1);
  const height = Math.max(innerHeight, 1);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (loaded) {
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const distance = Math.max(size.x / camera.aspect, size.y) /
      (2 * Math.tan(THREE.MathUtils.degToRad(18))) * 1.5;
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    controls.update();
    controls.saveState();
  }
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (!presentationActive || !loaded || event.button !== 0) return;
  if (active) { release(true); return; }
  const key = pick(event);
  if (key === null) return;
  event.stopImmediatePropagation();
  controls.enabled = false;
  if (press(key, `model:${event.pointerId}`, event.pointerId)) {
    active.x = event.clientX;
    active.y = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  }
}, true);
renderer.domElement.addEventListener('pointermove', event => {
  if (active?.pointer === event.pointerId &&
      Math.hypot(event.clientX - active.x, event.clientY - active.y) > 12 &&
      pick(event) !== active.key) release(true);
});
renderer.domElement.addEventListener('pointerup', event => {
  if (active?.pointer === event.pointerId) release(false);
});
renderer.domElement.addEventListener('pointercancel', () => release(true));
renderer.domElement.addEventListener('lostpointercapture', () => release(true));

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (active) release(true);
    else if (runtimeStarted) runtime._crabit_sim_button(2, -1, runtimeNow());
    return;
  }
  const key = event.key === 'ArrowUp' ? 0 : event.key === 'ArrowDown' ? 1 :
    event.key === 'Enter' || event.key === ' ' ? 2 : null;
  if (key === null || event.repeat || heldKeys.has(event.code)) return;
  event.preventDefault();
  heldKeys.set(event.code, key);
  press(key, `keyboard:${event.code}`);
});
window.addEventListener('keyup', event => {
  if (!heldKeys.has(event.code)) return;
  heldKeys.delete(event.code);
  if (active?.source === `keyboard:${event.code}`) release(false);
});
window.addEventListener('blur', () => {
  heldKeys.clear();
  release(true);
});

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    liveData?.setActive(false);
    heldKeys.clear();
    release(true);
    stopAnimation();
  } else {
    liveData?.setActive(presentationActive);
    startAnimation();
  }
});

function teardown() {
  if (disposed) return;
  liveData?.dispose();
  release(true);
  stopAnimation();
  disposed = true;
  if (runtimeStarted) {
    runtime._crabit_sim_stop();
    runtimeStarted = false;
  }
  controls.dispose();
  renderer.dispose();
}
window.addEventListener('pagehide', teardown, { once: true });

// Diagnostics expose observed simulator state only; all controls remain real
// NanoUI button calls and this surface does not synthesize a menu or frame.
window.crabitPreview = {
  setPresentation: ({ active: visible = true, follow = false } = {}) => {
    presentationActive = visible;
    liveData?.setActive(visible && !document.hidden);
    followMode = follow;
    updateControlAvailability();
    if (!visible) {
      release(true);
      stopAnimation();
    } else {
      startAnimation();
    }
  },
  setPose: (x, y, z, w, snap = false) => {
    const components = [x, y, z, w];
    if (!validPoseQuaternion(components) || !poseRoot) return false;
    targetPose.set(...modelTiltQuaternion(components)).normalize();
    if (snap || !followMode) poseRoot.quaternion.copy(targetPose);
    return true;
  },
  stats: () => ({
    sequence,
    frameCount,
    frameHash,
    dimensions: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    runtimeKind,
    simulationElapsedMs: runtimeNow(),
    buttons: buttons.map(button => ({ key: button.key, amount: button.amount, target: button.target })),
  }),
};

async function initialize() {
  try {
    showStatus('正在启动 NanoUI 模拟器…');
    runtime = await createNanoUi();
    if (disposed) return;
    const exports = [
      '_crabit_sim_start', '_crabit_sim_stop', '_crabit_sim_step',
      '_crabit_sim_button', '_crabit_sim_frame', '_crabit_sim_generation',
      '_crabit_sim_set_clock', '_crabit_sim_set_weather', '_crabit_sim_show_clock',
    ];
    if (!runtime?.HEAPU8 || exports.some(name => typeof runtime[name] !== 'function')) {
      throw new Error('NanoUI WASM 接口不完整');
    }
    if (runtime._crabit_sim_start() !== 0) throw new Error('NanoUI 模拟器启动失败');
    runtimeStarted = true;
    if (runtime._crabit_sim_show_clock() !== 0) throw new Error('NanoUI 表盘启动失败');
    let storage = null;
    try { storage = window.localStorage; } catch { /* storage may be disabled */ }
    liveData = new PreviewData(runtime, { storage,
      // Free weather API is only enabled in local development until public-use terms are settled.
      weatherEnabled: location.hostname === 'localhost' || location.hostname === '127.0.0.1',
      onStatus: text => {
      document.getElementById('data-label').textContent = text;
    } });
    liveData.setActive(presentationActive && !document.hidden);
    runtimeKind = 'emscripten-wasm';

    const response = await fetch('./model.glb.gz', { credentials: 'omit' });
    const modelBytes = await decodeModelResponse(response);
    if (disposed) return;
    const gltf = await new GLTFLoader().parseAsync(modelBytes, './');
    if (disposed) return;
    model = gltf.scene;
    model.updateMatrixWorld(true);
    const initialBounds = new THREE.Box3().setFromObject(model);
    const pivot = initialBounds.getCenter(new THREE.Vector3());
    poseRoot = new THREE.Group();
    poseRoot.position.copy(pivot);
    model.position.sub(pivot);
    poseRoot.add(model);
    scene.add(poseRoot);
    poseRoot.updateMatrixWorld(true);
    attachScreen(model);
    attachButtons(model);

    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const aspect = Math.max(innerWidth, 1) / Math.max(innerHeight, 1);
    const distance = Math.max(size.x / aspect, size.y) /
      (2 * Math.tan(THREE.MathUtils.degToRad(18))) * 1.5;
    camera.position.copy(center).add(new THREE.Vector3(0, 0.1, -distance));
    controls.target.copy(center);
    controls.minDistance = distance * 0.5;
    controls.maxDistance = distance * 2.5;
    controls.update();
    controls.saveState();
    resize();
    updateControlAvailability();
    updateFrame();
    loaded = true;
    showStatus('', false);
    startAnimation();
  } catch (error) {
    fail(error);
  }
}

void initialize();
