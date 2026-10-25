---
title: "小项目：给手表温度做一张 App 卡片"
description: "从STM32快照、BW16转发到Flutter解析、页面和错误测试，完成一个只读业务扩展。"
---
先完成[echo练习](/docs/crabit/integration-lab/)。这次不再只改字符串，而是用现有接口做一张新的业务卡片，理解数据来自哪里、怎样解析、什么时候不能展示为成功。

本章复用 `diag/snapshot`，不新增固件指令、不改UUID或串口协议。新增业务显示不一定需要新增底层接口。提供的完整代码在 `showcase/examples/snapshot/`，不会自动加入产品，也不会操作硬件。

## 1. 先定下产品语义

| 项目 | 本例约定 |
| --- | --- |
| 展示对象 | BMP280驱动上报的芯片温度，不是体温，不保证等于室温 |
| 请求 | `diag/snapshot`，空value；手动读取，不持续轮询 |
| 响应来源 | STM32 `event_bus.h` 发布的已有快照，BW16转发 |
| 关心字段 | `bmp`中第二个数为温度；`age`为设备生成响应时的快照年龄，毫秒 |
| 失败 | 不可用、字段缺失/重复、非有限数、负年龄、请求超时、断连 |
| 过期示例策略 | 上报age大于5000ms不展示温度；这是教程的显示策略，不是硬件精度保证 |

现有远程快照没有每个传感器的 `is_valid`，因此本例只能叫“报告温度”，不能把合法数值当成传感器可靠在线。`age`也不是温度传感器自己的更新时间。完整可靠的远程测量需另行设计有效位和采样时间，不能偷偷用零值代替失败。

## 2. 在STM32找出真正的数据

依次打开：

1. `firmware/stm32/Core/Src/nanoui_port.cpp` 的 `PublishSensorSnapshot()`，看采集结果怎样复制进 `StmSensorSnapshot`。
2. `firmware/stm32/Core/NanoUI/app_real/app_bmp280.h` 的 `onTick()`，看本地页面怎样读快照。
3. `firmware/stm32/Core/Inc/event_bus.h` 的 `diag/snapshot` 分支，看对外如何编码。

本地页面的真实片段：

```cpp
StmSensorSnapshot snapshot{};
if (!STM32_GetUiSensorSnapshot(snapshot))
    return;
const auto* data = &snapshot.pressure;
```

后面先检查 `data->is_valid`，再把 `data->temperature` 格式化到App成员 `str_temp`。`buildUI()`用这个缓存组合行，不在绘制期间访问I2C。

远程分支的格式串则为：

```text
imu=...;opt=...;bmp=压力,温度;bat=...;at=...;age=...
```

请在源码中核对传给 `snprintf()` 的参数顺序，不按字段名字猜单位，也不要把压力值当温度。编码失败或快照不可用可能返回 `unavailable`。

### 先做一个本地阅读练习

在 `app_bmp280.h` 中找到成员缓存、有效性判断、`FormatFixed1()`、`BuildSensorMenuRow()`各自的位置。解释为什么改布局只需改 `buildUI()`，而新加一行不需要重新初始化BMP280。

想练习改本地布局，可在自己的分支交换“当前气压”和“当前温度”两行，再按[构建教程](/docs/crabit/update/)编译；本章没有执行该硬件改动。不要为了这一练习改采集任务、供电或驱动。

## 3. BW16为什么不必改

普通认证后业务进入 `RadioSvc.cpp` 的 `UART_FORWARD` 队列，`Protocol::send_to_stm32()`提取topic、value、请求号，编码为CrabitWire帧。STM32回相同请求号后，客户端处理响应。

复用已有topic就能取得数据，不需要给Arduino再装一个温度库，也不需要让BLE回调读STM32的传感器。先画出这条链，再决定是否真需要新接口。

## 4. 新增Flutter业务组件

完整文件 `showcase/examples/snapshot/temperature_card.dart` 包含两部分：

- `ReportedTemperature.parse()`：纯数据解析，拒绝缺字段、重复字段、非法数字。
- `TutorialTemperatureCard`：订阅已有 `DeviceCenterController`，读取快照并显示状态。

![新卡片的实际Flutter测试渲染，明确标注模拟数据](/media/crabit/sensor-project.png)

*本章组件与现有App主题的真实渲染，数据来自FakeDeviceLink；不是手表实测。*

关键调用只有：

```dart
controller.readDiagnostic('diag/snapshot')
```

这保留了现有控制器的认证、请求排队、旧会话结果丢弃和错误处理；卡片不会自己扫描或连接BLE，也不自己创建第二个蓝牙管理器。

