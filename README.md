# Klee 的雅思词卡

给 Klee 自用的英语词卡 Web App，公开源码方便 Atlas / Grok Bot 协作修改。当前包含 **526 张词卡、3,225 个离线释义词条**，提供例句点词查询、设备发音、三轮回忆、拼写、自定义每日目标、永久已掌握、打卡和私人云同步。

基于 2026-10-22 公开快照，2026-10-26 修复所有轮次的穿插间隔：**新词首次回忆隔 6 个词，其余新学/复习及答错重练隔 5 个词**；小批次按可用其他词安排，旧进度保留。保留**红绿拼写反馈、逐字对照**。没有生产密钥、私人学习记录、原始 PDF 或旧 Git 历史。公开仓库不会改变原词卡网站的私人访问权限。

**Atlas：先读 [ATLAS_HANDOFF.md](ATLAS_HANDOFF.md) 和 [AGENTS.md](AGENTS.md)。**

## 本地运行

需要 Node.js 24 或更新版本；不需要安装 npm 依赖，也不需要 AI API Key。

```sh
node scripts/serve-local.cjs
```

打开终端显示的 `http://127.0.0.1:4173`。本地预览只在本机浏览器保存学习记录，云端提示会说明这是本地预览，不连接 Klee 的生产数据库。

```sh
node scripts/check-all.cjs
```

此命令运行词库、真实学习流程、回忆排期、Safari 语音恢复、拼写对照、SQLite 云同步和打卡状态发布检查。测试数据在隔离的内存数据库中，不接触真实用户记录。

## 主要文件

| 文件 | 用途 |
| --- | --- |
| `dist/app.js` | 界面、路由、卡片、点词、自定义键盘、语音和用户操作 |
| `dist/loop.js` | 三轮循环、首次回忆间隔、拼写队列和逐字对照 |
| `dist/plan.js` | 每日目标、复习排期、打卡规则 |
| `dist/style.css` / `dist/index.html` | 手机一屏布局、样式和页面结构 |
| `dist/data.js` | 可直接运行的完整词库 |
| `dist/cloud-state.js` / `dist/cloud.js` | 持久记录校验、三方合并和客户端同步 |
| `worker/index.js` / `drizzle/` | 私人云端接口和数据库迁移 |
| `checkin-status/` | 独立的只读打卡查询服务，只分享当天状态 |
| `content/` / `source/` | 例句、词条、原始词表核对与构建材料 |

`dist/` 顶层文件是可编辑的源码。`npm run build` 将它们嵌入 Worker，生成的 `dist/server/`、`dist/.openai/` 不提交。

## 云端和部署

原系统使用 Sites 托管的 Cloudflare Worker + D1，由 Sites 网关提供登录身份。`.openai/hosting.example.json` 只是空身份的构建模板；正式部署前，应由站点所有者在自己的托管环境配置真实项目身份、登录边界和数据库绑定。

生产运行时变量仅列名称，见 [.env.example](.env.example) 和 [checkin-status/.env.example](checkin-status/.env.example)。不要把实际查询链接、读写密钥、登录信息或数据库导出放进仓库。

**GitHub 提交不会自动更新原网站。** Atlas 可以读取、克隆、创建分支或提交 Pull Request；上线需要 Klee 授权的托管访问。不要覆盖原站点的身份、公开原学习进度，或重新创建其数据库。

## 内容和许可说明

词表来自用户提供的雅思阅读学习材料；例句、翻译与纠错保留在内容源文件中。书名标称 538，逐表核对去重后实际为 526 张，详情见 [实现说明](docs/IMPLEMENTATION_NOTES.md)。

离线词典补充来自 [ECDICT](https://github.com/skywind3000/ECDICT)，对应 MIT 许可随包提供于 [dist/dictionary-license.txt](dist/dictionary-license.txt)。原始 ECDICT 大 CSV 不随仓库分发；使用现有词库运行和修改界面不需要它。重建词库时可运行 `python scripts/build-book.py /path/to/ecdict.csv`。
