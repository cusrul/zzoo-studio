---
title: "源码导读：Flutter 如何连接设备"
description: "从启动、页面和状态，到设备控制器与 BLE 传输边界。"
---
本章沿用仓库里的真实 Flutter 客户端代码，带你读懂一次只读诊断如何从页面发出、经控制器和传输层返回，再显示在页面上。这里讲的是理解与本机测试；运行 Flutter 原生客户端需要 Flutter/平台工具链，页面能运行不代表手表硬件已验证。

第一次接触Flutter先做[独立页面练习](/docs/crabit/flutter-first-page/)。本章是后续源码导读，不是第一份要复制运行的程序。

## 从启动到首页

入口是 `apps/mobile/lib/main.dart`。启动顺序可以概括为：

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await StorageManager().init();
  runApp(const MyApp());
}
```

`main` 是 Dart 程序入口；`ensureInitialized` 让 Flutter 插件可在启动阶段使用；`await` 表示等本地 Hive 存储初始化完成；`runApp` 把根 Widget 交给 Flutter。`MyApp` 创建 `MaterialApp`，默认首页是 `HomePage`。实际页面导航和页面列表在 `apps/mobile/lib/presentation/pages/home/home_page.dart`。

## 页面、Widget 与状态

Flutter 界面由 Widget 组合而成。`StatelessWidget` 适合只根据输入绘制内容的组件；需要在自身保存会变化的界面状态时，使用 `StatefulWidget` 和对应的 `State`。调用 `setState` 会告知 Flutter 重新构建该 State 管理的界面；它不会自动保存到磁盘，也不应被当作设备通信层。

Crabit 的首页是 `StatefulWidget`：`_HomePageState` 持有当前导航索引 `_selected`，`_select` 用 `setState` 更新它。设备中心更进一步，把设备状态放进 `DeviceCenterController`，页面订阅控制器而不是自己实现 BLE 协议。

## 分清页面、控制器和传输

可以把三层理解为：

| 层 | 本项目例子 | 负责什么 |
| --- | --- | --- |
| 页面 / 展示 | `presentation/pages/home/dashboard_page.dart` | 画连接状态、按钮与读数；响应用户点击 |
| 设备控制器 / 业务状态 | `core/device/device_center_controller.dart` | 判定是否就绪、允许哪些诊断、保存本次结果和错误 |
| 设备链接与传输 | `core/device/device_link.dart`、`core/managers/ble_manager.dart`、`core/transport/ble_transport.dart` | 把设备操作交给 BLE 管理器和受检查的请求通道 |

`DeviceLink` 是接口（抽象约定）：它声明连接、验证和读取等动作，不描述页面长什么样。真实实现 `BleDeviceLink` 把 `read` 转给 `BleManager.requestDiagnosticChecked`。控制器注释也明确：展示状态由控制器管理，请求/队列所有权仍属于已建立的传输层。

## 跟踪一次 diag/echo 请求与结果

以下是从“设备”页面触发的只读诊断路径。连接需先完成验证；仅打开页面不会自动连接或扫描。页面上的回调最终调用控制器 `readDiagnostic(topic)`，控制器只允许 `diag/echo`、`diag/snapshot`、`diag/wifi`，并检查连接已就绪。

以 echo 为例，控制器为它准备固定测试值并调用链接：

```dart
final value = topic == 'diag/echo' ? 'crabit-check' : '';
final reply = await link.read(topic, value);
if (reply.topic != topic ||
    (topic == 'diag/echo' && reply.value != value)) {
  throw const TransportException(TransportErrorCode.protocolError);
}
_results[topic] = DeviceReading(event: reply, elapsed: stopwatch.elapsed);
```

`await` 在响应回来前暂停这段异步函数；它不会阻塞整个界面线程。控制器还会检查会话是否已变化、设备是否仍就绪，避免把断线前的迟到结果当作新结果。随后通知监听者，页面重建并由结果卡显示读数或错误。超时会显示错误，不会自动重发；用户可以手动重试。

这段路径可沿源码继续阅读：

1. `apps/mobile/lib/presentation/pages/home/dashboard_page.dart`：设备中心页面与按钮回调。
2. `apps/mobile/lib/core/device/device_center_controller.dart`：`readDiagnostic` 的允许列表、echo 值、回复检查与结果保存。
3. `apps/mobile/lib/core/device/device_link.dart`：`BleDeviceLink.read` 转发到 `requestDiagnosticChecked`。
4. `apps/mobile/lib/core/managers/ble_manager.dart` 与 `apps/mobile/lib/core/transport/ble_transport.dart`：BLE 管理与诊断请求/回复契约。
5. `apps/mobile/lib/presentation/widgets/device_reading_card.dart`：把控制器提供的结果显示为卡片。

不要把“BLE 已连接”误认为整条路径已成功：设备码认证与传输验证是独立状态，页面只有就绪后才开放诊断读取。

## 检查点：不接硬件也能验证什么

在 Windows PowerShell 中运行现有 Flutter 测试：

```powershell
cd apps/mobile
flutter test test/device_center_controller_test.dart
flutter test test/device_center_page_test.dart
```

源码中可核对的测试名包括：

- `device_center_controller_test.dart`：`timed out manual refresh cannot retain an earlier success`，检查超时刷新不会保留旧成功结果，且没有自动重发。
- `device_center_controller_test.dart`：`old failure after cancellation cannot release a newer read`，检查取消后的旧操作不会破坏新读取。
- `device_center_page_test.dart`：`device center renders and operates at ... with large text`，检查页面按钮是否传递预期的 echo/snapshot/Wi-Fi 请求。

测试用 Fake 链接替代真实蓝牙设备；它们验证 Dart 层的状态与界面行为，不证明蓝牙射频、固件回应或真实手表兼容性。首次运行前确认本机已安装 Flutter SDK 并执行过 `flutter pub get`；Windows 原生运行还需要匹配的桌面 C++ 工具链。此教程没有声称这些测试在当前机器已运行。

## 常见卡点

- 按钮不可用：先看控制器的 `isReady` 条件；连接、认证、配对传输验证和扫描状态共同影响可读状态。
- 显示超时：检查设备是否仍连接、请求是否到达对应固件版本；不要把超时当作成功，也不要认为客户端会自动重发。
- 改了界面但不更新：确认变化是否通过 `setState` 或控制器通知触发重建；不要把临时 UI 状态误当作持久化设置。
- 找不到 `flutter` 命令或 Windows 构建失败：分别确认 Flutter SDK / PATH 与 Windows C++ 桌面工具链。`flutter test` 的主机测试通过仍不等于原生桌面构建或硬件验收。

下一步做[贯通练习](/docs/crabit/integration-lab/)，并用[系统调用链](/docs/crabit/system-walkthrough/)核对每一端。需要复习C++控件组合可回到[UI 开发](/docs/crabit/ui-development/)。使用入口见[App指南](/docs/crabit/app-guide/)和[连接说明](/docs/crabit/connect/)。
