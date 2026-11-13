# 中国古典园林科普系统

在 VS Code 中使用 **Open with Live Server / Open with Server** 打开 `index.html` 即可，不需要额外启动脚本、Node 服务或 npm 安装。推荐通过 `localhost` 或 `127.0.0.1` 访问。

- 演示账号：`gjyg` / `gjyg`；也注册新账号或可点击“免登录，进入园林”。
- 静态页面的注册账户、主题和评分保存在当前浏览器；更换端口、浏览器或清除网站数据后不会共享。
- 热力图使用**腾讯地图 JavaScript API GL + visualization.Heat**，支持朝代联动、地图缩放及点击园林点查看详情。需要联网；加载失败时会明确显示提示并使用本地示意图，支持重试。
- 腾讯地图配置在 `tencent-map.js`。沿用原项目的腾讯官方示例 Key，实际部署时请替换成自己的 Key 并配置域名。官方文档：https://lbs.qq.com/webApi/javascriptGL/glGuide/glBasic
- 问答、对联和诗词目前使用明确标注的本地知识与规则模式；在线大模型需要另行接入有效的服务端接口。
- 原素材缺失的图片显示注明缺图的占位图。

`runtime.js` 为静态页面的本地知识、演示账户和偏好功能；`asset-manifest.js` 用于查找现有图片；`tencent-map.js` 用于异步加载腾讯地图。`vendor/` 中的图表、3D 和图标库是页面运行依赖，附有开源许可证；`vendor/china.js` 为断网时的地图数据。
