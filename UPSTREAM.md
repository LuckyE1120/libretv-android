# 上游来源及修改记录

- 原项目：https://github.com/KeyRotate/LibreTV-App
- 源码提交：e4078d92af61903dd10eb9001cd05c35ef1ba1d5
- 取材日期：2026-10-15
- 原项目作者和社区贡献者保留原有权利；本仓库不是上游官方发行。
- 原仓库 LICENSE 是 Apache License 2.0，已原样保留。原 package.json 声明 MIT，与 LICENSE 不一致，未据此删除或替换原许可。public/libs 下第三方库声明亦保留。

本仓库于 2026-10-15 修改：

1. 将 Android 运行所需的 public/、Rust 源码和图标整理为独立项目，不包含上游服务器、日志、旧平台生成工程及历史工作流。
2. 应用名改为 LibreTV Android，包名改为 io.github.luckye1120.libretv，避免覆盖 com.libretv.app。
3. 启用 Tauri 2 全局 API，供上游原生 HTTP 桥接调用。
4. 移除页面对旧版上游更新提示脚本的加载，更新由本仓库管理。
5. 新增 Android 初始化、调试构建命令、源码检查、GitHub Actions 和中文使用文档。

保留原搜索、播放和 API 请求实现，未声称重新编写原作者代码，未验证所有内置 API 源。

## 0.1.1 全屏修复

Android 使用 DPlayer 网页全屏保持控件层级，通过新的原生 Tauri 插件切换横屏和沉浸模式；退出时恢复屏幕方向与系统栏。系统返回键先退出全屏。移除旧版 Tauri 1 窗口 API 和依赖浏览器 fullscreen 事件的绑定，修正视频层遮挡控制条的 CSS。
