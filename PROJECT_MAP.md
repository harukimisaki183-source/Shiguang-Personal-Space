# 拾光 · 内部项目地图

> 这份文件是给 Claude / 未来的维护者看的，不是用户文档。目标：任何一次优化前，能在几分钟内重新建立完整心智模型。
> 用户向说明在 `README.md`；这里记录的是「东西在哪、怎么连、什么不能碰、改哪里」。
>
> 最后扫描：2026-11-02 · 对应版本 **0.4.1**

---

## 0. 一句话

「拾光」是一个**本地优先**的个人空间：说说（图文/视频）、AI 技能对话、计划表、每日卡片、本地音乐。
同一套 React 代码同时跑在 **Web（Vite）** 和 **Windows 桌面版（Electron + NSIS）**，没有后端，所有数据在本机。

当前页面：说说 / 对话 / **计划表** / 设置。计划表是 0.4.0 新增的第四个主页面。

- 仓库：`git@github.com:harukimisaki183-source/Shiguang-Personal-Space.git`
- 分支：`main`（本地与 origin 同步）
- 产品名/可执行文件：拾光 / `Shiguang.exe`
- appId：`com.harukimisaki.shiguang`
- 当前版本：`0.4.1`（`package.json` / `src/changelog.ts` / `README.md` 三处）

---

## 1. 绝对不要破坏的约定

发布后改动这些，会被系统视为「另一个应用」，用户旧数据看起来会全部消失：

1. `electron-builder.yml` 的 `appId`。
2. 自定义协议 `app://shiguang`（`electron/main.cjs` 的 `APP_SCHEME` / `APP_HOST`）。
   它决定了桌面版 IndexedDB/localStorage 的 origin。
3. 默认数据目录名 `Shiguang`（`APP_USER_DATA`，开发版是 `Shiguang Dev`）。
4. Dexie 数据库名 `interview-hub-db`（`src/db.ts`）。
5. 备份 JSON 的标识 `app: "interview-hub"` 与 `format` 版本（当前导出 format 3，仍接受 1/2；`src/backup.ts`）。
6. 内置技能 ID（如 `general`、`interview-mock`、`daily-card`）——旧对话通过 `skillId` 引用它们。
7. 桌面版 **API Key 不写 localStorage、不进备份**；只经 IPC 存到 `secure/api-key.bin`。
8. 桌面 CSP 与 `isTrusted` 来源校验不能放宽；渲染层不要绕过主进程直连外部 API。
9. `dist/`、`release/` 是构建产物，已在 `.gitignore`，不要提交。
10. 发布版本号必须同时改：`package.json` → `src/changelog.ts`（`APP_VERSION` + 新 `CHANGELOG` 条目）→ `README.md`。

---

## 2. 运行与构建

```powershell
npm install
npm run dev            # Web 开发（Vite，127.0.0.1:5173）
npm run dev:desktop    # Vite + Electron（独立数据目录 Shiguang Dev）
npm run typecheck      # tsc --noEmit（当前唯一的静态检查）
npm run build          # tsc + vite build -> dist/
npm run pack:desktop   # 免安装目录 release/win-unpacked/
npm run build:desktop  # NSIS 安装包 -> release/Shiguang-Setup-<ver>.exe
```

- 技术栈：React 19 + TypeScript（strict）+ Vite 8 + Dexie 4 + react-markdown/remark-gfm + lucide-react + date-fns + html-to-image（计划表 PNG 导出）。
- Electron 45，`electron-builder`，`electron-updater`（唯一生产依赖）。
- 打包只针对 Windows x64 NSIS；`--publish never`，Release 手动上传。
- 没有 ESLint、没有测试框架。`typecheck` 通过不代表运行正确。

---

## 3. 架构总览

