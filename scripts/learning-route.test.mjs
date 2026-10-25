import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('beginner route links to all imported learning chapters', () => {
  const route = readFileSync('dist/docs/crabit/develop/index.html', 'utf8');
  for (const slug of ['setup', 'first-app', 'ui-development', 'resources', 'flutter-first-page', 'system-walkthrough', 'flutter-development', 'integration-lab', 'sensor-project']) {
    assert.ok(route.includes(`/docs/crabit/${slug}/`), slug);
    const chapter = readFileSync(`dist/docs/crabit/${slug}/index.html`, 'utf8');
    assert.ok(chapter.includes('<h1'), slug);
    assert.ok(!chapter.includes('调用链（待补）'));
  }
});

test('novice lessons have runnable entry, recovery and no maintainer-only machine paths', () => {
  const setup = readFileSync('dist/docs/crabit/setup/index.html', 'utf8');
  assert.match(setup, /Visual Studio Code与Visual Studio/);
  assert.match(setup, /Test-Path/);
  for (const slug of ['setup', 'first-app', 'flutter-first-page']) {
    const chapter = readFileSync(`dist/docs/crabit/${slug}/index.html`, 'utf8');
    assert.doesNotMatch(chapter, /Users[/\\][^/\\]+[/\\]\.codex|programPlus|\.agents|codex.*worktrees/);
  }
  const first = readFileSync('dist/docs/crabit/first-app/index.html', 'utf8');
  assert.ok(first.includes('/media/crabit/first-app-hello.png'));
  assert.match(first, /出错与恢复/);
  const flutter = readFileSync('dist/docs/crabit/flutter-first-page/index.html', 'utf8');
  assert.ok(flutter.includes('/media/crabit/flutter-first-page.png'));
  assert.match(flutter, /pub get/);
  const sensor = readFileSync('dist/docs/crabit/sensor-project/index.html', 'utf8');
  assert.match(sensor, /只添加卡片，不替换/);
  const resources = readFileSync('dist/docs/crabit/resources/index.html', 'utf8');
  assert.match(resources, /extra_text/);
  assert.match(resources, /不删除测试/);
});

test('sensor project retains protocol limits and includes actual example rendering', () => {
  const chapter = readFileSync('dist/docs/crabit/sensor-project/index.html', 'utf8');
  assert.ok(chapter.includes('/media/crabit/sensor-project.png'));
  assert.match(chapter, /没有每个传感器/);
  assert.match(chapter, /不会随客户端等待自动增长/);
  assert.match(chapter, /temperature_card_test.dart/);
  assert.match(chapter, /未自动应用到交付App/);
  const image = readFileSync('public/media/crabit/sensor-project.png');
  assert.deepEqual([...image.subarray(0, 8)], [137,80,78,71,13,10,26,10]);
});

test('tutorial preserves nonhardware validation and real source anchors', () => {
  const ui = readFileSync('dist/docs/crabit/ui-development/index.html', 'utf8');
  assert.ok(ui.includes('/media/crabit/tutorial-panel.png'));
  assert.match(ui, /bool.*enabled/);
  const chain = readFileSync('dist/docs/crabit/system-walkthrough/index.html', 'utf8');
  for (const anchor of ['nanoui_port.cpp', 'event_bus.h', 'Protocol.cpp', 'request_id']) assert.ok(chain.includes(anchor));
  const lab = readFileSync('dist/docs/crabit/integration-lab/index.html', 'utf8');
  assert.match(lab, /my-first-echo/);
  assert.match(lab, /跨端未验证/);
});
