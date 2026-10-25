---
title: "从一个开关看懂 NanoUI"
description: "用完整可运行的双开关界面学习布局、状态、输入、绘制和生命周期。"
---
## 你将完成什么

先完成[第一个 App](/docs/crabit/first-app/)，能看到窗口、用 Enter 切换开关。本章不连接手表、不安装 Arduino，也不修改框架。目标是做出两个独立开关，并解释一次按键如何变成像素。

本章开始解释C++类、引用和对象寿命；第一次学习可以先对照上一章做过的效果读，不要求立即掌握所有符号。`bool&`表示让控件访问App保存的同一个开关变量，而不是复制一份。

## 1. 先认识三层，而不是先读全部源码

| 层 | 本例位置 | 负责什么 |
| --- | --- | --- |
| 应用 | `libraries/NanoUI/examples/FirstApp/src/apps/hello_app.h` | 数据、控件组合、业务动作 |
| 框架 | `libraries/NanoUI/src/NanoUI/product/` | 事件、布局、绘制对象、焦点和页面 |
| 平台 | `libraries/NanoUI/examples/FirstApp/windows/windows_main.cpp` | Windows 窗口、键盘、计时和画布输出 |

这也是可移植性的来源：应用用 NanoUI 的 `Canvas`、`InputDriver` 等接口，不应该为布局引入 Arduino、STM32 HAL 或 Windows API。真实传感器由产品服务提供，不在通用控件里读取 I2C。

## 2. 完整替换一个 App

先保存原文件或提交自己的 Git 检查点。将 `hello_app.h` 替换为下面内容；仓库也提供同一份 `showcase/examples/hello_app.h`。不要改 `windows_main.cpp`。

```cpp
#pragma once
#include <NanoUI.h>

class HelloApp : public Application {
public:
    const char* getAppName() override { return "First Panel"; }
    Widget* buildUI() override {
        return new Column({
            new Text("First Panel", 12),
            new Row({new Text("Enabled", 12), new Switch(enabled)}),
            new Row({new Text("Sound", 12), new Switch(sound)})
        });
    }
    bool isEnabled() const { return enabled; }
private:
    bool enabled = false;
    bool sound = false;
};
```

`Column` 纵向组装三个孩子，两个 `Row` 各自横向组装文字与开关。文字字号是 12；使用已有英文字符，暂不需要生成新中文字库。`new` 仍是框架原有的动态对象创建方式，不需要把控件改成全局静态对象。

从仓库根目录重新编译：

```powershell
cmake -S libraries/NanoUI/examples/FirstApp -B build/first-app -DBUILD_TESTING=ON
cmake --build build/first-app --config Release
ctest --test-dir build/first-app -C Release --output-on-failure
$exe = Get-ChildItem build/first-app -Recurse -Filter NanoUIFirstApp.exe |
  Select-Object -First 1 -ExpandProperty FullName
& $exe
```

检查：初始两个开关都关闭；在焦点开关按 Enter，只有它改变；用方向键切换焦点后操作另一个。关闭程序再开，两个开关恢复初值——它们还只是 RAM 状态，并没有保存配置。

无窗口检查可运行 `& $exe --headless build/first-app/panel.bmp`，预期打印 `switch=on`。它只确认第一个开关接收了一次确认事件，不能替代对第二个开关和视觉布局的检查。

![双开关示例的实际128×64无窗口输出](/media/crabit/tutorial-panel.png)

*示例实际构建输出，已模拟一次Enter；像素图不是手表实拍。*

## 3. 一次 Enter 到底经过哪里

以下是 `windows_main.cpp` 已有代码片段：

```cpp
case VK_RETURN: activeInput->queue(EVT_OK); break;
```

Windows 消息先转换成通用输入事件。主循环不是在键盘回调中直接画图，而是执行：

```cpp
manager.update(); manager.drawFrame(); Sleep(16);
```

`WindowManager` 从 `InputDriver` 取事件，处理焦点，并让对应绘制对象处理事件。在 `product/widgets/controls.h`，`RenderSwitch::handleEvent()` 中核心逻辑是：

```cpp
if (hasFocus && e.type == EVT_OK) {
    *value = !(*value);
    anim.set(*value ? 1.0f : 0.0f);
```

`Switch(enabled)` 把成员的地址交给绘制对象，所以 `*value` 修改的正是 `enabled`。开关本身也负责动画；本例不需要另写一份“反转 enabled”的回调，否则可能反转两次。

随后布局确定尺寸与位置，绘制对象向 Canvas 发出像素/图元操作，Windows 端把像素放大到窗口。`Sleep(16)` 是这个桌面入口的节奏，不是 NanoUI 对所有 MCU 的强制刷新配置。

## 4. Widget 和 RenderObject 为什么不是同一个对象

Widget 描述组合；`createRenderObject()` 创建负责布局、事件和绘制的对象。入口中的这段代码把页面和它的 App 联系起来：

```cpp
manager.push(app.buildUI(), &app,
    [](Application* owner) { return owner->buildUI(); });
```

`&app` 是借用，不是让 WindowManager 删除栈上的 App。需要回到之前页面时，可以向仍存活的 owner 再调用 `buildUI()`。因此不要假定 `buildUI()` 一生只调用一次，也不要在里面启动无线、开文件或读取传感器。

这里和 Flutter 的 `build()` 有相似的组合意图，但不存在可直接照搬的 Dart `State`、`setState()` 或完整 Flutter Element 树契约。读当前框架的实现，不要根据名字推断行为。

### 哪些数据必须活得更久

错误例子：

```cpp
Widget* buildUI() override {
    bool enabled = false; // 函数返回后失效
    return new Switch(enabled);
}
```

正确做法就是本章完整例子：把状态放在 App 成员中。文字如果由临时字符串生成，也不要随手传临时 `c_str()`；先查对应文字控件是持有副本还是借用。字符串字面量如 `"Sound"` 则具有足够长的生命周期。

不要重复使用同一个子 Widget 指针塞进两个父节点，也不要自行 delete 已交给页面树的孩子。父控件会释放自己的子控件；管理 App 与管理控件树是两件事。

## 5. 从最小例子走到产品页面

FirstApp 直接驱动 WindowManager；产品还会使用 `AppManager` 管理应用。它的权威实现位于 `product/framework/app_manager.h`：

- `launch()` 接收应用，调用创建流程，再按应用模式建立页面或挂载帧应用。
- 普通菜单和设置从 `buildUI()` 返回控件树，使用协同模式即可。
- `APP_MODE_FRAME` 用非阻塞的事件、更新、渲染回调；每次调用都必须返回。
- 历史独占模式为兼容保留，不要把新手界面写成阻塞的 `while (true)`。
- `exitCurrentApp()` 与端口停机时的 `shutdown()` 不是一回事，不要为了返回页面去关闭整个框架。

先理解，不在本章改管理器。接入现有产品入口见[STM32 与 BW16 的系统链路](/docs/crabit/system-walkthrough/)。

## 完成本章的自检

不看答案，试着说清：为什么 `enabled` 不能是局部变量？为什么回调不需要再次翻转它？退出程序为什么不保留状态？换成 OLED 时为什么不该改 Column？

能回答后，再把 `Sound` 改为另一个已有英文标签、交换两行顺序，重新编译观察。增加中文前先读[资源生成](/docs/crabit/resources/)。

常见错误：窗口没变化先确认运行的是刚编译的 exe；文字变方框检查扫描目录、字号和字库重生成；第二行截断先检查 128×64 的布局预算，不通过改硬件驱动解决。
