---
title: "Flutter：做出你的第一个可交互页面"
description: "从一个能运行的独立页面开始，逐步认识 Text、Column、状态和 setState。"
---
这是一节不需要 Crabit 手表、手机或蓝牙连接的本机练习。最后你会得到一个 Windows 桌面页面：它显示一个数字，点击按钮后数字加一。练习使用 Flutter 自带的 Material 控件，不会改动 Crabit 产品界面。

先完成[准备章的Flutter部分](/docs/crabit/setup/)，确认终端能执行flutter命令、能找到Windows目标。本章的文件位于你的源码包中，不使用维护者电脑上的私有目录。

## 先准备隔离的练习目录

在PowerShell进入自己的源码根目录，即能看到README.md、apps、showcase的那一层。练习放进现有Flutter包的build/tutorial-flutter，不覆盖产品lib/main.dart。以下整块复制执行：

```powershell
$repo = (Get-Location).Path
if (-not (Test-Path apps/mobile/pubspec.yaml)) { throw '请先进入源码根目录' }
$package = Join-Path $repo 'apps/mobile'
New-Item -ItemType Directory -Force "$package/build/tutorial-flutter" | Out-Null
Copy-Item "$repo/showcase/examples/flutter-first-page/main.dart" "$package/build/tutorial-flutter/main.dart"
Copy-Item "$repo/showcase/examples/flutter-first-page/main_test.dart" "$package/build/tutorial-flutter/main_test.dart"
```

`$repo`记住你当前根目录，`$package`是其中的Flutter客户端目录；不是要你自己创建名为package的文件夹。Copy-Item复制练习副本。后续只编辑该副本，不覆盖lib/main.dart。关闭终端后这些变量会消失，重新练习从这一步开始。

## 先运行完整页面

运行时先进入 Flutter 包目录，这样 Flutter 会读取该包已有的依赖配置。`-d windows` 选择 Windows 桌面作为运行设备，`-t` 指定这次要运行的 Dart 入口文件。

```powershell
Set-Location $package
flutter pub get
flutter run -d windows -t build/tutorial-flutter/main.dart
```

窗口内顶部标题是 `My first page`，不是要求Windows外框标题相同。页面显示 `Current value`、`Value: 0` 和 `Add one` 按钮。点击后变成 `Value: 1`，再点变成 `Value: 2`。关闭窗口结束运行。桌面工具链缺失时Flutter会报错，与手表连接无关。

![独立Flutter页面：按一次Add one后显示Value 1](/media/crabit/flutter-first-page.png)

*完整示例的实际Widget测试渲染，模拟了一次按钮点击；不连接手表。*

## 读懂页面搭架子

打开复制出来的 `build/tutorial-flutter/main.dart`。示例已经是可运行的完整版本；下面按顺序做小编辑，观察每一处改动。每次保存后都可以用前面的运行命令重启检查。

### 1. 找到入口和页面标题

`main` 是程序开始执行的位置。`runApp` 把最外层 Widget 交给 Flutter。Widget 可以先理解成描述界面的一块积木；`FirstPageApp` 是应用外壳，`MaterialApp` 提供 Material 风格应用的基础结构，首页是 `CounterPage`。

先把 `AppBar` 中的标题从 `My first page` 改成 `My counter`，运行后确认窗口内的标题文字变化，再改回 `My first page`。标题由 `Text` Widget 显示。

### 2. 用 Text 显示文字

找到 `Text('Current value')`。`Text` 是显示文字的 Widget。再找到 `Text('Value: $_value')`：字符串里的 `$_value` 会被 Dart 替换成变量当前的数字。

把固定标签暂时改成 `Text('A number I can change')`，保存并运行，确认新文字出现，然后改回 `Current value`。这一步只换了显示内容，没有改变数字。

### 3. 用 Column 从上往下排

`Column` 把自己的子 Widget 沿竖直方向排列。它的 `children` 列表里依次放着固定说明、间距、数字、间距和按钮。`SizedBox` 在这里仅用来留出一点空隙；`Center` 把这组内容放到页面中央。

试着把 `const Text('Current value')` 和 `Text('Value: $_value', ...)` 在 `children` 列表中的位置交换，再运行观察上下顺序。完成观察后把它们放回原位。列表中的顺序就是屏幕上的排列顺序。

### 4. 让页面拥有会变的状态

`CounterPage` 是 `StatefulWidget`，也就是可以配合一个 State 对象保存会变化的数据的 Widget。它创建 `_CounterPageState`。下划线开头的名称表示这个名称只在当前 Dart 文件中使用。

`int _value = 0;` 是这页的状态：`int` 表示整数，初始值是零。按钮的 `onPressed` 指向 `_increase`。按下按钮时，`_increase` 中的代码把 `_value` 加一。

如果只改变量，Flutter 不一定知道要重新画出新数字。因此改变量的语句放在 `setState` 中。`setState` 告诉 Flutter：“这页管理的数据变了，请重新构建这部分界面。”重建时，`Text('Value: $_value')` 再次读取新值。这个状态只在页面运行期间存在；关闭窗口后不会自动保存。

做一个小实验：在 `_value += 1;` 后面再添加一行 `_value += 1;`，保存、运行并点击按钮。数字每次会增加二，因为一次点击执行了两条加一语句。观察后删掉第二行，恢复每次加一。

## 检查练习结果

测试用 Flutter 的 Widget 测试工具在本机创建页面、模拟点击并检查文字，不需要启动桌面窗口，也不连接设备。关闭运行窗口后，在 Flutter 包目录执行：

```powershell
Set-Location $package
flutter test build/tutorial-flutter/main_test.dart
```

预期看到一个测试通过，名称为 `the page shows and increases its value`。它检查初始文字 `My first page`、`Current value`、`Value: 0`、`Add one`，然后模拟一次点击并确认 `Value: 1` 出现而 `Value: 0` 消失。若你改了页面文字，先把它恢复为这些原始标签再运行测试。

## 接下来

每次练习后先恢复原标签和每次加一，再运行测试。弄乱了就先保存自己的尝试文件，再从showcase/examples/flutter-first-page复制原示例回来；只覆盖练习副本，不清空产品目录。

你已认识页面排列与本地状态。再读[Flutter源码导读](/docs/crabit/flutter-development/)，追踪实际设备控制器；NanoUI是另一套C++界面，二者的对照见[开发路线](/docs/crabit/develop/)。
