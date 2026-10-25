---
title: "固件更新与恢复"
description: "两颗芯片、成对版本和操作边界。"
---
Crabit 有 STM32 和 BW16 两端固件。它们不是同一个工程，
不能把一个文件烧进另一颗芯片。烧录、复位、进入下载模式均由设备操作者执行。

## 普通用户更新前

先取得开发者提供的成对固件、对应客户端、版本说明和校验值。
本地展示网站尚未配置公开固件下载，也没有一键更新功能。

确认硬件版本、电源、线材以及当前设备说明，再按该版本操作卡进行。
不要从历史实验目录里任选一个 ELF 或 BIN，也不要恢复旧 ATTACH 调试路径。
出现问题时保留原文件与现象记录，使用配套恢复版本。

## 开发者构建入口

下面是源码构建，不是自动刷写。

### STM32

```powershell
cd firmware/stm32
cmake --preset MinSizeRel
cmake --build --preset MinSizeRel
```

产物为该目录的 build/MinSizeRel/crabit_st.elf。
当前板卡是 STM32L432CBU6，使用256 KB Flash配置；
不要照旧芯片名称把链接器容量改小，也不要自行改电源与启动时序。

### BW16

Arduino IDE 入口是 firmware/rtl8720dn/NanoUI/NanoUI.ino。
共享 NanoUI 库由项目的 tools/package-nanoui-arduino.ps1 打包。
共享库更改后需核对 IDE 实际加载的版本。

在仓库根目录打包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package-nanoui-arduino.ps1
```

将 `build/NanoUI-library.zip` 添加到 Arduino IDE，打开产品 sketch，选择 Realtek AmebaD 的 Ai-Thinker BW16 板配置。
FirstApp 的串口文字示例不是这块手表的 OLED 固件，不要把它当产品 sketch。

也可在已有 Arduino CLI 和正确 SDK 的环境中串行构建，命令只编译与检查，不上传：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-rtl8720dn.ps1 -ArduinoIdeDefaults -BuildPath build/bw16-ide-check
```

实际打包镜像为指定 BuildPath 下的 `km0_km4_image2.bin`。CLI 产物不等于 IDE 下一次实际上传的文件。
检查明确选定的镜像：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/check-bw16-image.ps1 -ImagePath build/bw16-ide-check/km0_km4_image2.bin -StrictTarget
```

保护规则使用镜像起点 `0x6000`、首个保留边界 `0xFC000` 与严格长度目标 `0xF4000`；普通 FTL 起点 `0x102000` 是另一项，不能混淆。
检查失败就停止，不修改 SDK 分区或放宽限制。IDE 与 CLI 不能同时构建 BW16，共享 SDK 有可变状态。

IDE验证成功不等于镜像边界安全；烧录前必须核对实际上传的打包镜像，
保护 BW16 固定 Flash/FTL 区域。不要为腾空间随意改 SDK 或 OTA 布局。

## 目前这份指南的边界

接口照片、下载入口和逐步烧录操作卡尚待整理，
本页不能代替硬件版本对应的烧录教程。不会为了填满页面编造按键或端口。
学习开发可继续看[二次开发](/docs/crabit/develop/)。
