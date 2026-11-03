import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0];
  assert.ok(footer);
  for (const href of [
    "https://7l2ggxehxy16y5ayzrou5ygndnxaatk.taobao.com/",
    "https://www.goofish.com/personal?userId=4183904906",
    "https://github.com/cusrul",
    "https://space.bilibili.com/378996894",
  ]) {
    assert.ok(footer.includes(`href="${href}"`));
  }
  assert.match(footer, /QQ 交流群：2156052701/);
  assert.doesNotMatch(footer, /本地预览|待开放|非个人 QQ|topIds=|shopSearchKeyword=|spm=/);
});

test("Crabit documentation has public issue and group help without rewriting imported snapshots", () => {
  const root = "dist/docs/crabit";
  const paths = ["index.html", ...readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => `${entry.name}/index.html`)];
  for (const path of paths) {
    const html = readFileSync(`${root}/${path}`, "utf8");
    assert.ok(html.includes('href="https://github.com/cusrul/Crabit/issues"'), path);
    assert.match(html, /2156052701/, path);
    assert.match(html, /操作步骤/, path);
    assert.doesNotMatch(html, /192\.168\.2\.226/);
  }
});

test("homepage enables rotation only for multiple real projects", () => {
  const html = readFileSync("dist/index.html", "utf8");
  const projects = JSON.parse(readFileSync("src/data/generated-projects.json", "utf8"));
  if (projects.length > 1) {
    assert.match(html, /<section\b[^>]*\bdata-project-carousel/);
    assert.match(html, /<button\b[^>]*\bdata-next/);
  } else {
    assert.doesNotMatch(html, /<section\b[^>]*\bdata-project-carousel|<button\b[^>]*\bdata-(?:previous|next)/);
  }
  assert.equal((html.match(/class="project-entry"/g) || []).length, projects.length);
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
