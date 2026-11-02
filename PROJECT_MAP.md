# 拾光 · 内部项目地图

> 这份文件是给 Claude / 未来的维护者看的，不是用户文档。目标：任何一次优化前，能在几分钟内重新建立完整心智模型。
> 用户向说明在 `README.md`；这里记录的是「东西在哪、怎么连、什么不能碰、改哪里」。
>
> 最后扫描：2026-11-02 · 对应版本 **0.3.0**

---

## 0. 一句话

「拾光」是一个**本地优先**的个人空间：说说（图文/视频）、AI 技能对话、每日卡片、本地音乐。
同一套 React 代码同时跑在 **Web（Vite）** 和 **Windows 桌面版（Electron + NSIS）**，没有后端，所有数据在本机。

- 仓库：`git@github.com:harukimisaki183-source/Shiguang-Personal-Space.git`
- 分支：`main`（本地与 origin 同步）
- 产品名/可执行文件：拾光 / `Shiguang.exe`
- appId：`com.harukimisaki.shiguang`
- 当前版本：`0.3.0`（`package.json` / `src/changelog.ts` / `README.md` 三处）

---

## 1. 绝对不要破坏的约定

发布后改动这些，会被系统视为「另一个应用」，用户旧数据看起来会全部消失：

1. `electron-builder.yml` 的 `appId`。
2. 自定义协议 `app://shiguang`（`electron/main.cjs` 的 `APP_SCHEME` / `APP_HOST`）。
   它决定了桌面版 IndexedDB/localStorage 的 origin。
3. 默认数据目录名 `Shiguang`（`APP_USER_DATA`，开发版是 `Shiguang Dev`）。
4. Dexie 数据库名 `interview-hub-db`（`src/db.ts`）。
5. 备份 JSON 的标识 `app: "interview-hub"` 与 `format` 版本（`src/backup.ts`）。
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

- 技术栈：React 19 + TypeScript（strict）+ Vite 8 + Dexie 4 + react-markdown/remark-gfm + lucide-react + date-fns。
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
│    ├─ SettingsPage→ localStorage(settings) + backup.ts + desktop bridge                         │
│    └─ MusicProvider (全局唯一 <audio>) → Dexie(tracks)                                          │
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
| `src/styles.css` | **全部样式，5,687 行**，按注释分区块；无 CSS Modules |
| `src/changelog.ts` | `APP_VERSION` + 4 个版本的 `CHANGELOG`（更新公告数据源） |

### 数据与业务

| 文件 | 作用 |
| --- | --- |
| `src/db.ts` | Dexie 表结构/版本升级 + notes/media/chats/messages/skills/cards/tracks 的增删改查 + 统计/清空/首次种子记录 |
| `src/skills.ts` | 7 个内置技能（6 chat + 1 card）、分组、`resolveSkill`、旧 `mode → skillId` 映射 |
| `src/llm.ts` | 端点拼接、历史裁剪、SSE 解析、桌面代理调用、连接测试、演示模式虚构回答 |
| `src/cards.ts` | 5 类卡片字段定义/配色、预览数据、文字版、Canvas 1080×1440 PNG 渲染导出 |
| `src/backup.ts` | 全量导出（媒体/音乐转 Base64）与恢复（校验后事务性清空并重灌） |
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
| `src/pages/BlogPage.tsx` | 记录流 + 搜索/分类/日期筛选 + 右侧日历与统计 |
| `src/pages/ChatPage.tsx` | 对话列表 + 技能切换 + 流式消息 + 技能/卡片入口 |
| `src/pages/SettingsPage.tsx` | 资料/头像、大模型配置、主题、备份恢复、桌面信息与更新、关于 |
| `src/contexts/*` | Settings（含桌面 Key 同步）、Toast、Confirm、Music（全局播放器） |

### Electron

| 文件 | 作用 |
| --- | --- |
| `electron/main.cjs` | 单实例、`app://` 协议、CSP、窗口、下载对话框、权限白名单、IPC、自动更新、数据版本标记 |
| `electron/preload.cjs` | `contextBridge` 暴露 `runtime/app/secrets/llm/updates` |
| `electron/data-safety.cjs` | `data-state.json`、升级前快照、快照列表/清理（最多 3 份） |
| `electron/secrets.cjs` | Key 文件格式：首字节 1=DPAPI 加密 / 0=降级明文；原子写 |
| `electron/llm-proxy.cjs` | 校验参数、`net.fetch` 流式代理、SSE 解析、取消、连接测试 |

---

## 5. 数据模型

### Dexie `interview-hub-db`（version 2，`src/db.ts:45`）

| 表 | 主键 / 索引 | 关键字段 |
| --- | --- | --- |
| `notes` | `id, createdAt, updatedAt, category` | content, category（日常/面试/学习/心情/其他） |
| `media` | `id, noteId, createdAt` | kind(image/video), name, mime, size, width/height/duration, **blob**, createdAt |
| `chats` | `id, updatedAt, skillId` | title, skillId（0.1 的 `mode` 已在 v2 迁移为 skillId） |
| `messages` | `id, chatId, createdAt` | role(user/assistant), content, error? |
| `tracks` | `id, createdAt` | title, artist, fileName, mime, size, duration, **blob** |
| `skills` | `id, createdAt, updatedAt` | 自定义技能：icon/name/description/systemPrompt，`custom: true` |
| `cards` | `id, date, tag, createdAt` | type(plan/summary), title, fields: Record<string,string> |

