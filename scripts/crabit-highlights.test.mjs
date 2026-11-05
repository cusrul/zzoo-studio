import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Crabit project page presents features and qualified power estimate", () => {
  const html = readFileSync("dist/projects/crabit/index.html", "utf8");
  for (const value of ["手势唤醒", "无线测试", "弹窗", "USB 脚本", "Arduboy", "NanoUI", "Flutter", "时间与天气", "0.5 mA", "26 mA", "500 mAh", "理论约 13 天", "不是整机实测续航"]) {
    assert.ok(html.includes(value), value);
  }
  assert.match(html, /仅用于自有或获授权/);
  assert.doesNotMatch(html, /保证续航\s*1.?2\s*周/);
});
