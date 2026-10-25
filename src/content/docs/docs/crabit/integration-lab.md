---
title: "贯通练习：改变一条只读请求"
description: "不重写底层协议，修改 echo 内容并用主机测试和真实链路分别验收。"
---
先完成[UI练习](/docs/crabit/ui-development/)、[Flutter入门](/docs/crabit/flutter-development/)与[系统链路](/docs/crabit/system-walkthrough/)。本练习不增加新指令，不改BLE、UUID、UART、电源、固件或Flash布局。

## 目标

让 Flutter 发出你自己的短文本，经 BW16 到 STM32，再原样回来。你要能证明返回值是这次请求的值，而不是固定“成功”或 BW16 本地 TEST 回包。

## 第一步：保留检查点

在自己的开发分支工作，先确认已有修改已保存；不要覆盖别人的工作。只计划修改两个Dart文件，先不要烧录。

打开 `apps/mobile/lib/core/device/device_center_controller.dart`，在 `readDiagnostic()` 中找到：

```dart
final value = topic == 'diag/echo' ? 'crabit-check' : '';
```

仅把测试内容改为：

```dart
final value = topic == 'diag/echo' ? 'my-first-echo' : '';
```

保留 topic、返回值检查和会话检查。不要修改 `AUTH` 或 `TEST:` 分支来绕过认证。

## 第二步：先让测试承认你的设计变化

打开 `apps/mobile/test/device_center_controller_test.dart`，找到真实测试名：

```text
diagnostics are manual, whitelisted, and use exact request values
```

该测试期望读取列表包含 `('diag/echo', 'crabit-check')`。只把这里的期望内容同步为 `my-first-echo`，不要删除断言，也不要全仓替换所有echo字符串。

在 `apps/mobile` 运行：

```powershell
flutter test test/device_center_controller_test.dart
flutter test test/device_center_page_test.dart
```

若旧期望失败，先看请求列表差异；若失败来自连接状态，不通过取消认证检查来“修复”测试。这些测试用 Fake 设备，不访问手表；通过只表示Dart接口行为符合预期。

## 第三步：确认为什么固件不必改

STM32 `event_bus.h` 中 `diag/echo` 把 `message.value` 原样发布，BW16承担转发。它没有写死 `crabit-check`，所以短文本改变不需要发明新协议或重烧双端固件。

这与新增 `diag/my-sensor` 不同：新的 topic 必须同时有固件实现、客户端允许列表、响应约定和测试。未知命令超时不是串口必然坏了。

## 第四步：设备在手时再验收

运行你自己的新 Flutter 构建，按[连接教程](/docs/crabit/connect/)完成认证与传输验证。在设备页找到连接诊断的echo读取，发起一次请求，检查结果包含你修改的值。

没有实体设备就停在这里，记录“主机测试通过，跨端未验证”，不要用模拟成功图代替这一步。如果结果仍是旧值，先确认启动的是新构建，而不是历史目录的exe。

## 最终验收

- 能在代码中指出发送值、响应检查、超时与旧会话丢弃的位置。
- 能指出STM32实际处理echo的分支，并解释BW16本地TEST为什么不能代替它。
- Fake测试和实体往返分别记录，不混淆证据。
- 完成后恢复教程改动或作为自己的功能提交，保留原测试目的，不改协议与硬件路径。

这是一次理解与修改既有端到端能力的练习，不等于已经学会独立设计任意新协议。下一步做[传感器温度卡片小项目](/docs/crabit/sensor-project/)，学习数据契约、解析、组件接入和失败测试。
