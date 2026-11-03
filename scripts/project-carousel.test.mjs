import assert from "node:assert/strict";
import test from "node:test";
import { createProjectRotation } from "../src/scripts/project-carousel.js";

function fixture(count = 3) {
  const tasks = new Map();
  const changes = [];
  let id = 0;
  const rotation = createProjectRotation({ count, onChange: i => changes.push(i),
    schedule(fn, delay) { assert.equal(delay, 6500); tasks.set(++id, fn); return id; },
    cancel(key) { tasks.delete(key); },
  });
  return { rotation, tasks, changes, tick() {
    assert.equal(tasks.size, 1);
    const [key, fn] = tasks.entries().next().value;
    tasks.delete(key); fn();
  } };
}

test("one project has no automatic rotation", () => {
  const f = fixture(1);
  f.rotation.start(); f.rotation.next(); f.rotation.previous();
  assert.equal(f.tasks.size, 0);
  assert.deepEqual(f.changes, []);
});

test("multiple projects advance, wrap and support manual directions", () => {
  const f = fixture();
  f.rotation.start();
  f.tick(); f.tick(); f.tick(); f.rotation.previous();
  assert.deepEqual(f.changes, [1, 2, 0, 2]);
  assert.equal(f.tasks.size, 1);
});

test("hover and keyboard/model focus must both leave before rotation resumes", () => {
  const f = fixture();
  f.rotation.start();
  f.rotation.pause("hover", true); f.rotation.pause("focus", true);
  assert.equal(f.tasks.size, 0);
  f.rotation.pause("hover", false);
  assert.equal(f.tasks.size, 0);
  f.rotation.pause("focus", false);
  f.tick();
  assert.deepEqual(f.changes, [1]);
});

test("hidden, offscreen, drag and reduced-motion states pause without blocking manual navigation", () => {
  for (const reason of ["hidden", "offscreen", "drag", "motion"]) {
    const f = fixture(); f.rotation.start(); f.rotation.pause(reason, true);
    f.rotation.next();
    assert.deepEqual(f.changes, [1]);
    assert.equal(f.tasks.size, 0);
    f.rotation.pause(reason, false);
    assert.equal(f.tasks.size, 1);
  }
});

test("user pause survives hover changes and destruction clears scheduling", () => {
  const f = fixture(); f.rotation.start(); f.rotation.pause("user", true);
  f.rotation.pause("hover", true); f.rotation.pause("hover", false);
  assert.equal(f.tasks.size, 0);
  f.rotation.pause("user", false);
  f.rotation.destroy(); f.rotation.next(); f.rotation.pause("hidden", false);
  assert.equal(f.tasks.size, 0);
  assert.deepEqual(f.changes, []);
});