```text
┌──────────────────────────── BrowserWindow (sandbox, contextIsolation) ───────────────────────────┐
│  React SPA (src/)                                                                               │
│  App.tsx ── hash 路由 #/blog #/chat #/settings                                                  │
│    ├─ BlogPage    → Dexie(notes/media)                                                         │
│    ├─ ChatPage    → Dexie(chats/messages/skills/cards) + llm.ts                                 │
│    ├─ PlansPage   → Dexie(plans/planItems/planImages) + planExport.ts                          │
│    ├─ SettingsPage→ localStorage(settings) + backup.ts + desktop bridge                         │
│    └─ MusicProvider (全局唯一 <audio>) → Dexie(tracks) + localStorage(顺序)                    │
│                                                                                                 │
│  window.shiguangDesktop  ← preload.cjs 暴露的受限桥                                              │
└───────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                │ IPC（每个 handler 都校验 senderFrame URL）
┌───────────────────────────────▼─────────────────────────────────────────────────────────────────┐
│  Electron main (electron/)                                                                      │
│  main.cjs        app://shiguang 静态协议、窗口、CSP、下载、单实例、自动更新、数据版本标记       │
│  data-safety.cjs 跨版本启动前复制 IndexedDB/localStorage/blob_storage 快照，保留 3 份            │
│  secrets.cjs    safeStorage(DPAPI) 加密 API Key                                                 │
│  llm-proxy.cjs  主进程 net.fetch 代理流式请求（绕过 CORS）                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                                │
                    %APPDATA%\Shiguang（Chromium 存储 + secure/ + backups/ + logs/）
```

Web 版没有 Electron 层：`llm.ts` 直接 `fetch`（可能被 CORS 拦截），API Key 明文存 localStorage。

---

## 4. 文件 → 职责速查

### 入口与全局

| 文件 | 作用 |
| --- | --- |
| `src/main.tsx` | 启动：读取主题 → `db.open()` 等 Dexie 升级 → 解密 API Key → 渲染；失败渲染 `StartupError`；桌面版通知 `renderer-ready` |
| `src/App.tsx` | Provider 嵌套（Settings→Toast→Confirm→Music）+ 页面切换 + 全局音乐条/抽屉 + 更新公告 |
| `src/types.ts` | 所有领域类型、分类/标签常量、`Settings` |
| `src/hooks.ts` | `useHashRoute`、`useObjectUrl` |
| `src/utils.ts` | uid、日期/字节/时长格式化、图片压缩、头像裁剪、媒体探测、Blob↔DataURL、下载、复制 |
| `src/styles.css` | **全部样式，7,110 行**，按注释分区块；无 CSS Modules |
| `src/changelog.ts` | `APP_VERSION` + 4 个版本的 `CHANGELOG`（更新公告数据源） |

### 数据与业务

| 文件 | 作用 |
| --- | --- |
| `src/db.ts` | Dexie 表结构/版本升级 + notes/media/chats/messages/skills/cards/tracks 的增删改查 + 统计/清空/首次种子记录 |
| `src/skills.ts` | 7 个内置技能（6 chat + 1 card）、分组、`resolveSkill`、旧 `mode → skillId` 映射 |
| `src/llm.ts` | 端点拼接、历史裁剪、SSE 解析、桌面代理调用、连接测试、演示模式虚构回答 |
| `src/cards.ts` | 5 类卡片字段定义/配色、预览数据、文字版、Canvas 1080×1440 PNG 渲染导出 |
| `src/planExport.ts` | 计划富文本白名单清理、互动 HTML 生成、离屏 DOM 转 PNG（html-to-image） |
| `src/backup.ts` | 全量导出（媒体/音乐/计划图片转 Base64）与恢复（校验后事务性清空并重灌），format 3 |
| `src/storage.ts` | localStorage 设置加载/保存/校验、最近版本号、各种 storage key |
| `src/mediaFiles.ts` | 媒体数量/大小限制的前端校验（9 个、图片 25MB、视频 120MB、总计 300MB） |
| `src/desktop.ts` | `window.shiguangDesktop` 的 TypeScript 类型、`isDesktopApp`、`getDesktopBridge` |

### UI