- 版本升级方式：新增 `this.version(n).stores(...)`，**保留旧声明**；桌面主进程会在跨版本启动前自动快照。
- 媒体/音乐直接存 Blob，无独立文件目录。

### localStorage（`src/storage.ts`）

| Key | 内容 |
| --- | --- |
| `interview-hub:settings:v1` | 昵称/头像/bio/主题/演示模式/BaseURL/Key/模型/温度/自定义快速填入；桌面版保存时剔除 `apiKey` |
| `interview-hub:last-seen-version` | 已读更新公告版本 |
| `interview-hub:seeded` | 是否已插入欢迎记录 |
| `interview-hub:last-track` / `interview-hub:volume` | 音乐恢复状态 |

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
- 结束/上一首/下一首/循环（off/all/one）、Media Session 系统媒体键。
- 删除当前曲时自动切到相邻曲并暂停。

### 设置 / 备份 / 更新

- 设置页维护一份本地 `form`，与 context 比较显示「未保存」浮动条；主题切换即时生效。
- 头像：本地图片居中裁剪 256×256 → WebP data URL（≤12MB 源文件）。
- 保存设置：`SettingsProvider` 立即写 localStorage + 主题；桌面版 Key 变化时再调 `secrets.setApiKey`。
- 导出：`buildBackup` 读取全部表，媒体/音乐转 data URL，去掉 apiKey，输出 `拾光备份-YYYY-MM-DD.json`。
- 恢复：校验 `app/format/数组结构` → 解析媒体 → 事务性清空 7 张表并重灌；设置合并但保留当前 apiKey。
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
10. **无自动化测试/无 ESLint**：回归完全靠手工；高风险模块是 `backup.ts`、`db.ts`、`llm.ts`、`cards.ts`、Electron IPC。
11. **样式单文件 5,687 行**：类名全局，新增 UI 时注意复用现有 `card/btn/chip/field` 体系，避免冲突。
12. **桌面版仅 Windows x64**：无 mac/linux 构建配置；安装包未签名，SmartScreen 会警告。
13. **Web 版限制**：API Key 明文 localStorage；直连 API 可能 CORS；`connect-src 'self'` 只约束桌面版。
14. **网络/更新依赖 GitHub**：自动更新需要 Release 里上传 exe + `latest.yml` + `.blockmap`；国内网络可能慢。
15. **中英文**：UI 全中文，无 i18n。
16. **`index.html` favicon 用绝对路径 `/favicon.svg`**：部署在子路径时可能 404（桌面 `app://` 根路径正常）。
17. **无数据库加密**：本地内容（说说/对话/卡片）是明文，API Key 例外。

---

## 9. 版本发布清单

1. 更新代码与 `src/changelog.ts`：新增一条 `CHANGELOG`（version/date/title/summary/highlights/added/improved/fixed）。
2. 同步版本号：`package.json`、`src/changelog.ts APP_VERSION`、`README.md` 顶部版本与「已实现/限制」。
3. `npm run typecheck` → `npm run build`（确认无类型/构建错误）。
4. `npm run build:desktop` 生成 `release/Shiguang-Setup-<ver>.exe`、`latest.yml`、`.blockmap`。
5. 在 GitHub 创建 Release，Tag `v<ver>`，上传上述三个文件。
6. 用旧安装版验证：检查更新 → 下载 → 重启安装 → 数据仍在、快照已生成。
7. 更新 `PROJECT_MAP.md`（如果流程/结构有变化），commit + push。

---

## 10. 下一步候选（按收益/成本粗排）

- **工程质量**：加 Vitest（db/backup/skills/cards 纯函数优先）、ErrorBoundary、ESLint/Prettier、版本号单一来源。
- **数据可靠性**：自动备份（定时导出到用户目录）、快照恢复向导、备份流式/压缩（zip）、存储配额预警。
- **媒体架构**：SQLite + 本地媒体文件夹（逐步替换 IndexedDB Blob），或 IndexedDB 只存元数据 + File System Access。
- **桌面体验**：托盘常驻、关闭到托盘、后台播放、开机启动、代码签名、应用图标 `.ico` 校验。
- **对话**：跨页面继续生成（把流式状态提升到全局）、对话搜索/重命名/导出、上下文长度提示、模型参数预设。
- **记录/卡片**：全文搜索、按月/标签统计、单条导出、卡片模板自定义。
- **同步（可选）**：端到端加密的轻量后端；在此之前保持「本地优先 + 备份」定位。

---

## 11. 维护约定（重要）

- **每次改动都要**：更新本文件（若结构/流程/限制变化）→ `git add -A` → commit → `git push origin main`。
- 用户可见行为变化时同步 `README.md` 和 `src/changelog.ts`。
- 不要提交 `dist/`、`release/`、`node_modules/`、日志或任何密钥。
- 修改数据库/备份/协议相关代码前，先回看第 1 节和第 5 节。
