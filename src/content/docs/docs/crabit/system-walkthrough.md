---
title: "源码导读：STM32、BW16 与跨端通信"
description: "从启动、应用、传感器到一次真实 echo 的源码路径，分清框架和产品边界。"
---
本章接在[开关与 NanoUI](/docs/crabit/ui-development/)之后。先不改代码，目标是能沿源码回答“谁在运行、数据在哪里、消息怎么回来”。主机上的模型只模拟部分页面和数据，并没有在电脑里运行两颗 MCU 的 SDK。

## 1. 两颗芯片不是两个随便启动的界面

STM32 是设备主控，负责本机 UI、输入、传感器、USB、电源和 BW16 模式协调。BW16 提供无线能力，也可以接管显示运行自己的应用。切换不只是页面导航，还涉及物理资源所有权。

```text
Flutter App（电脑/手机）
    ↕ BLE 请求与通知
BW16（无线、模式、协议转换）
    ↕ 板内 UART / CrabitWire v1
STM32（业务、传感器快照、设置、USB）
    ↕ NanoUI + 平台驱动
OLED 与物理输入
```

表中箭头表示数据关系，不是让你照着接线；手表板内 UART 不是额外暴露的调试串口。

## 2. STM32 从哪里开始读

按下面顺序打开文件，不必从所有 HAL 源码开始：

| 文件 | 先找什么 | 理解目标 |
| --- | --- | --- |
| `firmware/stm32/Core/Src/freertos.c` | 任务创建与入口 | FreeRTOS 调度多个任务，不是所有事都在一个无限循环里 |
| `firmware/stm32/Core/Src/nanoui_port.cpp` | `WindowManager wm`、`AppManager::init`、`AppManager::launch(new ClockApp())` | 平台创建显示/输入，挂接框架，再启动表盘 |
| `firmware/stm32/Core/NanoUI/app_real/app_clock.h` | `buildUI()`、菜单动作 | 表盘也是 Application，不是框架内部写死的特殊屏幕 |
| `firmware/stm32/Core/NanoUI/app_real/launcher.h` | `FolderSensorsApp`、`FolderSystemApp` | 菜单把文字、图标与 App 启动动作组合起来 |
| `firmware/stm32/Core/Inc/hw_input.h` | `poll()`、`EVT_OK`、BLE快捷键 | GPIO/传感器输入如何变成框架事件或产品快捷动作 |

FreeRTOS 的“任务”是调度单位；NanoUI 的“App”是产品的应用对象。启动一个 App 不等于创建一个 RTOS 线程。不要为每个按钮再建线程。

`nanoui_port.cpp` 的 UI 循环按当前模式决定是否执行框架更新和绘制。BW16 接管、帧应用和普通控件页面不是同时争用一块画布。新 App 不该自行初始化 OLED 来绕过这层协调。

## 3. 读懂一个现成菜单项

`launcher.h` 中真实的入口：

```cpp
{nullptr, "六轴姿态", []() { AppManager::launch(new SensorApp()); }},
```

前三部分依次是图标、名称、确认动作。这里的 lambda 是点击时才执行的函数，不是在构建菜单时就启动传感器页。

想新增纯 UI 页面时，应新增自己的 Application 头文件、在产品 launcher 中包含它、再添加同形菜单项；不要向 WindowManager 塞入产品菜单名称。
先把应用内容换成桌面示例验证过的静态文字与开关，再接传感器。产品 MCU 构建见[更新与构建](/docs/crabit/update/)，本章不要求先烧录。

## 4. 传感器值不是 UI 自己去总线上读

打开 `app_real/app_sensor.h`，`SensorApp::onTick()` 开头：

```cpp
StmSensorSnapshot snapshot{};
if (!STM32_GetUiSensorSnapshot(snapshot))
    return;
const auto* data = &snapshot.imu;
```

后面还会检查 `data->is_valid`，无效时显示 `N/A`。这是复制一份服务提供的数据，不是在每次绘制时读 QMI 的寄存器。

继续看 `nanoui_port.cpp` 的 `PublishSensorSnapshot()`：它从传感器管理器复制 IMU、电池、气压等数据，再发布快照。应用更新自己的成员文字缓存，渲染读这些缓存。理解这条路径后，先复制显示逻辑，不复制 I2C 初始化或供电控制到你的页面。

检查点：让你加一个电池读数，你应先找快照的数据字段、有效位和时间，而不是给 UI 增加另一个 I2C 读取线程。无效、过期和数值为零不是同一件事。

## 5. BW16 先读模式，再读 SDK