| 文件 | 作用 |
| --- | --- |
| `src/components/Sidebar.tsx` / `Topbar.tsx` | 主导航、主题切换、头像、更新时间入口 |
| `src/components/Modal.tsx` | 通用 Portal 弹窗（sm/md/lg/xl），Esc/遮罩关闭 |
| `src/components/UpdateModal.tsx` | 首次欢迎/版本更新公告 |
| `src/components/MusicBar.tsx` / `MusicDrawer.tsx` | 全局播放条 / 音乐库抽屉 |
| `src/components/StartupError.tsx` | 数据库打不开时的恢复引导 |
| `src/components/blog/*` | 发布器、记录卡、编辑弹窗、日历、媒体缩略图、Lightbox |
| `src/components/chat/*` | 技能库/技能编辑、卡片工作室/实时预览/卡片库 |
| `src/components/plans/*` | 计划编辑页、正文富文本、计划条、图片放大预览 |
| `src/pages/BlogPage.tsx` | 记录流 + 搜索/分类/日期筛选 + 右侧日历与统计 |
| `src/pages/ChatPage.tsx` | 对话列表 + 技能切换 + 流式消息 + 技能/卡片入口 |
| `src/pages/PlansPage.tsx` | 计划表总览（文件夹网格、封面、进度）+ 新建计划弹窗 |
| `src/pages/SettingsPage.tsx` | 资料/头像、大模型配置、主题、备份恢复、桌面信息与更新、关于 |
| `src/contexts/*` | Settings（含桌面 Key 同步）、Toast、Confirm、Music（全局播放器） |

### Electron

| 文件 | 作用 |
| --- | --- |
| `electron/main.cjs` | 单实例、`app://` 协议、CSP、窗口、下载对话框、权限白名单、IPC、自动更新、应用内卸载、数据版本标记 |
| `electron/preload.cjs` | `contextBridge` 暴露 `runtime/app/secrets/llm/updates` |
| `electron/data-safety.cjs` | `data-state.json`、升级前快照、快照列表/清理（最多 3 份） |
| `electron/secrets.cjs` | Key 文件格式：首字节 1=DPAPI 加密 / 0=降级明文；原子写 |
| `electron/llm-proxy.cjs` | 校验参数、`net.fetch` 流式代理、SSE 解析、取消、连接测试 |

---

## 5. 数据模型

### Dexie `interview-hub-db`（version 3，`src/db.ts`）

| 表 | 主键 / 索引 | 关键字段 |
| --- | --- | --- |
| `notes` | `id, createdAt, updatedAt, category` | content, category（日常/面试/学习/心情/其他） |
| `media` | `id, noteId, createdAt` | kind(image/video), name, mime, size, width/height/duration, **blob**, createdAt |
| `chats` | `id, updatedAt, skillId` | title, skillId（0.1 的 `mode` 已在 v2 迁移为 skillId） |
| `messages` | `id, chatId, createdAt` | role(user/assistant), content, error? |
| `tracks` | `id, createdAt` | title, artist, fileName, mime, size, duration, **blob** |
| `skills` | `id, createdAt, updatedAt` | 自定义技能：icon/name/description/systemPrompt，`custom: true` |
| `cards` | `id, date, tag, createdAt` | type(plan/summary), title, fields: Record<string,string> |
| `plans` | `id, updatedAt` | title, **cover Blob?**, coverName?, blocks: PlanBlock[] |
| `planItems` | `id, planId, createdAt` | text, checked, details, updatedAt |
| `planImages` | `id, planId, itemId, createdAt` | name, mime, size, caption, **blob**, createdAt |

- 版本升级方式：新增 `this.version(n).stores(...)`，**保留旧声明**；桌面主进程会在跨版本启动前自动快照。
- 媒体/音乐/计划图片直接存 Blob，无独立文件目录。
- 计划正文是 `PlanBlock[]`（`h1/h2/h3/p` + 受限 HTML），直接嵌在 `plans` 记录里。

### localStorage（`src/storage.ts`）

| Key | 内容 |
| --- | --- |
| `interview-hub:settings:v1` | 昵称/头像/bio/主题/演示模式/BaseURL/Key/模型/温度/自定义快速填入；桌面版保存时剔除 `apiKey` |
| `interview-hub:last-seen-version` | 已读更新公告版本 |
| `interview-hub:seeded` | 是否已插入欢迎记录 |
| `interview-hub:last-track` / `interview-hub:volume` | 音乐恢复状态 |
| `interview-hub:track-order` | 手动播放顺序（Track ID 数组），与音乐 Blob 分开保存 |

