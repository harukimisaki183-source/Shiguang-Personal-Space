# 拾光 · 个人空间

一个「本地优先」的个人空间：记录说说、和 AI 对话、做每天的卡片，听自己的音乐。现在同时提供 Web 版和 Windows 桌面版。

> 当前版本 **0.3.0**。安装包见 [GitHub Releases](https://github.com/harukimisaki183-source/Shiguang-Personal-Space/releases/latest)。桌面安装包未做代码签名，Windows 可能提示「未知发布者」，可点「更多信息 → 仍要运行」。

## 已实现

- **说说 / 博客**
  - 文字发布、分类（日常 / 面试 / 学习 / 心情 / 其他）
  - 图片自动压缩、视频导入、最多 9 个媒体
  - 日历标记有记录的日期，点击按日期筛选
  - 关键词搜索、分类筛选
  - 编辑（增删媒体）、删除、媒体大图/视频预览
- **对话**
  - 小型 LLM 对话窗口，支持流式输出、停止生成、历史记录
  - 内置技能：面试教练、项目深挖、八股追问、模拟面试、复盘点评、通用助手
  - 自定义技能：图标、名称、说明和系统提示词，可编辑、删除
  - 演示模式开箱即用；也支持 OpenAI 兼容接口
  - 支持 DeepSeek / 通义千问 / 智谱 GLM / Kimi，以及自定义 API 快速填入
- **每日卡片**
  - 两种类型：计划 / 总结；五个标签：日常、工作、技能、兴趣、求职
  - 求职卡片自动汇总 BOSS直聘、网申和其他渠道的投递数量
  - 实时预览、卡片库、编辑删除、1080 × 1440 PNG 导出或复制文字
- **音乐播放器**
  - 导入本地音乐，保存到 IndexedDB
  - 全局播放器：播放/暂停、上一首/下一首、进度、音量、循环
  - 切换页面不中断；支持系统媒体键（Media Session）
- **桌面版**
  - Windows NSIS 安装包，创建桌面与开始菜单快捷方式
  - 程序文件与应用数据分开存放，覆盖安装/自动更新不改动内容
  - 跨版本启动前自动快照 IndexedDB 与 localStorage，保留最近 3 份
  - API Key 使用 Electron `safeStorage`（Windows DPAPI）加密，不写入 localStorage 或备份
  - 大模型请求由桌面主进程代理，不受浏览器 CORS 限制
  - 设置中可查看数据目录、快照，检查并安装 GitHub Releases 上的更新
  - 数据库打开失败时显示恢复提示，而不是空白页
- **其他**
  - 首次启动更新公告，版本变化时再次提示
  - 浅色 / 深色主题
  - 个人昵称、简介，emoji 头像或上传本地图片（自动裁剪压缩）
  - 一键导出 / 导入全部数据
  - 浏览器 / 本机存储用量展示

## 运行 Web 版

```powershell
npm install
npm run dev
```

打开 Vite 输出的地址，通常是 `http://localhost:5173`。

> 注意：浏览器把 `localhost` 和 `127.0.0.1` 视为不同来源，两者的 IndexedDB/localStorage 不互通。迁移网页版数据前，请用之前记录内容时的那个地址打开网页版，再导出备份。

```powershell
npm run typecheck   # TypeScript 检查
npm run build       # 生产构建
npm run preview     # 预览生产构建
```

## 运行和打包桌面版

```powershell
npm install
npm run dev:desktop     # Vite + Electron 开发模式
npm run pack:desktop    # 只生成 release/win-unpacked/Shiguang.exe
npm run build:desktop   # 生成 Windows 安装包
```

安装包输出在 `release/Shiguang-Setup-<版本>.exe`，同时生成 `latest.yml` 和 `.blockmap` 供自动更新使用。

首次安装 Electron / electron-builder 需要下载较大的二进制文件。国内网络可以设置镜像：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
npm install
```

当前构建脚本使用 `--publish never`，不会自动上传 GitHub。

## 数据存在哪里

### 桌面版

| 数据 | 位置 |
| --- | --- |
| 应用数据根目录 | `%APPDATA%\Shiguang` |
| 说说、媒体、对话、消息、卡片、自定义技能、音乐 | `%APPDATA%\Shiguang\IndexedDB`（大的媒体 Blob 还可能外置在 `blob_storage`） |
| 设置、主题、头像、自定义快速填入 | `%APPDATA%\Shiguang\Local Storage` |
| API Key | `%APPDATA%\Shiguang\secure\api-key.bin`（Windows DPAPI 加密） |
| 升级前数据快照 | `%APPDATA%\Shiguang\backups\pre-update` |
| 版本与最近成功启动记录 | `%APPDATA%\Shiguang\data-state.json` |
| 主进程日志 | `%APPDATA%\Shiguang\logs\main.log` |

设置页的「桌面版与更新」可以直接打开数据目录和快照目录。快照是明文本地副本，不会上传，清理磁盘时请按需删除。

安装版使用 `Shiguang`；`npm run dev:desktop` 使用独立的 `Shiguang Dev`，避免开发内容混进正式数据。开发或测试时还可以用 `SHIGUANG_USER_DATA` 指向一个临时目录。

### Web 版

| 数据 | 位置 |
| --- | --- |
| 说说、媒体、对话、消息、卡片、自定义技能、音乐 | 浏览器 IndexedDB：`interview-hub-db` |
| 设置、主题、头像、API Key、自定义快速填入 | localStorage：`interview-hub:settings:v1` |
| 已读版本号 | localStorage：`interview-hub:last-seen-version` |

**注意**：清理浏览器数据、换浏览器、清理应用数据目录或重装系统都会丢失内容。请在「设置 → 数据管理」定期导出备份。

## 更新时数据怎么保留

### 桌面版覆盖安装 / 自动更新

程序装在安装目录，数据在 `%APPDATA%\Shiguang`，两者互不覆盖。安装新版本只会替换程序文件，`data-state.json`、IndexedDB、设置、Key 和快照都会保留。

如果新版本需要修改数据库结构：

1. 主进程在创建窗口前发现 `data-state.json` 里的版本与当前版本不同；
2. 先把 `IndexedDB`、`Local Storage`、`Session Storage`、`blob_storage`、`File System` 复制到 `backups/pre-update/`；
3. 渲染层启动时由 Dexie 在事务里执行数据库升级；
4. 界面成功打开后，才把 `data-state.json` 更新为新版本；
5. 旧快照保留最近 3 份。

如果升级后界面打不开，启动页会提示打开数据目录和快照目录。恢复前请完全退出拾光，把当前存储目录改名备份，再把快照中的目录复制回来。

维护时不要修改以下内容，否则会被视为新的应用，旧数据看起来会“消失”：

- `electron-builder.yml` 的 `appId`
- 自定义协议 `app://shiguang`
- `APP_USER_DATA` 的默认目录名 `Shiguang`
- Dexie 数据库名 `interview-hub-db`

### Web 版

Web 版更新的是服务器上的静态文件。只要仍然使用同一个协议、域名和端口，浏览器会继续使用原来的 IndexedDB 和 localStorage，不需要迁移。换域名、换端口或本地文件路径都会被视为新的来源。

### 从 Web 版迁移到桌面版

浏览器和 Electron 的存储互相隔离，浏览器也不会允许外部程序直接读取自己的 IndexedDB，因此不能自动搬运。迁移步骤：

1. 在 Web 版打开「设置 → 数据管理 → 导出备份」；
2. 安装并打开桌面版；
3. 在桌面版「设置 → 数据管理 → 导入备份」选择刚才的 JSON。

备份包含说说、媒体、对话、卡片、自定义技能、头像、自定义 API 配置等；**不包含 API Key**，需要在桌面版重新填写。第一次打开桌面版时，更新公告底部也提供「迁移网页版数据」快捷入口。

### 发布自动更新

`electron-builder.yml` 已配置公开仓库 `harukimisaki183-source/Shiguang-Personal-Space` 的 GitHub Releases。发布新版本时：

1. 修改 `package.json`、`src/changelog.ts` 的版本号；
2. 执行 `npm run build:desktop`；
3. 在 GitHub 创建正式 Release，Tag 使用 `v<版本>`；
4. 上传 `Shiguang-Setup-<版本>.exe`、`latest.yml`、`Shiguang-Setup-<版本>.exe.blockmap`；
5. 已安装的旧版本在「设置 → 桌面版与更新 → 检查更新」中即可发现、下载并重启安装。

未签名的安装包可以更新，但 Windows 可能弹出安全提示。正式分发建议购买代码签名证书。

## 大模型配置

默认开启「演示模式」，不会调用真实模型。关闭演示模式后：

1. 填 API Base URL（例如 `https://api.deepseek.com/v1`）
2. 填模型名（例如 `deepseek-chat`）
3. 填 API Key
4. 点「测试连接」

接口需要兼容 OpenAI Chat Completions 格式。除了内置的 DeepSeek / 通义千问 / 智谱 / Kimi，也可以点击快速填入旁的「自定义」，保存自己的 Base URL、模型名和显示名称。

- Web 版直接请求接口，可能遇到 CORS 限制；
- 桌面版由主进程转发请求，不受 CORS 限制；
- 桌面版 API Key 使用 Windows DPAPI 加密；
- Web 版 API Key 明文保存在 localStorage，仅适合本机原型使用；
- 备份文件不包含 API Key。

## 自定义技能

1. 在「对话」页点击技能按钮，或欢迎页的「添加自定义技能」
2. 填写图标、名称、一句话说明和系统提示词
3. 保存后即可切换到这个技能开始对话

技能提示词会和对话历史一起发送给配置好的模型接口。系统提示词只保存在本机，并会包含在导出的备份里。

## 卡片说明

- 卡片保存在 IndexedDB 的 `cards` 表，不会上传。
- 求职卡片的「投递合计」= BOSS直聘 + 网申 + 其他途径，只统计填写了数字的项。
- 导出使用浏览器 Canvas，不依赖第三方截图服务；生成的图片只下载到本机。
- 长文本在卡片上会被截断，建议每段控制在卡片编辑器的字数提示以内。

## 当前限制

- 桌面安装包没有代码签名，Windows SmartScreen 会提示未知发布者。
- 桌面版还没有托盘常驻；关闭窗口后应用和音乐都会退出。
- 视频格式受 Chromium 支持限制（MP4/H.264、WebM 较稳；MKV、HEVC 可能无法播放）。
- 大视频、大量音乐会占用较多磁盘空间，IndexedDB 也不适合做大型媒体库；后续可迁移到本地文件夹 + SQLite。
- 升级前快照会复制一份完整的 IndexedDB / blob_storage，媒体很多时会额外占用相当于当前数据的磁盘空间；快照只保留最近 3 份，可在设置中打开快照目录手动清理。
- 没有后端，不能多端同步；换设备请用导出/导入备份。
- 备份文件使用 Base64 保存媒体，数据多时 JSON 会很大。
- 自动更新依赖 GitHub Releases。v0.3.0 已作为正式 Release 发布；之后的新版本仍需按上面的步骤上传安装包和 `latest.yml`。

## 下一步

- 代码签名与正式 Release 发布流程
- 托盘、关闭到托盘、后台播放、开机启动
- SQLite + 本地媒体文件夹，降低 IndexedDB 体积压力
- 自动导出备份与快照恢复向导
- 可选的多端同步后端（当前完全本地）

## 技术栈

- React 19 + TypeScript + Vite
- Electron + electron-builder + electron-updater
- Dexie（IndexedDB）本地数据
- react-markdown + remark-gfm 渲染模型回答
- Canvas 生成卡片 PNG
- date-fns、lucide-react
- 无 UI 框架，样式集中在 `src/styles.css`

## 目录结构

```text
electron/
  main.cjs                 主进程：窗口、协议、数据快照、更新
  preload.cjs              受限的桌面能力桥接
  llm-proxy.cjs            主进程流式 LLM 请求代理
  secrets.cjs              safeStorage 加密 API Key
  data-safety.cjs          数据版本标记与升级前快照
src/
  App.tsx                  应用外壳与路由
  main.tsx                 启动、数据库升级、API Key 注入
  styles.css               全部样式
  types.ts                 数据类型
  db.ts                    Dexie 数据表与读写
  skills.ts                内置技能与技能解析
  cards.ts                 卡片模板、文字与 PNG 导出
  backup.ts                备份导出/恢复
  llm.ts                   大模型流式请求与演示模式
  desktop.ts               桌面桥接类型与能力检测
  storage.ts               设置、版本号等 localStorage
  mediaFiles.ts            媒体文件校验
  hooks.ts                 路由、object URL
  contexts/                设置、Toast、确认框、音乐播放器
  components/chat/         技能库、技能编辑、卡片编辑与卡片库
  components/              布局、启动错误、更新公告、音乐、模态框、博客组件
  pages/                   说说 / 对话 / 设置
electron-builder.yml       Windows 安装包与 GitHub 更新配置
build/icon.svg | icon.png  应用图标
```
