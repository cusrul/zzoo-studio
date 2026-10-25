---
title: "第一次运行与修改 NanoUI"
description: "从已有窗口开始，只改文字、增加一行，再用按键改变一个状态。"
---
没配过环境，先完成[零基础准备](/docs/crabit/setup/)。本章在Windows操作，不需要手表，也不要求先学会类和指针。

## 你将看到什么

一个放大后的128×64黑白窗口，有标题和开关。接着改标题、增加一行说明、按Enter改变开关。先看到效果，再解释代码。

每条命令都在**源码根目录的Developer PowerShell**执行。重开终端后先重新进入自己的目录，用下面一行确认：

```powershell
Test-Path libraries/NanoUI/examples/FirstApp/CMakeLists.txt
```

必须是True。`build/first-app`是生成结果的目录，不是要编辑的源码。

## 1. 把现成源码变成程序

一次执行一条：

```powershell
cmake -S libraries/NanoUI/examples/FirstApp -B build/first-app -DBUILD_TESTING=ON
```

CMake读“如何编译”的说明。`-S`指定源码，`-B`指定生成目录；此时还没打开界面。应看到配置、生成完成，有错误先停止。

```powershell
cmake --build build/first-app --config Release
```

这才让编译器把C++变成程序。Release是构建配置，不表示发布产品。成功后有NanoUIFirstApp.exe，不同工具可能放在子目录。

```powershell
ctest --test-dir build/first-app -C Release --output-on-failure
```

这检查现成字体图片资源，应显示测试通过。第一章不需要重新生成字体。“No tests were found”不是通过，检查配置命令中的BUILD_TESTING。

## 2. 打开刚编译的窗口

```powershell
$exe = Get-ChildItem build/first-app -Recurse -Filter NanoUIFirstApp.exe |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $exe) { throw '没找到程序，请先检查编译错误' }
& $exe
```

这段可整体复制：先找到exe完整路径，再运行它。以后用同一构建目录，别点历史目录的旧exe。

应看到“NanoUI 示例”和Enabled开关。单击窗口后按Enter切换，方向键移动焦点，叉掉窗口退出。Esc发出界面返回事件，不等于关闭Windows窗口。没有窗口先检查报错和是否被遮挡，不去重烧手表。

## 3. 只改标题

先关闭窗口，避免编译器无法覆盖运行中的exe。在VS Code左侧展开：

```text
libraries → NanoUI → examples → FirstApp → src → apps → hello_app.h
```

将这个文件复制一份到自己的备份目录，再编辑原文件。找到：

```cpp
const char title[32] = "NanoUI 示例";
```

只改引号里面，保留其他符号：

```cpp
const char title[32] = "My First App";
```

这一行存放标题，现在不用理解每个符号。用英文先避开新增中文字库。Ctrl+S保存，再编译、运行：

```powershell
cmake --build build/first-app --config Release
& $exe
```

预期：画布标题变为My First App，Windows顶部标题栏仍是NanoUI FirstApp，两者不是同一个标题。没变化先检查保存、编译结果、exe位置；源码改动不会自动更新已打开的旧程序。

## 4. 增加一行，观察纵向布局

关闭窗口，找到buildUI中的：

```cpp
return new Column({
    new Text(title, 12),
    new Row({new Text("Enabled", 12), new Switch(enabled, onEnabledChanged)})
});
```

只在标题和开关之间加一行：

```cpp
return new Column({
    new Text(title, 12),
    new Text("Hello", 12),
    new Row({new Text("Enabled", 12), new Switch(enabled, onEnabledChanged)})
});
```

保存、编译、运行。预期：多出Hello，开关下移，仍能用Enter操作。完整结果也保存在 `showcase/examples/first-steps/hello_app.h`，遇到语法错误可用它对照。

![本章三行界面的实际无窗口输出](/media/crabit/first-app-hello.png)

*实际C++像素放大显示；无窗口检查已模拟一次Enter，不是手表照片。*

现在认识三个名字：Text画文字，Column把内容从上往下排，Row把内容从左往右排。开关和Enabled在同一个Row，所以并排。增加一个孩子就改变布局，不必写每个像素坐标。

别漏掉Hello那行最后的逗号。语法错误时先对照这几行的引号、逗号和括号，不整段重抄框架。

## 5. 第一次理解状态

按Enter开关改变，关闭程序再开又恢复初值。这个开/关值叫状态，暂存在内存，既没保存到磁盘，也没发送给手表。本例用enabled记录它；下一章解释为什么它放在App里面。

你刚才分别改了文字、布局，又用输入改变状态，这三件事并不相同。

## 6. 出错与恢复

| 现象 | 处理 |
| --- | --- |
| 找不到路径 | Get-Location确认根目录，不在apps/mobile运行本例命令 |
| 找不到cmake或编译器 | 回准备章检查组件与开发者终端 |
| exe无法写入 | 关闭示例窗口再编译 |
| 语法错误 | 先看第一条错误，对照刚改几行，必要时复制自己的备份回来 |
| 字体是方框 | 本章只用已有英文，新增中文等资源章节 |
| 编译器与缓存不匹配 | 用新构建目录如build/first-app-v2重做配置，不删不认识的目录 |

恢复只还原自己的hello_app.h，不运行丢弃整个仓库修改的命令。

## 本章完成了吗

能开窗口、改标题、加Hello、重编译、操作开关、恢复文件即可。还不要求解释整个渲染系统；继续[双开关与源码解释](/docs/crabit/ui-development/)，不要先背所有术语。

可用 `& $exe --headless build/first-app/FirstApp.bmp`保存原始像素，应打印switch=on。主机测试不代表手表硬件通过。