### 桌面数据目录 `%APPDATA%\Shiguang`

| 路径 | 内容 |
| --- | --- |
| `IndexedDB/`、`Local Storage/`、`Session Storage/`、`blob_storage/`、`File System/` | Chromium 存储 |
| `secure/api-key.bin` | API Key（DPAPI） |
| `backups/pre-update/<from>-to-<to>-<stamp>/` | 升级前快照 + `meta.json`，最多 3 份 |
| `data-state.json` | 当前版本、上次启动/成功启动、最近快照 |
| `logs/main.log` | 主进程日志（>2MB 轮转为 `.old`） |

---

## 6. 关键流程

### 启动（Web / 桌面共用渲染层）

1. `main.tsx` 读取设置、设置 `data-theme`。
2. `await db.open()`：先完成 Dexie 迁移，再渲染，避免半升级状态下读写。
3. 桌面版：`secrets.getApiKey()`；若为空但 localStorage 有旧明文 Key，则迁移进 safeStorage 并清掉明文。
4. 渲染 `<App initialApiKey>`；失败渲染 `StartupError`（可打开数据/快照目录）。
5. 桌面版下一帧 `app.notifyReady()` → 主进程写 `data-state.json`，标记本次启动成功。

### 桌面启动（`bootstrap`）

1. 确保数据目录、日志。
2. 读 `data-state.json`；若 `version` 与当前 `app.getVersion()` 不同 → 复制 5 个存储目录到快照（同一 from→to 只建一次，保留 3 份）。
3. 配置 session 权限/下载 → 注册 `app://` 协议 → IPC → LLM 代理 → 自动更新监听 → 创建窗口。
4. 窗口加载 `app://shiguang/index.html`；`app://` handler 只服务 `dist/`，防目录穿越，带 CSP、nosniff、缓存头。

### 桌面卸载

- 入口只在安装版的「设置 → 桌面版与更新」显示；二次确认后调用 `desktop.app.uninstall()`。
- 主进程 `app:uninstall` 校验来源、Windows 平台和 `app.isPackaged`，从 `process.execPath` 同目录查找 NSIS 生成的 `Uninstall <exe>.exe`。
- 找到后 `spawn(uninstaller, ['/currentuser'], { detached: true, stdio: 'ignore' })`，400ms 后 `app.quit()`，让卸载向导独立运行。
- 卸载只删除程序文件和快捷方式；`electron-builder.yml` 保持 `deleteAppDataOnUninstall: false`，`%APPDATA%\Shiguang` 数据保留。找不到卸载器时提示改用 Windows「设置 → 应用」。

### 说说

- 发布：`Composer` → `validateMediaFiles`（UI 限制）→ `createNote`（`db.ts` 再做单文件校验）→ 图片用 `compressImage` 转 WebP（最长边 1600，q=0.86；GIF/SVG 原样）→ notes/media 事务写入。
- 列表：`useLiveQuery(listNotesWithMedia)` 一次读全部 notes + media，在内存按 `noteId` 分组；搜索/分类/日期全在前端过滤。
- 删除笔记：事务内删 media + note。
- 编辑：新增媒体/标记删除已有媒体，保存时统一写回。

### 对话

- 技能：`listSkills(customSkills)` = 内置技能 + Dexie 自定义技能；对话保存 `skillId`。
- 发送：确保 chat 存在 → 存 user 消息 → 用首条消息自动命名 → 取全部历史（过滤 error）→ `streamChat`。
- 请求：`<baseUrl>/chat/completions`；messages = systemPrompt + 最近 20 条、总字符 ≤ 24k；`temperature` 来自设置。
- Web：直接 `fetch` 解析 SSE；桌面：`desktop.llm.stream` → 主进程 `net.fetch` → IPC delta/done/error；支持 AbortController 停止。
- 演示模式：按技能 ID 返回不同的内置示例，按 3 字符/16ms 假装流式。
- 失败：错误作为 assistant 消息写入（`error: true`），并 toast。
- 注意：`ChatPage` 卸载时（切到说说/设置）会 abort 当前生成。

