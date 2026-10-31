<div align="center">
  <a href="https://scnexus.net" target="_blank" >
    <img src="./packages/app-renderer-v2/public/application_icon.png" width="150">
  </a>
  <h1>星际枢纽</h1>
  <p>专为星际社区服务的枢纽应用</p>
  <p>
    中文 | <a href="./README.english.md">ENGLISH</a>
  </p>
</div>

<div align="center">
<img alt="GitHub package.json version" src="https://img.shields.io/github/package-json/v/MengLuoRJ/scnexus">
<img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/MengLuoRJ/scnexus">

</div>
<div align="center">
<img alt="platform Windows" src="https://img.shields.io/badge/Platform-Windows-blue" />
<a title="Crowdin" target="_blank" href="https://crowdin.com/project/scnexus"><img src="https://badges.crowdin.net/scnexus/localized.svg"></a>
</div>

## 星际枢纽

如果想要了解更多关于应用程序的相关信息，不妨前往项目的官方网站看看：

✈️ [官方网站](https://scnexus.net) | 📖 [用户手册](https://scnexus.net/guide/)

## 快速开始

### Windows

**获取应用程序安装包**

- 请从「星际枢纽」官方网站下载 Windows NSIS 安装包：[星际枢纽](https://scnexus.net/)

**从微软应用商店获取安装**

因 APPX 版本运行沙箱存在问题，目前暂不提供微软商店下载安装版本。

<!-- <a href="https://apps.microsoft.com/store/detail/9PL7DCMCN13X?launch=true&mode=full">
	<img src="https://get.microsoft.com/images/zh-CN%20dark.svg"/>
</a> -->

**GitHub Release**

本仓库不提供预构建安装包。自动化构建与代码签名尚未就绪，发布版本统一由官方网站分发。

### Linux & MacOS

预期将在未来进行支持，但目前本应用程序缺乏在上述平台的兼容开发和功能性测试。

### 从源码构建

开发与构建需要 Node.js 26、pnpm 11 及以上版本：

```bash
pnpm install
pnpm run dev      # 开发模式
pnpm run build    # 类型检查与运行包构建
```

打包为 Windows 产物的命令、Electron 隔离冒烟验证与已知限制见[构建指南](./docs/building.md)。

## 特性功能

- **富信息展示**：为内容创作者提供在地图和模组显示更加丰富信息的能力。
- **地图/模组评分与评论**(敬请期待)：敬请期待！
- **自制战役分发与管理**：帮助内容创作者分发自制战役和自制内容，并为玩家提供安装和管理能力，支持「星际枢纽」标准和[“CCM”格式](https://github.com/7thAce/SC2CCM)。
- **云同步存档**(敬请期待)：为本地官方战役、自制战役和已加入“「大厅计划」云存档服务”的大厅地图提供云同步存档功能。

## 问题解答与社群

[GEECG] 星际枢纽中文用户交流群：857601125

[GEECG] SCNexus Discord Server：https://discord.gg/U6EbQKdkH2

## 国际化与本地化翻译

欢迎参与星际枢纽应用程序的本地化翻译工作，将应用程序翻译至更多版本，请先阅读 [贡献指南](./CONTRIBUTING.md)。

| Key | 语言     | 翻译状态    |
| --- | :------- | :---------- |
| zh  | 简体中文 | ✔️ 原生支持 |
| en  | English  | ⏳ 制作中   |

## 参与共建

感谢你愿意尝试为本项目做出贡献，详请阅读 [贡献指南](./CONTRIBUTING.md)。参与开发前建议先了解本仓库的[开发约定](./AGENTS.md)与[架构说明](./docs/architecture.md)。

## 开发文档

本仓库 `docs/` 目录存放应用程序的开发文档，包括架构设计、构建方式、作品包格式与后端接入说明；面向用户的使用文档由 [scnexus-docs](https://github.com/MengLuoRJ/scnexus-docs) 仓库与[用户手册](https://scnexus.net/guide/)维护。

## 开源许可

「星际枢纽」应用程序基于 [BSD 3-Clause License](./LICENSE) 开源授权。

应用程序分发中包含的第三方组件、二进制与素材遵循各自的许可条款，详见[第三方组件声明](./THIRD-PARTY-NOTICES.md)。

StarCraft II、Blizzard Entertainment 及相关名称、标识与美术素材为 Blizzard Entertainment, Inc. 的商标或注册商标。「星际枢纽」是非官方社区项目，与 Blizzard Entertainment, Inc. 无隶属、认可或赞助关系。
