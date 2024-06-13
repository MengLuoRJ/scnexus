# 「星际枢纽」贡献指南

中文 | [English](./CODE_OF_CONDUCT.english.md)

感谢你愿意尝试为本项目做出贡献，期待你的卓越参与！

在开始贡献前敬请阅读本贡献指南，并阅读本项目的[贡献者公约](./CODE_OF_CONDUCT.english.md)。

## 贡献代码

- 对于新功能、新特性、新模块等贡献，请对 `upcoming-feat` 分支提交 Pull Request；
- 对于 Bug / 漏洞修复、性能优化、小调整更新，请直接对 `main` 分支提交 Pull Request。

### 🛠 应用程序开发技术栈

- Electron + electron-builder
- Vite + Vue.js 3 (Typescript) + Pinia + VueUse
- NaiveUI + Unocss

## 贡献文档

本项目文档仓库已分离至 [scnexus-docs](https://github.com/MengLuoRJ/scnexus-docs)：

- 对于文档的内容更新、内容调整，请前往 [scnexus-docs] 仓库对 `main` 分支提交 Pull Request。

## 翻译指南

本项目采用 [vue-i18n (Next)](https://github.com/intlify/vue-i18n) 进行用户界面翻译本地化，如果希望参与项目中相关国际化和翻译本地化开发，请先了解该插件的相关工作机制并浏览相关文档。

相关翻译文件位于项目 `/src/locales` 目录下，请选择对应的语言文件夹进行翻译并提交 Pull Request。

- 对于新增翻译和内容更新，请对 `locales` 分支提交 Pull Request。