先做下面的隔离测试，不急着改主界面。所有命令从仓库根目录运行：

```powershell
$repo = (Get-Location).Path
if (-not (Test-Path apps/mobile/pubspec.yaml)) { throw '请先进入源码根目录' }
New-Item -ItemType Directory -Force apps/mobile/build/tutorial-snapshot
Copy-Item showcase/examples/snapshot/temperature_card.dart apps/mobile/build/tutorial-snapshot/
Copy-Item showcase/examples/snapshot/temperature_card_test.dart apps/mobile/build/tutorial-snapshot/
Copy-Item apps/mobile/test/support/fake_device_link.dart apps/mobile/build/tutorial-snapshot/
cd apps/mobile
flutter pub get
flutter test build/tutorial-snapshot/temperature_card_test.dart
```

`build/`是隔离的生成目录，不能作为长期业务源码位置；源码保存在showcase示例中。`fake_device_link.dart`是现有测试替身，记录请求并返回指定数据，不调用蓝牙插件。

## 5. 为什么要先测失败

测试文件实际覆盖：

- 0°C是合法报告值，不被误当作失败。
- NaN、Infinity、负年龄、缺失字段与重复字段不进入数值展示。
- 未验证连接时按钮不可点。
- 点击一次只发一次空value的snapshot请求。
- 成功后再次读取超时，旧成功温度不再留在页面。
- 断连后显示连接提示，不继续显示旧成功。
- 已过期与 `unavailable` 不展示成有效温度。

通过的是主机解析与Widget行为；没有证明当前手表温度准确。测试中的模拟数字不能写成实测精度或硬件验收。

## 6. 接进自己的产品界面

这次只添加卡片，不替换原始快照卡，原按钮和断言都保留。仍在同一个终端时，先用前面记住的repo变量回到根目录；重开终端则先按准备章进入根目录、重新设置repo。

```powershell
Set-Location $repo
Copy-Item showcase/examples/snapshot/temperature_card.dart apps/mobile/lib/presentation/widgets/tutorial_temperature_card.dart
```

打开 `apps/mobile/lib/presentation/pages/home/dashboard_page.dart`，添加导入：

```dart
import '../../widgets/tutorial_temperature_card.dart';
```

找到设备页布局中这两行（位于原有snapshot与Wi-Fi卡之后、电池卡之前）：

```dart
const SizedBox(height: 16),
if (widget.batteryController case final battery?) ...[
```

只在两行之间加入新卡及间距，变成：

```dart
const SizedBox(height: 16),
TutorialTemperatureCard(controller: _controller),
const SizedBox(height: 16),
if (widget.batteryController case final battery?) ...[
```

后面原有的电池卡代码保持不动；前面的status变量和diag-snapshot按钮也不动。新组件自己订阅已有控制器，不需要你创建第二个控制器或蓝牙实例。页面更长是正常的，向下滚动能找到“传感器温度 · 教程扩展”。

```powershell
Set-Location (Join-Path $repo 'apps/mobile')
flutter analyze
flutter test build/tutorial-snapshot/temperature_card_test.dart
flutter test test/device_center_page_test.dart
flutter run -d windows
```

本章提供的是独立组件的实测测试；上述产品页面接入由读者在自己的分支执行，并未自动应用到交付App。测试失败时保留错误，不通过删除断言来继续。恢复时移除刚加的两行与导入，原有卡片不需要重建。

## 7. 设备在手时完成闭环

1. 运行自己的新Flutter构建，按[连接步骤](/docs/crabit/connect/)完成通信验证。
2. 手动点击“读取快照”，确认结果不是旧exe或固定测试数据。
3. 对照手表“传感器 → 环境气压”中的温度。同一时刻的采样可能不同；数字接近不能代替有效位和时间检查。
4. 断开连接，确认卡片不再显示旧成功；恢复连接后需要重新读。
5. 记录客户端版本、双端固件版本、操作及结果。没有实机就记录“仅主机通过”。

这是一次性读取卡片，不是实时仪表。显示的age是响应生成时的值，不会随客户端等待自动增长，也不是从传感器最后一次成功采样起计时；不要把打开很久的卡片当实时数据。持续监控应另外设计采样时间、客户端过期计时、订阅开关与功耗预算。

## 完成标准

能独立找出本地有效位与远程协议的差异；能解释为什么这次不需要改BW16；能把新组件接到已有控制器；能通过Fake测试并分别记录硬件结果。下一次真要新增topic时，先把数据契约、两端实现、限长、有效位和测试写完整，再进入烧录流程。