### 计划表

- 总览：`PlansPage` 用 `listPlans()` + `db.planItems` 统计完成度，渲染文件夹网格；封面是 `plans.cover` Blob，通过 object URL 显示。
- 新建：弹窗输入标题 + 可选封面（压缩后存 Blob）→ `createPlan` 写入一条默认段落。
- 编辑：`PlanEditor` 一次加载 plan + planItems + planImages，之后维护本地 state；plan 的标题/正文/封面和计划条文字/详情/图片备注都做 450ms 防抖保存，组件卸载时 `flushPending()`。
- 正文：`PlanRichText` 是多个 contenteditable 块（h1/h2/h3/p），工具栏用 `document.execCommand('bold')` 和 `foreColor`；块内 HTML 在失焦时用 `sanitizeRichHtml` 清理。
- 计划条：左侧勾选按钮立即写 DB；右侧三角展开/收起详情；详情里可添加图片和多行文字。
- 计划图片：`addPlanImage` 复用 `compressImage`，单独存 `planImages`；小图显示在计划条末尾，点击打开 `PlanImageViewer`，备注放在图片下方的独立区域，不覆盖图片。
- 导出 HTML：`buildPlanInteractiveHtml` 生成自包含 HTML（无图片），保留 checkbox 和详情展开/收起，勾选状态用 localStorage 记忆。
- 导出 PNG：把图片转 data URL，生成离屏 `.plan-print-view` DOM，交给 `html-to-image` 的 `toPng`；高度超过 7000px 时降到 1x 像素比，生成后下载。
- 备份恢复：`plans / planItems / planImages` 全部纳入备份；封面和图片转 Base64，format 升到 3。

### 每日卡片

- 定义在 `cards.ts`：5 个标签（日常/工作/技能/兴趣/求职），每个标签有 `fields`（text/textarea/number）、配色、渐变；`plan` 与 `summary` 通过 `planLabel` 换文案。
- 求职卡：`applicationTotal = boss + online + other`。
- 保存：`saveCard` 裁剪字段长度（每个 ≤240 字、标题 ≤60）并至少有一项内容。
- 导出：Canvas 1080×1440，手动换行（中文标点避头）、渐变背景、求职统计块；纯本机，不依赖第三方。
- 卡片库：`listCards` 按日期倒序，按标签筛选，可再次导出/编辑/删除。

### 音乐

- `MusicProvider` 全局只创建一个 `HTMLAudioElement`，切换页面不断播。
- 导入：`addTracks` 校验音频、单曲 ≤80MB、按 `fileName::size` 去重、读取时长，Blob 存 Dexie。
- 播放：当前曲 Blob → object URL → audio.src；音量/上次曲目持久化。
- 播放顺序：`order` 是 Track ID 数组，存 `interview-hub:track-order`；`orderedTracks` = 手动顺序 + 新曲追加 + 已删曲过滤。
- 播放模式：off = 顺序播放（最后一首结束停止）、all = 列表循环、one = 单曲循环；`MusicBar` / `MusicDrawer` 都有选择器。
- 音乐库「调整顺序」模式：上移/下移按钮调用 `moveTrack`，立即持久化，不影响当前播放。
- Media Session 系统媒体键；删除当前曲时自动切到相邻曲并暂停。
- 注意：0.4.0 修复了「刷新后上次播放曲目被误清空」的问题（`tracksLoaded` 前不执行清理）。

### 设置 / 备份 / 更新

- 设置页维护一份本地 `form`，与 context 比较显示「未保存」浮动条；主题切换即时生效。
- 头像：本地图片居中裁剪 256×256 → WebP data URL（≤12MB 源文件）。
- 保存设置：`SettingsProvider` 立即写 localStorage + 主题；桌面版 Key 变化时再调 `secrets.setApiKey`。
- 导出：`buildBackup` 读取全部表，媒体/音乐/计划封面/计划图片转 data URL，去掉 apiKey，输出 `拾光备份-YYYY-MM-DD.json`（format 3）。
- 恢复：校验 `app/format/数组结构` → 解析媒体/计划图片 → 事务性清空 10 张表并重灌；旧备份缺少 plans 数组时按空处理；设置合并但保留当前 apiKey。
- 更新：`electron-updater` 从 GitHub Releases 检查；`autoDownload=false`，状态经 `updates:status` 推给设置页；下载完成后重启安装。

