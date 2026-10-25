import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("built homepage presents the real logo and Flutter screens without prices or product sales links", () => {
  const html = readFileSync("dist/index.html", "utf8");
  assert.match(html, /\/brand\/zzoo\.svg/);
  const project = readFileSync("dist/projects/crabit/index.html", "utf8");
  for (const asset of ["home.png", "settings.png"]) {
    assert.ok(existsSync(`public/app/${asset}`));
    assert.ok(project.includes(`/app/${asset}`));
  }
  assert.doesNotMatch(html, /[¥￥]\s*\d|priceCny|href="\/products\//);
  assert.match(html, /淘宝店铺/);
  assert.match(html, /闲鱼主页/);
  assert.match(html, /待开放/);
  assert.doesNotMatch(html, /href="[^\"]*(?:taobao|goofish|xianyu)[^\"]*"/i);
});

test("brand navigation and documentation directory are project-neutral", () => {
  const home = readFileSync("dist/index.html", "utf8");
  const docs = readFileSync("dist/docs/index.html", "utf8");
  assert.match(home, /href="\/projects\/"/);
  assert.match(home, /href="\/docs\/"/);
  assert.doesNotMatch(home, /href="\/#crabit"|href="\/#app"/);
  assert.match(docs, /项目文档/);
  assert.match(docs, /href="\/docs\/crabit\/"/);
  assert.ok(existsSync("dist/docs/crabit/index.html"));
  assert.match(
    readFileSync("dist/projects/crabit/index.html", "utf8"),
    /手机端|电脑端/,
  );
});

test("model has no extra controls and homepage has no expanded-experience entry", () => {
  const html = readFileSync("public/watch-demo/index.html", "utf8");
  assert.doesNotMatch(html, /<details|<button|id="controls"|id="inspect"/);
  assert.doesNotMatch(
    readFileSync("dist/index.html", "utf8"),
    /展开体验|href="\/lab\/watch\//,
  );
  const viewer = readFileSync("public/watch-demo/viewer.js", "utf8");
  assert.match(viewer, /controls\.enableRotate = true/);
  assert.match(viewer, /controls\.enableZoom = true/);
  assert.doesNotMatch(viewer, /inspectMode|inspectButton/);
});

test("brand artwork is a real vector, not a raster embedded inside SVG", () => {
  const svg = readFileSync("public/brand/zzoo.svg", "utf8");
  assert.match(svg, /<svg\s/);
  assert.match(svg, /<path\s/);
  assert.doesNotMatch(svg, /<image\b|data:image|<filter\b/);
});
