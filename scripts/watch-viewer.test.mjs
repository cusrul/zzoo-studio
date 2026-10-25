import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  bindings,
  FRAME_BYTES,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  hashPackedFrame,
  unpackPackedMsbFrame,
} from '../public/watch-demo/model_bindings.js';
import { pickVisibleButton } from '../public/watch-demo/picking.js';
import {
  attachPreservingWorldTransform,
  modelTiltQuaternion,
  poseBlendWeight,
  validPoseQuaternion,
} from '../public/watch-demo/pose_transform.js';

test('screen bindings retain the physical three-button mapping', () => {
  assert.deepEqual(bindings.buttons.map(({ key, label }) => [key, label]), [
    [0, '上'], [1, '下'], [2, '确认'],
  ]);
});

test('packed MSB-first frame expands to the expected 128x64 RGBA pixels', () => {
  const packed = new Uint8Array(FRAME_BYTES);
  packed[0] = 0x81;
  packed[FRAME_BYTES - 1] = 0x01;
  const rgba = unpackPackedMsbFrame(packed);
  const channel = pixel => rgba[pixel * 4];

  assert.equal(FRAME_WIDTH, 128);
  assert.equal(FRAME_HEIGHT, 64);
  assert.equal(rgba.length, FRAME_WIDTH * FRAME_HEIGHT * 4);
  assert.equal(channel(0), 245);
  assert.equal(channel(1), 0);
  assert.equal(channel(7), 245);
  assert.equal(channel(FRAME_WIDTH * FRAME_HEIGHT - 1), 245);
  assert.equal(rgba[3], 255);
  assert.throws(() => unpackPackedMsbFrame(new Uint8Array(FRAME_BYTES - 1)), /packed frame bytes/);
});

test('packed-frame hash is deterministic and changes with the observed bytes', () => {
  const first = new Uint8Array(FRAME_BYTES);
  const second = first.slice();
  second[FRAME_BYTES - 1] = 1;
  assert.equal(hashPackedFrame(first), hashPackedFrame(first.slice()));
  assert.notEqual(hashPackedFrame(first), hashPackedFrame(second));
  assert.match(hashPackedFrame(first), /^[0-9a-f]{8}$/);
});

test('pose helpers validate quaternions and preserve world placement', () => {
  assert.equal(validPoseQuaternion([0, 0, 0, 1]), true);
  assert.equal(validPoseQuaternion([0, 0, 0, 0]), false);
  assert.equal(validPoseQuaternion([0, 0, Number.NaN, 1]), false);
  assert.deepEqual(modelTiltQuaternion([1, 2, 3, 4]), [-1, 2, -3, 4]);
  assert.equal(poseBlendWeight(0), 0);

  const parent = new THREE.Group();
  parent.position.set(2, 0, 0);
  const child = new THREE.Object3D();
  child.position.set(0, 1, 0);
  const scene = new THREE.Scene();
  scene.add(parent, child);
  scene.updateMatrixWorld(true);
  const before = child.getWorldPosition(new THREE.Vector3());
  attachPreservingWorldTransform(parent, child);
  scene.updateMatrixWorld(true);
  assert.ok(child.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9);
});

test('picking rejects a broad-phase key target when a nearer surface blocks it', () => {
  const model = new THREE.Group();
  const button = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), new THREE.MeshBasicMaterial());
  button.add(cap);
  model.add(button);
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 2));
  proxy.userData.key = 2;
  proxy.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  model.updateMatrixWorld(true);
  const buttons = [{ key: 2, node: button }];
  assert.equal(pickVisibleButton(ray, model, null, buttons, [proxy]), 2);

  const blocker = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshBasicMaterial());
  blocker.position.z = 0.5;
  model.add(blocker);
  model.updateMatrixWorld(true);
  assert.equal(pickVisibleButton(ray, model, null, buttons, [proxy]), null);
});
