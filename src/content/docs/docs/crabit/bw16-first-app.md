---
title: "在 BW16 上新增一个不碰无线的 App"
description: "复用 Counter、注册 BW16 菜单、理解协同应用与 UI 模式，并完成构建和镜像检查。"
---
先完成[STM32 App 教程](/docs/crabit/stm32-first-app/)的桌面预览部分，了解 Application、控件和返回。没有手表也可以读和构建；本章不会让 BW16 自行上电接管屏幕。

## 1. 先分清在哪颗芯片运行

STM32 的 `app_real` 和 BW16 的 `app` 是不同产品目录。共享的是 NanoUI 核心和可移植的业务 App，不是 HAL、Arduino SDK 或 I2C 驱动。

| 对象 | 路径 |
| --- | --- |
| BW16 Arduino 入口 | `firmware/rtl8720dn/NanoUI/NanoUI.ino` |
| 模式及平台运行 | `firmware/rtl8720dn/NanoUI/src/main_entry.cpp` |
| 当前菜单 | `firmware/rtl8720dn/NanoUI/app/launcher.h` |
| 本章新增文件 | `firmware/rtl8720dn/NanoUI/app/app_counter.h` |
| 复用示例 | `showcase/examples/device-apps/app_counter.h` |

正常产品由 STM32 通过现有 UART 选择 BW16 UI 模式，再由既有流程交接 OLED。不要为了看自己的 App 在 setup 中强制启动 SPI/OLED，也不要跳过 STM32 的蓝牙和屏幕资源协调。

## 2. 原样复用同一个 Counter

这个头文件没有 HAL、Arduino、GPIO、BLE 或传感器依赖，因此能复用；[STM32 温度示例](/docs/crabit/stm32-first-app/)则依赖 STM32 快照接口，不能原样移到 BW16。

从根目录：

```powershell
$target = 'firmware/rtl8720dn/NanoUI/app/app_counter.h'
if (Test-Path $target) { throw '目标已存在，请先核对' }
Copy-Item showcase/examples/device-apps/app_counter.h $target
```

在 `app/launcher.h` 头部、现有 include 区域加：

```cpp
#include "app_counter.h"
```

再找到 **`class LauncherApp`** 的 `buildUI()`，不要改同名文件里的其他文件夹类。在 `if (icons.empty())` 前、OTA 的 `#endif` 后添加：

```cpp
icons.push_back(new Button(
    new Container(new Text("C", 8), 28, 28),
    []() { AppManager::launch(new CounterApp()); }));
titles.push_back("Counter");
```

`icons` 与 `titles` 必须各加一项。这个入口在 BW16 顶层菜单，图标是字母 C，不需要编造一个缺字的新中文图标。先确认两个向量在你选定版本中仍使用这些名字，不把补丁盲贴到任意 launcher。

## 3. 为什么这里不写 runExclusive()

普通计数器用默认 `APP_MODE_COOPERATIVE`：`buildUI()` 交给框架，`onTick()` 如有需要每次执行一点工作后返回。框架持续处理 UART、输入、绘制和其他服务。

`APP_MODE_FRAME` 用于逐帧游戏，采用 onUpdate / onRender 等接口；不是再建线程。`APP_MODE_EXCLUSIVE` 是保留的兼容路径，现有无线工具可能使用它，但新手 App 不要复制它的无限循环。模式定义见 `libraries/NanoUI/src/NanoUI/product/framework/app.h`。

Counter 既不初始化无线，也不改变原有 Wi-Fi / BLE App。不要把别的无线例程的 begin/stop 粘进这个 App 来“顺便测试”。

## 4. 构建前置条件

