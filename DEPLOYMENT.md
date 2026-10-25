# 部署

## GitHub Pages

网站地址：<https://zzoo.asia/>。

仓库 Settings → Pages → Source 使用 GitHub Actions。
`.github/workflows/pages.yml` 在推送 main 或手动触发后执行：

1. 按锁文件进行干净安装。
2. 构建根路径版本并运行测试。
3. 设置 `ZZOO_SITE=https://zzoo.asia` 构建自定义域名根路径版本。
4. 检查生成页面的内部链接、图片与静态文件大小。
5. 排除原始 `watch-demo/model.glb`，上传压缩模型与其他静态文件。
6. 将构建产物部署到 Pages。

部署权限限于读取仓库、写入 Pages 和获取部署身份令牌，不需要额外保存个人 Token。
GitHub Pages 是公开的项目与文档展示，不是购物或支付服务。
托管使用须遵守 [GitHub Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

## 本地验证

```sh
npm ci
npm run build
npm test
npm run preview -- --host 127.0.0.1 --port 4322
```

验证旧项目子路径时只设置 `ZZOO_GITHUB_PAGES=1`；自定义域名通过 `ZZOO_SITE` 指定 HTTPS 源站地址并使用根路径。
普通本地构建不必设置这两个变量。Pages 自定义域名在仓库设置中绑定，域名归属 TXT 应长期保留。
部署后实际检查首页、文档目录、图片、搜索和模型按键。
构建通过不代表所有地区或运营商网络均可稳定访问。

## 其他静态托管

Node 版本为 24.22.1，构建命令为 `npm run build`，输出目录为 `dist`。
默认使用已提交文档快照，无需设置产品源码路径。
Cloudflare Workers 的配置见 `wrangler.jsonc`；本地检查命令为 `npm run deploy:check`。

`dist` 中保留原模型用于溯源，但发布时必须排除原始 42 MB 的 `watch-demo/model.glb`，
只发布构建生成的 `model.glb.gz`。Cloudflare 使用 `.assetsignore`，Pages 工作流使用显式排除；
其他平台必须配置等价规则，不能假设都识别 `.assetsignore`。
模型不需要 R2 或其他对象存储。

## 资源与数据边界

- `.wasm` 应使用 `application/wasm`，JavaScript 应使用相应脚本 MIME 类型。
- gzip 模型由客户端解压；若服务器已通过 Content-Encoding 解压，客户端会识别 GLB，避免重复解压。
- 不支持解压的旧浏览器或损坏的模型会显示加载错误，不伪装成功。
- 公网演示不调用尚未确认授权的天气服务；时间和 NanoUI 交互不依赖该服务。
- 本地开发的天气预报不是即时室外温度；使用第三方天气数据须遵守其条款。
- `noindex` 不是访问控制，发布包中不得包含凭据、私人配置或用户数据库。

## 回退

发布出现问题时，重新部署一个已验证的源码提交或构建包。
整批替换网站文件，避免新脚本与旧 Wasm 混装。网站回退不涉及手表固件。
