---
title: "零基础准备：源码、编辑器和运行环境"
description: "在Windows上准备第一条学习路线，分清编辑器、编译器和终端。"
---
本章不要求学过C++、Flutter或单片机。先运行一个已有程序，再一点点认识代码。不连接手表，不安装Arduino或STM32工具。

## 先分清需要什么

只使用手表需要成品App，不需要开发工具，回到[使用路线](/docs/crabit/start/)。想改功能才需要完整源码。源码是可编辑的文字，exe是编译后运行的程序，不能靠编辑exe开发。

本站尚未配置公开源码与发行包下载地址。已有源码可继续；只有网页的人先向维护者取得带版本说明的完整源码包。不要把网页另存为当成下载源码，也不要从历史实验目录拼工程。

## 1. 打开完整项目

将维护者提供的源码ZIP解压到自己有写入权限的本地文件夹。以下用 `C:\CrabitLearning\crabit` 举例，你可选别处；不能照抄成自己电脑不存在的路径。

在资源管理器进入同一层能看到以下内容的位置：

```text
crabit/
  README.md
  libraries/
  firmware/
  apps/
  showcase/
```

这层叫“仓库根目录”。ZIP可能在外面多套了一层；后面的相对路径都从这一层往下找。不熟悉Git可先用ZIP，记下源码版本；已有工作副本则保留自己的修改，不覆盖。新教程要求有 `showcase/examples/`，旧源码可能没有。

## 2. 编辑器不是编译器

从[Visual Studio Code官方入口](https://code.visualstudio.com/docs/setup/windows)安装编辑器，打开“文件 → 打开文件夹”，选择根目录。左侧应能展开libraries；Ctrl+S保存当前文件。

编辑器修改文字，C++编译器把文字变成程序。Visual Studio Code与Visual Studio是两种软件。此时不需要装一堆插件；只给你信任的源码开启工作区信任，不关闭系统安全功能。

## 3. 安装一套Windows C++工具

第一条路线使用Visual Studio的MSVC工具链，避免新手在多种编译器之间选择。已配好其他工具的读者可保留原环境，使用独立构建目录。

从[微软官方入口](https://visualstudio.microsoft.com/downloads/)取得适合自己用途的Visual Studio安装器并阅读许可。本机核对的是Visual Studio 2022 Community。工作负载选择 **“使用C++的桌面开发 / Desktop development with C++”**，检查包含MSVC、Windows SDK及C++ CMake tools。可对照[微软组件说明](https://code.visualstudio.com/docs/cpp/config-msvc)。

已有Visual Studio则在Installer中检查组件，不必重装。不要修改项目或SDK检测代码来绕过工具版本不兼容。

完成后在开始菜单搜索并打开 **Developer PowerShell for VS 2022**。这个开发者终端为编译器准备了命令路径，不需要自己修改全局环境变量。其他版本的终端名字会不同。

```powershell
cmake --version
cl
```

第一条应显示CMake版本，需3.20或更新；第二条显示Microsoft C++编译器说明，没有输入文件时打印用法不是编译失败。找不到命令就先检查终端与组件，不进入下一章。

## 4. 进入正确目录

终端是输入命令的窗口，每次运行都有当前目录。把示例路径改成自己的路径：

```powershell
Set-Location 'C:\CrabitLearning\crabit'
Get-Location
Test-Path libraries/NanoUI/examples/FirstApp/CMakeLists.txt
```

第二条应显示根目录，第三条必须是 `True`。False时检查是否多套一层目录，不要创建空文件凑路径。不要复制终端前面的提示符，只复制命令；路径有空格时保留引号。

一次执行一条，出错先停下并保留第一条错误。现在去[第一次运行与修改](/docs/crabit/first-app/)，暂不安装Python、Flutter或MCU工具。

## 5. 学到Flutter再安装它

按[Flutter官方安装步骤](https://docs.flutter.dev/install)安装SDK，可用其VS Code引导；再按[Windows开发说明](https://docs.flutter.dev/platform-integration/windows/setup)检查C++桌面环境。Flutter SDK自带Dart，不另装随意版本。这里的Flutter在电脑上运行，与手表的NanoUI是两套运行环境。

本文示例核对环境是Flutter 3.41.6、Dart 3.11.4、Visual Studio 2022，其他版本看项目要求与检查结果。

在新终端执行：

```powershell
flutter --version
flutter doctor -v
flutter devices
```

应显示Flutter版本；doctor中的Windows开发项可用；devices中有Windows桌面目标。只做Windows练习，不必为Android警告安装整套手机环境，但不能忽略Windows工具错误。找不到flutter时回官方安装步骤检查SDK路径并重开终端，不通过修改项目源码修环境。

安装与下载依赖需要联网，受阻时保留报错，不运行不明修复脚本。准备好后进入[第一个Flutter页面](/docs/crabit/flutter-first-page/)，先不连接蓝牙。

## 本章检查点

能找到根目录，能打开并保存文件，知道终端当前在哪里，CMake和C++编译器可用。四项完成就可以开始NanoUI，不必先理解整个框架。