---

## 7. 扩展指南（改哪里）

| 想做的事 | 改动点 |
| --- | --- |
| 新增内置技能 | `src/skills.ts` 加对象（id/name/icon/description/systemPrompt/group/kind/featured/suggestions）；需要演示回答时改 `src/llm.ts` 的 demo 分支 |
| 新增技能分组 | `src/types.ts` 的 `SkillGroup`、`src/skills.ts` 的 `SKILL_GROUPS`、`SkillPicker` 的 `GROUP_HINTS` |
| 新增页面 | `PageKey` → `hooks.ts readPage` → `Sidebar NAV_ITEMS` → `App.tsx` 渲染 → `Topbar TITLES` → 样式；需要深链就扩展 hash |
| 新增数据表/字段 | `db.ts` 新 version（保留旧声明）→ 类型 → CRUD → `backup.ts` 导出/恢复 → `getContentCounts`/`clearAllContent` → 设置页统计（可选）→ 本文件 |
| 新增卡片标签 | `types.ts CARD_TAGS` + `cards.ts CARD_TAG_INFO`（字段、配色、渐变）；预览/PNG/卡片库自动复用 |
| 新增计划正文块类型 | `types.ts PlanBlockType` + `PlanRichText BLOCK_TYPES/PLACEHOLDERS` + CSS + `planExport.blocksToHtml` 的标签映射 |
| 改计划导出样式 | 互动 HTML 在 `planExport.baseDocumentStyles`；PNG 在 `styles.css` 的 `.plan-print-view` 作用域 |
| 改音乐排序/播放模式 | `MusicContext` 的 `order` / `orderedTracks` / `moveTrack` / `setRepeat`；UI 在 `MusicBar`、`MusicDrawer` |
| 新增设置项 | `types.ts Settings` + `DEFAULT_SETTINGS` + `loadSettings` 校验 + `SettingsPage` 表单；敏感值不要进 localStorage/备份 |
| 新增 API 服务预设 | `SettingsPage.tsx` 的 `PROVIDERS` 数组 |
| 新增桌面能力 | `electron/main.cjs` handler（必须 `isTrusted`）→ `preload.cjs` 暴露 → `src/desktop.ts` 类型 → UI |
| 改自动更新 | `electron/main.cjs setupAutoUpdater` + `electron-builder.yml publish` + README 发布流程 |
| 改数据目录/协议/appId | **不要改**（见第 1 节） |

---

## 8. 风险 / 已知限制（优化时优先看）

### 数据与存储

1. **IndexedDB 存媒体**：图片/视频/音乐全在 IndexedDB，量大时体积和读写压力都高；README 已把「SQLite + 本地媒体文件夹」列为后续方向。
2. **备份是全量 Base64 JSON**：媒体多时文件巨大，恢复需要整体进内存；代码上限 512MB，大库可能失败。
3. **升级快照 = 完整复制**：媒体多时额外占用一份当前数据；只保留最近 3 份，不自动恢复。
4. **UI 限制 ≠ 数据层限制**：`validateMediaFiles` 限制 9 个/300MB，但 `db.buildMediaItems` 只校验单文件大小；恢复备份可绕过这些限制。
5. **设置/版本号多处同步**：`package.json`、`src/changelog.ts`、`README.md`，容易漂移；未来可考虑单一版本源。
6. **恢复是全量覆盖**：没有合并/选择性恢复；恢复后不会重新加载页面，但 liveQuery 会自动刷新。

### 应用行为

