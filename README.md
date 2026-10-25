# ZZOO Studio

项目展示与开发文档网站，使用 Astro、Starlight 和 Three.js。

[访问网站](https://zzoo.asia/) · [Crabit 文档](https://zzoo.asia/docs/crabit/)

## 本地运行

使用 Node 24.22.1 和 npm。版本文件、依赖锁文件随仓库提供。

```sh
npm ci
npm run build
npm test
npm run dev
```

开发服务使用后台模式；可通过 `npm run astro -- dev status`、
`npm run astro -- dev logs` 和 `npm run astro -- dev stop` 管理。
普通构建使用已提交的文档快照和素材，不要求安装 Flutter、嵌入式 SDK，
也不要求本机存在 Crabit 源码仓库。

## 目录

```text
src/pages/                 网站首页、项目和文档目录
src/components/            项目展示组件
src/content/docs/          文档快照
src/data/                  项目目录数据
public/watch-demo/         Three.js 模型与 NanoUI WebAssembly 演示
public/media/              教程精选图片及来源清单
public/app/                Flutter 界面截图及来源清单
scripts/                   构建、导入、资源处理和检查
.github/workflows/         GitHub Pages 构建与发布
```

首页和文档目录支持多个项目；每个项目的文档通过 `source-registry.json`
声明固定源码版本与导入白名单。网站不会执行被导入仓库的代码。

## 模型与演示边界

Crabit 模型使用原有部件名称、屏幕贴图位置与三个按键绑定。
NanoUI WebAssembly 在浏览器本地运行，不连接实体手表，不提供真实屏幕流。
时钟使用浏览器时间；传感器和电池读数是模拟数据。
公网演示暂不请求天气 API，只有 localhost/127.0.0.1 开发环境启用预报请求。

原模型为 42247108 字节。构建生成 11914583 字节的无损 gzip 版本，
解压后内容与原模型一致；不减面、不量化、不修改纹理。
浏览器需支持 `DecompressionStream`。压缩仅减少传输体积，不减少运行时几何内存。
来源与哈希保存在相应的 `provenance.json` 中。

## 更新产品文档

产品教程在产品仓库中维护。需要同步时，设置相应源码目录并显式执行：

```sh
ZZOO_CRABIT_SOURCE=/path/to/crabit npm run content:sync
npm run build
npm test
```

PowerShell 使用 `$env:ZZOO_CRABIT_SOURCE = '你的仓库路径'`。
导入器只读取 registry 中指定的 Git 提交，不读取未提交内容。
新增项目时填写唯一 id、固定提交、manifest 与页面白名单。
生成输出不要直接修改，修改产品源文件后重新导入。

网站包含经处理的精选图片，不包含原始相册、设备验证码或客户端数据库。
第三方源码与素材遵循各自声明；仓库公开不构成对所有内容的统一许可授权。

## 部署

见 [部署说明](DEPLOYMENT.md)。GitHub Pages 自动发布 main 分支的静态构建；
其他托管平台可使用根路径构建。站内店铺、下载等未配置入口保留占位，不提供虚构链接。
