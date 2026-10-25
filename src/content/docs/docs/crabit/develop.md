---
title: "开始二次开发"
description: "NanoUI、双端固件与 Flutter 的入口。"
---
不必一次理解整块表。先在桌面跑一个界面，再逐步接触设备服务。
项目目标是开放硬件、固件与客户端；正式开放文件和使用权以公开仓库、
许可证及第三方素材声明为准，本地展示不代替授权。

## 按这条路线学习

没有学过编程也可以先完成动手课：照着改一个小地方，看到变化，再理解对应概念。源码导读不是必背前置知识。已有C++或Flutter经验可以跳过熟悉的动手课，但不要跳过版本和环境检查。

| 顺序 | 章节 | 完成标志 |
| --- | --- | --- |
| 0 | [源码与环境准备](/docs/crabit/setup/) | 找到根目录、会保存文件、工具能运行 |
| 1 | [第一个 NanoUI App](/docs/crabit/first-app/) | Windows 出图，知道运行哪个exe，能改标题 |
| 2 | [从一个开关看懂 NanoUI](/docs/crabit/ui-development/) | 自己组合两个开关，解释状态、输入、布局和对象寿命 |
| 3 | [字体与图片](/docs/crabit/resources/) | 知道资源属于哪个App，能定位缺字而不复制整个字体库 |
| 4 | [第一个Flutter页面](/docs/crabit/flutter-first-page/) | 不连设备，也能新增页面、改文字、按按钮改变数字 |
| 5 | [系统源码导读](/docs/crabit/system-walkthrough/)与[Flutter源码导读](/docs/crabit/flutter-development/) | 带着前面做过的操作，追踪启动、数据与请求 |
| 6 | [贯通练习](/docs/crabit/integration-lab/) | 修改既有只读请求并验证，不重写BLE或烧录桥 |
| 7 | [传感器卡片小项目](/docs/crabit/sensor-project/) | 复用快照接口增加业务组件，理解有效性限制，运行错误与断连测试 |

前几章无需硬件。第六章主机测试与真实往返分别验收；暂时没有手表也可以学习至Fake测试。能够说出调用链并独立修改例子，才是完成，不以“读过目录表”为准。

## 先检查工具，不急着装全部环境

不知道怎么下载源码、工具怎么装、终端在哪打开，直接从[准备章](/docs/crabit/setup/)开始。第一课只需编辑器和Windows C++环境；Flutter学到时再装，Arduino/STM32硬件工具更晚再进入。

## 项目地图

| 目录 | 用途 |
| --- | --- |
| libraries/NanoUI | 两端和桌面共同维护的 UI 核心 |
| libraries/NanoUI/examples/FirstApp | 最小桌面和 Arduino 示例 |
| firmware/stm32 | 设备主控、传感器、电源、USB 与本机界面 |
| firmware/rtl8720dn/NanoUI | BW16 无线和应用 |
| apps/mobile | Flutter 配套客户端 |
| libraries/NanoUI/tools | 应用字体、图片资源生成工具 |
| tools | 产品构建、Arduino 库打包与工程检查 |

## 先跑桌面 NanoUI

第一次开发请按[第一个 NanoUI App](/docs/crabit/first-app/)操作，再看[字体与图片](/docs/crabit/resources/)。

```powershell
cmake -S libraries/NanoUI/examples/FirstApp -B build/first-app -DBUILD_TESTING=ON
cmake --build build/first-app --config Release
ctest --test-dir build/first-app -C Release --output-on-failure
```

从示例里的 Widget 组合开始修改文字和布局，保留声明式写法。
页面属于 App，显示、输入、时间和资源由平台适配层提供；
桌面跑通不等于 MCU 的内存、输入或驱动已验证。

## Flutter 开发

```powershell
cd apps/mobile
flutter pub get
flutter run -d windows
```

Windows 桌面构建还需要对应 C++ 工具链。源码包含多个平台工程，
不代表每个平台均已构建、兼容或上线。网站交互采用单独的 Wasm 构建，不是浏览器加载 Windows DLL，也不替代手机和手表验收。

## 再进入硬件

一次只改一端、一个小功能，保留可恢复固件与明确版本。
不要顺手重写供电、OLED交接、串口切换、烧录桥与 Flash 布局。
相关构建和边界见[固件与恢复](/docs/crabit/update/)。

硬件制造资料与配套发布包尚待补全；在此之前先用 Windows 示例学习，不根据模拟器画面尝试接线或首次上电。