7. **切页会中断对话生成**：`ChatPage` 卸载时 abort（已生成的部分会以 assistant 消息保存）。
8. **没有 ErrorBoundary**：renderer 运行时渲染异常可能直接白屏（启动阶段有 `StartupError`）。
9. **没有托盘/后台**：关闭窗口 = 退出，音乐停止；无开机启动。
10. **无自动化测试/无 ESLint**：回归完全靠手工；高风险模块是 `backup.ts`、`db.ts`、`llm.ts`、`cards.ts`、`planExport.ts`、Electron IPC。
11. **样式单文件（现约 7k 行）**：类名全局，新增 UI 时注意复用现有 `card/btn/chip/field` 体系，避免冲突。
12. **桌面版仅 Windows x64**：无 mac/linux 构建配置；安装包未签名，SmartScreen 会警告。
13. **Web 版限制**：API Key 明文 localStorage；直连 API 可能 CORS；`connect-src 'self'` 只约束桌面版。
14. **网络/更新依赖 GitHub**：自动更新需要 Release 里上传 exe + `latest.yml` + `.blockmap`；国内网络可能慢。
15. **中英文**：UI 全中文，无 i18n。
16. **`index.html` favicon 用绝对路径 `/favicon.svg`**：部署在子路径时可能 404（桌面 `app://` 根路径正常）。
17. **无数据库加密**：本地内容（说说/对话/计划/卡片）是明文，API Key 例外。
18. **计划 PNG 依赖离屏 DOM + html-to-image**：超长计划可能触发 canvas 尺寸/内存限制；代码超过 7000px 时降为 1x，图片很多时生成会变慢。
19. **计划保存有 450ms 防抖**：正常切页会在卸载时 flush，但写入是异步的；如果在保存完成前强杀应用，最后不到 1 秒的输入可能丢失。
20. **富文本使用 contenteditable + execCommand**：`execCommand` 已废弃，目前依赖 Chromium 行为；没有撤销/重做、列表、对齐等高级格式，粘贴被降级为纯文本。
21. **互动 HTML 不含图片**（按需求设计）；勾选状态用导出文件的 localStorage 记忆，`file://` 或隐私模式下可能无法跨会话保留。
22. **计划图片/封面仍存 IndexedDB**：会同时进入全量 Base64 备份，图片多时备份体积明显增大。
23. **音乐顺序只在 localStorage**：`interview-hub:track-order` 不进入备份；清浏览器数据或换设备后会回到按导入时间排序，播放模式也不持久化。
24. **计划总览按更新时间排序**：没有搜索、筛选、手动排序或文件夹嵌套。
25. **卸载依赖 NSIS 卸载器**：开发模式和 `win-unpacked` 没有 `Uninstall Shiguang.exe`，按钮会提示改用 Windows 设置；应用内卸载保留 `%APPDATA%\Shiguang` 数据目录。

---

## 9. 版本发布清单

1. 更新代码与 `src/changelog.ts`：新增一条 `CHANGELOG`（version/date/title/summary/highlights/added/improved/fixed）。
2. 同步版本号：`package.json`、`src/changelog.ts APP_VERSION`、`README.md` 顶部版本与「已实现/限制」。
3. `npm run typecheck` → `npm run build`（确认无类型/构建错误）。
4. `npm run build:desktop` 生成 `release/Shiguang-Setup-<ver>.exe`、`latest.yml`、`.blockmap`。
5. 在 GitHub 创建 Release，Tag `v<ver>`，上传上述三个文件。
6. 用旧安装版验证：检查更新 → 下载 → 重启安装 → 数据仍在、快照已生成。
7. 用安装版验证「设置 → 卸载拾光」：卸载向导启动、程序文件和快捷方式被删除、`%APPDATA%\Shiguang` 数据仍在。
8. 更新 `PROJECT_MAP.md`（如果流程/结构有变化），commit + push。

### 0.4.0 验证记录（2026-11-02）