| 文件 | 职责 |
| --- | --- |
| `firmware/stm32/Core/Src/companion_ble.cpp` | STM32 后台蓝牙会话与状态 |
| `firmware/stm32/Core/NanoUI/app_real/app_cyber_link.h` | 产品侧 BW16 入口与交接流程 |
| `firmware/rtl8720dn/NanoUI/NanoUI.ino` | Arduino 产品构建入口 |
| `firmware/rtl8720dn/NanoUI/src/main_entry.cpp` | Arduino 应用运行与模式处理 |
| `firmware/rtl8720dn/NanoUI/RadioSvc.cpp` | 无线服务、认证、队列和通知路径 |
| `firmware/rtl8720dn/NanoUI/Protocol.cpp` | UART 协议编码及转发 |

正常后台 BLE 使用 STM32 协调的 `sys/mode=BLE` 路径；UI 模式是另一条资源交接路径。历史 ATTACH 实验代码存在，不代表应重新把它作为当前用户连接步骤。

六位验证码是应用层认证，不要等同于 SDK bond、系统配对或链路加密。普通 App 使用只需按[连接说明](/docs/crabit/connect/)操作；学习架构也不需要读出本地密码。

## 6. 沿一次 echo 走完整条链

先读[Flutter 开发](/docs/crabit/flutter-development/)里的控制器章节，再对应下表：

| 步骤 | 在哪里看 | 关键检查 |
| --- | --- | --- |
| 页面触发读取 | Flutter `dashboard_page.dart` 与 `DeviceCenterController.readDiagnostic()` | 不是点一下按钮就任意写 BLE；要先就绪 |
| 发送检查过的请求 | `core/device/device_link.dart`、`ble_manager.dart` | topic、value、请求关联与超时 |
| BW16 收到业务文本 | `RadioSvc.cpp` | 认证完成后，普通请求进入 `UART_FORWARD` 队列；不要在 SDK 回调中跑整段产品业务 |
| 转成板内消息 | `Protocol.cpp` 的 `send_to_stm32()` | 提取 `t`、`v`、`i`，交给 `send_message_checked()` |
| UART 帧编码 | `firmware/shared/crabit_wire.h` | CrabitWire v1，长度、请求号、CRC；不是随便向串口打印 JSON |
| STM32 处理 | `Core/Inc/event_bus.h` | `diag/echo` 原样返回 value，并保留 request_id |
| BW16 回通知、Flutter匹配结果 | 协议接收与 RadioSvc 通知，再到 Dart 请求处理 | BLE连接成功不能代替业务请求成功 |

STM32 中 echo 的实际核心：

```cpp
if (strcmp(message.topic, "diag/echo") == 0) {
    publish("diag/echo", message.value, message.request_id);
}
```

因此 BW16 的本地 `TEST:` 回包不能证明到达 STM32；`diag/echo` 才用于核对这段业务往返。也不要把 `diag/wifi` 当成同一路径：当前 BW16 会专门处理它，不能据此证明 STM32 传感器读取正常。

`topic` 是业务名字，`value` 是业务内容，`request_id` 是区分多次请求的编号。UART v1 的 `MAX_TOPIC=47`、`MAX_VALUE=191`；手机侧文本封装与 BLE 分包还有自己的限制，不能把其中一个数字当成所有端通用最大包长。

## 7. 新功能应该落在哪层

- 纯布局和输入：应用 Widget 与状态，不改无线服务。
- 显示已有传感器：读取快照，处理有效性，不新增总线所有者。
- 新的远程只读数据：先定义请求/结果和 Fake 测试，再按链路接业务；仅改 Flutter 页面不会让固件自动支持新 topic。
- 写设置：必须有保存与回读语义，不能把入队 ACK 当成已经写入。
- 电源、屏幕交接、烧录桥、Flash 布局：不属于入门 UI 练习，单独设计、保留恢复固件并实机验证。

## 8. 有问题按哪一端查

| 现象 | 优先核对 |
| --- | --- |
| 桌面界面就不对 | 应用布局、字库、状态生命周期，不先烧录 |
| 找不到广播 | 手表模式/蓝牙开启、BW16供电与广播，不先改Flutter布局 |
| 连接但认证失败 | 当前固件验证码与App本地配置是否匹配 |
| 认证过了、echo超时 | BW16转发、板内UART、STM32业务响应与请求关联 |
| echo过了、传感器无效 | 传感器快照有效位、时间和采集路径 |
| 重连后显示旧结果 | Dart会话与异步结果失效逻辑，不把旧成功当新成功 |

完成时应能不看目录表，复述一次按钮请求的去回路径，并指出每层检查什么。然后做[贯通练习](/docs/crabit/integration-lab/)，不要直接用未定义的新topic试错。
