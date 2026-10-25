import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import createNanoUi from '../public/watch-demo/nanoui.mjs';

test('real NanoUI Wasm renders, navigates, cancels, returns and reopens', async () => {
  const module = await createNanoUi();
  const frame = () => {
    const pointer = module._crabit_sim_frame();
    assert.notEqual(pointer, 0);
    return module.HEAPU8.slice(pointer, pointer + 1024);
  };
  const advance = (from, to) => {
    for (let now = from + 17; now < to; now += 17) module._crabit_sim_step(now);
    module._crabit_sim_step(to);
  };
  assert.equal(module._crabit_sim_frame(), 0);
  assert.equal(module._crabit_sim_start(), 0);
  assert.equal(module._crabit_sim_start(), 0);
  const root = frame();
  assert.ok(root.some((byte) => byte !== 0));
  assert.ok(module._crabit_sim_generation() > 0);
  module._crabit_sim_button(1, 1, 10);
  module._crabit_sim_step(10);
  assert.notDeepEqual(frame(), root);
  advance(10, 3000);
  const beforeCancel = module._crabit_sim_generation();
  module._crabit_sim_button(2, 1, 3010);
  module._crabit_sim_button(2, -1, 3011);
  module._crabit_sim_step(3011);
  assert.equal(module._crabit_sim_generation(), beforeCancel);
  const menu = frame();
  module._crabit_sim_button(2, 1, 3100);
  module._crabit_sim_button(2, 0, 3110);
  advance(3110, 5000);
  assert.notDeepEqual(frame(), menu);
  module._crabit_sim_button(2, 1, 5100);
  advance(5100, 7000);
  const back = frame();
  advance(7000, 8000);
  assert.deepEqual(frame(), back);
  module._crabit_sim_button(2, 0, 8001);
  advance(8001, 9000);
  assert.deepEqual(frame(), back);
  module._crabit_sim_stop();
  assert.equal(module._crabit_sim_frame(), 0);
  assert.equal(module._crabit_sim_generation(), 0);
  assert.equal(module._crabit_sim_start(), 0);
  assert.ok(frame().some((byte) => byte !== 0));
  module._crabit_sim_stop();
});

test('website model is byte-identical to the pinned Flutter model', () => {
  const provenance = JSON.parse(readFileSync('public/watch-demo/provenance.json', 'utf8'));
  const model = readFileSync('public/watch-demo/model.glb');
  assert.equal(createHash('sha256').update(model).digest('hex'), provenance.modelSha256);
  assert.equal(provenance.sourceCommit, '0a26ca553b87fcf1cb2b1deb77d0aacf034a00e9');
});

test('real clock and forecast inputs change existing NanoUI watch-face pixels', async () => {
  const runtime = await createNanoUi();
  assert.equal(runtime._crabit_sim_set_clock(1792926000), -1);
  assert.equal(runtime._crabit_sim_start(), 0);
  assert.equal(runtime._crabit_sim_show_clock(), 0);
  const frame = () => runtime.HEAPU8.slice(runtime._crabit_sim_frame(), runtime._crabit_sim_frame() + 1024);
  assert.equal(runtime._crabit_sim_set_clock(Date.UTC(2026, 9, 25, 11, 0) / 1000), 0);
  runtime._crabit_sim_step(1000);
  const before = frame();
  assert.equal(runtime._crabit_sim_set_clock(Date.UTC(2026, 9, 25, 11, 1) / 1000), 0);
  runtime._crabit_sim_step(2000);
  assert.notDeepEqual(frame(), before);
  const noWeather = frame();
  assert.equal(runtime._crabit_sim_set_weather(20261025, 63, 190, 229, 100, Date.UTC(2026,9,25,3,0) / 1000), 0);
  runtime._crabit_sim_step(3000);
  assert.notDeepEqual(frame(), noWeather);
  assert.equal(runtime._crabit_sim_set_weather(20260230, 0, 0, 1, 0, 1792926000), -1);
  runtime._crabit_sim_stop();
});
