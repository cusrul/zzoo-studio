---
title: "NanoUI 字体与图片资源"
description: "了解 FirstApp 的资源配置、生成工具、依赖和字体覆盖边界。"
---
NanoUI 的字体和图片最终编译进使用它们的 App。FirstApp 已提交生成后的 C++ 资源，因此照着[第一个 Windows App](/docs/crabit/first-app/)编译时不需要运行资源生成器。

## 配置与文件归属

FirstApp 的实际配置是 `libraries/NanoUI/examples/FirstApp/nanoui-assets.json`：

```json
{
  "app_dirs": ["src/apps"],
  "output_dir": "src/generated"
}
```

`app_dirs` 指向 App 源码目录，`output_dir` 是该 App 管理的生成目录。两者以及配置里的字体路径都以 `nanoui-assets.json` 所在目录解析，不依赖你从哪个目录启动命令。配置也可以设置 `ttf_font`、字体扫描选项、字号和补充文案；新 App 从最小配置开始，只在确有缺字或扫描遗漏时再增加字段。

FirstApp 的源码入口是 `src/apps/hello_app.h`，生成文件位于 `src/generated/`：`nanoui_assets.h`、`nanoui_assets.cpp` 和 `nanoui_font_provider.cpp`。Windows CMake 目标会直接编译其中的 `.cpp`；生成文件属于这个 App，不是可在各端互相覆盖的通用字库。

## 第一次练习只完成一件事

先用上一章的英文Hello，不动默认资源；把“改文字”和“重新生成字体”分开，避免不知道哪步出错。学到新增中文时再做下面练习，先复制配置文件和src/generated目录到自己的备份位置。

1. 在根目录运行 `python --version`，应为3.10或更新；找不到Python先安装自己的开发环境，不要改C++代码。
2. 按下节安装工具依赖，再确认 `Test-Path C:/Windows/Fonts/simhei.ttf` 是否True。True表示本机有这个字体文件；False就停止此练习，不创建空文件或从不明网站找同名字体。
3. 在FirstApp的nanoui-assets.json保留app_dirs和output_dir，增加下面示例的ttf_font。路径只供自己的Windows本机练习；不要把系统字体文件打包进仓库，公开分发前另行确认字体与生成资源的权利。

```json
{
  "app_dirs": ["src/apps"],
  "output_dir": "src/generated",
  "ttf_font": "C:/Windows/Fonts/simhei.ttf",
  "extra_text": ["NanoUI 示例"]
}
```

4. 将App里Hello改为“你好”，保存，先运行下节的 `--check` 命令。应无缺字错误，再运行不带check的生成命令。
5. 关闭示例窗口，重新编译、运行。应看到中文替代Hello；再运行第一课的ctest命令，应仍然通过。没看到时依次核对保存、扫描路径、生成结果和运行的exe，不覆盖整个框架。

为什么配置里还保留“示例”？原资源测试会核对“示”字，改标题后这个字可能从App中消失，而默认扫描目录不包括测试。extra_text显式保留测试所需文字。若ctest因此失败，应保留必要测试资源，不删除测试或改成无条件通过。

恢复时拷回自己备份的配置和生成目录、还原英文，再编译。本机没有该字体的读者可以先跳过中文，只完成英文例子；配置与生成器规则在后半篇作为参考，不是第一课需要全部掌握的参数。

## 工具和命令

工具实现在 `libraries/NanoUI/tools/`：`font_builder.py` 检查并生成字体资源；`asset_builder.py` 打开图片/动画编辑器；`resource_gui.py` 提供配置选择和工具入口。命令从仓库根目录运行：

```powershell
python -m pip install -r libraries/NanoUI/tools/requirements.txt
python libraries/NanoUI/tools/font_builder.py --config libraries/NanoUI/examples/FirstApp/nanoui-assets.json --check
```

依赖文件安装 Pillow（Python 3.10+）。Tkinter 只用于图形界面；视频导入才额外需要 `opencv-python`。这些都不是普通 C++ 编译依赖。

`--check` 会扫描并在内存中打包，不写生成文件。确认字符和字号覆盖后，如确实要更新 FirstApp 的资源，再在可写的工作副本中运行：

```powershell
python libraries/NanoUI/tools/font_builder.py --config libraries/NanoUI/examples/FirstApp/nanoui-assets.json
```

这个命令会写入配置所指的 `src/generated/`，并保留上一次文件的 `.bak` 备份；它不是只读操作。检查生成差异，并在 App 构建中编译新文件。图片工具同样使用应用配置：

```powershell
python libraries/NanoUI/tools/asset_builder.py --config libraries/NanoUI/examples/FirstApp/nanoui-assets.json
```

也可以直接打开资源选择器；它同样需要 Tkinter：

```powershell
python libraries/NanoUI/tools/resource_gui.py --config libraries/NanoUI/examples/FirstApp/nanoui-assets.json
```

工具把图片/动画和字体数据放进同一组 App 资源文件，并保留其他已识别资源块；不要让两个生成器同时写同一个输出目录。资源替换遇到可捕获的程序异常会回滚，但多文件写入不是断电级原子事务。重新生成后检查 Git 差异，并重新编译实际使用这些资源的 App。

## 字体覆盖：扫描到不等于一定能画出来

默认扫描器是轻量源码扫描，不是 C++ 编译器。它会扫描配置的 App 目录和共享 NanoUI 产品核心源码，默认收集字符串字面量，并从支持的文本调用中推断字号；运行时拼接的文案、翻译表或自定义绘制函数可能漏掉。需要时用 `extra_text` 补文字、`sizes` 补字号、`text_helpers` 声明自定义文本函数，或改用 `scan_mode` 的 `visible` 范围。

库内默认字号映射如下；文件名或字号本身不保证包含你需要的全部字符：

| 字号 | 默认 BDF 输入 |
| --- | --- |
| 8 px | `5x8.bdf` |
| 10 px | `6x10.bdf` |
| 12 px | `wqy12.bdf` |
| 16 px | `wqy16.bdf` |
| 24 px | `gb24st.bdf` |

特别注意：随库的 `5x8.bdf` 没有中文字形。生成器会把扫描到的每个字符打包到扫描到的每个字号；框架的 8 px Toast 也可能让 8 px 成为所需字号。因此，FirstApp 当前提交的中文字形可以随源码编译，但它的默认 JSON 没有指定新字体；按默认配置重新生成时，缺少的 8 px 中文字符会让检查失败，而不是自动换成 Windows 系统字体。

解决办法是给 `ttf_font` 指定你自行提供、覆盖所需字符的字体，或通过 `fonts_dir` / `bdf_overrides` 提供匹配字号和字形的 BDF。下面的文件名仅是配置形状示例，不是仓库里已有的字体：

```json
{
  "app_dirs": ["src/apps"],
  "output_dir": "src/generated",
  "ttf_font": "fonts/your-chinese-font.ttf"
}
```

路径仍相对配置文件。选择前要自行核对字形覆盖与使用/再分发权利；仓库没有替你选定通用中文 TTF。单字号 `bdf_overrides` 若缺字会直接报错，不会回退到 TTF。`STYLE_ART` 使用独立 TTF 字形路径，也需要显式提供字体。

继续看[第一个 NanoUI App](/docs/crabit/first-app/)或[开发入口](/docs/crabit/develop/)。