需要已有 Arduino CLI、Realtek AmebaD **3.1.9** 和 Ai-Thinker BW16 板配置。先按[复现说明](https://github.com/cusrul/Crabit/blob/main/docs/reproduction.md)安装并核对环境，不升级 SDK 来解决普通编译错误。

完整工程还需要私有本地配置头；不应向别人索要维护者的码。首次自行编译时：

```powershell
$auth = 'firmware/rtl8720dn/NanoUI/ble_auth.local.h'
if (-not (Test-Path $auth)) {
  Copy-Item firmware/rtl8720dn/NanoUI/ble_auth.local.example.h $auth
}
```

用编辑器打开自己的 `$auth` 文件，把 `REPLACE` 换成自选的六位数字，保存但不要提交。普通六位验证码不是链路加密；公开下载包的初始码说明不能拿来猜其他设备的码。

不要只复制 ino 单文件，也不要拿 STM32 的字库或构建目录替换 BW16 的资源。这里没有新增中文，不需要运行字体生成器。

## 5. 编译与检查镜像

关闭其他 BW16 编译任务。根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-rtl8720dn.ps1 -ArduinoIdeDefaults -BuildPath build/bw16-counter
```

这个命令使用 sketch 的实际 IDE 默认组合，并显式传入共享库。不要另选 all-lab 后把它当成同一固件。它只编译，不上传。

输出镜像是 `build/bw16-counter/km0_km4_image2.bin`，结尾必须通过严格范围检查。若失败就停止，不改 FTL、分区或上限；根据自己新增的代码缩小示例，或者回到未加示例的检查点。不要只看 Arduino 输出中“47%”就推断可用空间充足，那不等于连续应用区余量。

Arduino IDE 用户先按[更新说明](/docs/crabit/update/)核对共享 NanoUI ZIP。CLI 检查通过不能证明 IDE 实际上传了相同镜像。应用镜像起点 0x6000，保留原 bootloader；本章不指导空白芯片首次烧录。

## 6. 在手表上确认

只更新自己的 BW16 固件，STM32 不需要为 Counter 更改。按设备原有入口进入 BW16 应用：顶层出现 C / Counter；确认进入，+1 / Reset 与返回正常。再确认退出 BW16 能回到 STM32。

若没看到入口，先核对是否添加在 LauncherApp、是否使用 IDE 默认组合，以及实际烧入镜像，而不是调整 GPIO 或强制屏幕接管。编译和空间通过不等于实体设备已验收。

## 7. 再读取 STM32 传来的数据

BW16 App 的传感器入口是 `AmebaStore`，不是复制 STM32 的 QMI 驱动。沿以下路径阅读：

1. STM32 `app_real/app_cyber_link.h` 在 UI 模式发布 `sns/all`。
2. BW16 `AmebaServices.h` 解析并排队，主循环或输入服务更新缓存。
3. `AmebaStore.h` 提供 `imu_ax/ay/az`、更新时间、接收标志等字段；Hopper 消费这些数据。

若要做姿态显示，应检查已接收及更新时间，断流时展示 N/A。加速度/重力方向不是完整姿态融合，更不能当绝对航向。需要接入 Flutter 的业务先读[贯通练习](/docs/crabit/integration-lab/)，不要在 BLE SDK 回调中直接画屏幕或读 I2C。

## 8. 回退与完成标准

撤回你加入的 include、icons/titles 两项及自己的 App 文件，重新构建；保留原有私有配置，不用全仓重置。硬件异常时使用此前保存的 BW16 镜像回退，不同时替换两端。

你应能解释：为什么这个头文件能共享、菜单如何启动它、为何不用独占模式、数据从哪来、如何判定构建与镜像检查是否通过。桌面、STM32 和 BW16 的验证结论分别记录，不互相代替。

## 本章示例的验证范围

2026-11-05：在独立工作副本按上述步骤增加 Counter，使用 AmebaD 3.1.9 和 IDE 默认组合完成编译；packed image 为 0xF2000 字节，结束于 0xF8000，严格范围检查通过。独立构建只用了公开测试码，未读取维护者私有码，也没有执行上传或实机测试。

这是此版本、此示例的结果，不保证后续任意增加 App 仍放得下。正式产品菜单和已验收固件没有因此改变。