- `npm run typecheck`、`npm run build` 通过。
- 用 headless Edge + Playwright 做过一轮冒烟测试：新建计划/封面、正文加粗与颜色、计划条勾选/取消、详情展开、图片与备注、放大预览、互动 HTML（checkbox 可勾选、详情可展开、无 `<img>`）、PNG 下载（有效 PNG 签名）、刷新后计划与勾选状态保留、播放模式选择、手动排序持久化、上次播放曲目恢复。
- `npm run build:desktop` 通过：生成 `Shiguang-Setup-0.4.0.exe`（122,194,343 字节）、`latest.yml`、`.blockmap`；exe 版本信息为 0.4.0。
- 用独立 `SHIGUANG_USER_DATA` 启动 `release/win-unpacked/Shiguang.exe`：主进程日志显示「启动拾光 0.4.0」「渲染层就绪」，IndexedDB 与 localStorage 正常创建；未触碰正式 `%APPDATA%\Shiguang` 数据。
- 已发布 GitHub Release `v0.4.0`（Latest），上传 exe、`latest.yml`、`.blockmap`；远端 `latest.yml` 与本地构建一致。
- 安装包 SHA-256：`D0E2968644E9E65637FFCDE84F7A498EE01AAD4C3D3BB72409F258E0B71A4BCA`。
- 尚未覆盖：用 0.3.0 安装版实际执行「检查更新 → 下载 → 重启安装」全流程；备份导入恢复；超长计划 PNG；图片很多时的导出性能；自定义颜色选择器的直接 E2E。

### 0.4.1 验证记录（2026-11-02）

- `npm run typecheck`、`npm run build`、`node --check electron/main.cjs` / `electron/preload.cjs` 通过。
- 用 `npm run pack:desktop` 重新打包后，通过 CDP 对 `release/win-unpacked/Shiguang.exe` 做了冒烟测试：
  - 设置页显示「卸载拾光」，确认框包含数据目录和「数据不会被删除」说明。
  - 未安装目录没有卸载器时，点击返回「没有找到卸载程序」toast，应用保持运行。
  - 在安装目录放入模拟卸载器后，确认会以 `/currentuser` 启动它，应用退出码 0，临时数据目录仍然存在。
- `npm run build:desktop` 生成 `release/Shiguang-Setup-0.4.1.exe`（122,195,094 字节，SHA-256 `9AB5B68ECF1DC11610BAB45E07830A0BCAB2B48D0326D4CF5890B1675668AB1C`）；打包后的 `Shiguang.exe` 启动日志确认版本 0.4.1、渲染层就绪。
- 该版本目前只在本地构建，**尚未发布 GitHub Release**。
- 未执行真实 NSIS 卸载流程，以免影响本机已安装的 0.3.0；仍需在 0.4.1 安装版中确认卸载向导、程序文件和快捷方式删除、`%APPDATA%\Shiguang` 数据保留。

---

## 10. 下一步候选（按收益/成本粗排）

- **工程质量**：加 Vitest（db/backup/skills/cards 纯函数优先）、ErrorBoundary、ESLint/Prettier、版本号单一来源。
- **数据可靠性**：自动备份（定时导出到用户目录）、快照恢复向导、备份流式/压缩（zip）、存储配额预警。
- **媒体架构**：SQLite + 本地媒体文件夹（逐步替换 IndexedDB Blob），或 IndexedDB 只存元数据 + File System Access。
- **桌面体验**：托盘常驻、关闭到托盘、后台播放、开机启动、代码签名、应用图标 `.ico` 校验。
- **对话**：跨页面继续生成（把流式状态提升到全局）、对话搜索/重命名/导出、上下文长度提示、模型参数预设。
- **记录/卡片**：全文搜索、按月/标签统计、单条导出、卡片模板自定义。
- **计划表**：搜索与筛选、拖拽排序/文件夹嵌套、正文撤销重做与更多格式、计划完成度统计、导出主题与封面裁剪。
- **同步（可选）**：端到端加密的轻量后端；在此之前保持「本地优先 + 备份」定位。

---

## 11. 维护约定（重要）

- **每次改动都要**：更新本文件（若结构/流程/限制变化）→ `git add -A` → commit → `git push origin main`。
- 用户可见行为变化时同步 `README.md` 和 `src/changelog.ts`。
- 不要提交 `dist/`、`release/`、`node_modules/`、日志或任何密钥。
- 修改数据库/备份/协议相关代码前，先回看第 1 节和第 5 节。
