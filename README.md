# LibreTV Android

基于 [KeyRotate/LibreTV-App](https://github.com/KeyRotate/LibreTV-App) 新建的独立 Android 项目，采用 **Tauri 2 + Rust + HTML/JavaScript**，与上游独立维护。

保留上游的视频搜索、自定义 API 源、详情与选集、HLS 播放、观看历史和配置导入导出逻辑。前端随 APK 打包，Rust 层执行 API 请求，不需要先部署 LibreTV 网站后台。视频源和推荐服务是否可用取决于其接口及当前网络；继承的旧源尚未逐个核验。

## 下载体验

打开本仓库的 **Actions → Android APK → 最近一次成功运行 → Artifacts**，下载 `libretv-android-arm64-debug`，解压并安装 APK。

- 适用 Android 7.0+、ARM64 手机，目前提供 Debug 体验包。
- Artifacts 下载需要登录 GitHub，保留 30 天。没有成功构建时不会显示 APK。
- 系统 WebView 请保持更新，安装时允许相应文件管理器安装应用。
- CI 每次运行使用临时调试签名，跨构建更新可能需要卸载旧包，卸载会清除本地数据，请先导出配置。
- 当前没有真机端到端验证，编译通过不代表所有源均可播放。

## 本地开发

需要 Node.js 20+、Rust stable、JDK 17、Android SDK 和 NDK。按 [Tauri Android 前置条件](https://v2.tauri.app/start/prerequisites/#android) 配置 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME`。

```sh
rustup target add aarch64-linux-android
npm ci
npm run check
npm run android:init
npm run android:dev
```

生成 ARM64 调试 APK：

```sh
npm run android:build
```

产物在 `src-tauri/gen/android/app/build/outputs/apk/` 下。Android 工程通过 `android:init` 生成，不提交机器路径和生成文件。正式发布前需配置长期保存的正式签名、验证设备兼容性及升级目标 SDK；此仓库没有正式发布密钥。

## 目录

- `public/`：随包提供的页面、播放器、本地 JS 库及源配置。
- `src-tauri/src/`：Rust API 请求桥接。
- `src-tauri/tauri.conf.json`：应用名、独立包名及 Tauri 配置。
- `.github/workflows/android.yml`：检查并自动构建 APK。
- `UPSTREAM.md`：来源版本、许可证和修改说明。

## 来源与许可

来源提交 `e4078d92af61903dd10eb9001cd05c35ef1ba1d5`；保留上游 `LICENSE`（Apache-2.0）和原有作者说明，第三方库继续遵循各自许可。上游 package.json 中 MIT 字段与 LICENSE 文件存在不一致，本项目以随源保留的 LICENSE 文件标注，并在 UPSTREAM.md 记录该差异。

仅使用你有权访问的媒体及 API。应用不托管视频，也不保证第三方源可用。
