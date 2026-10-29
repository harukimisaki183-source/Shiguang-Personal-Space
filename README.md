# 拾光 · 个人空间（Web 原型）

一个「本地优先」的个人空间：记录说说、和 AI 对话、做每天的卡片，听自己的音乐。当前是 Web 原型版，用来验证交互和数据模型，后续再打包成 Windows 桌面应用。

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
  - 支持 DeepSeek / 通义千问 / 智谱 GLM / Kimi 快速填入
- **每日卡片**
  - 两种类型：计划 / 总结
  - 五个标签：日常、工作、技能、兴趣、求职
  - 求职卡片会自动汇总 BOSS直聘、网申和其他渠道的投递数量
  - 实时卡片预览，保存到本地卡片库
  - 导出 1080 × 1440 PNG，或复制卡片文字
  - 卡片库支持按标签筛选、编辑、删除、再次导出
- **音乐播放器**
  - 导入本地音乐，保存到 IndexedDB
  - 全局播放器：播放/暂停、上一首/下一首、进度、音量、循环
  - 切换页面不中断；支持系统媒体键（Media Session）
- **其他**
  - 首次启动更新公告，版本变化时再次提示
  - 浅色 / 深色主题
  - 个人昵称、头像、简介
  - 一键导出 / 导入全部数据（含图片、视频、音乐、卡片、自定义技能）
  - 浏览器存储用量展示

## 运行

```powershell
npm install
npm run dev
```

打开 `http://localhost:5173`。

```powershell
npm run typecheck   # TypeScript 检查
npm run build       # 生产构建
npm run preview     # 预览生产构建
```

## 技术栈

- React 19 + TypeScript + Vite
- Dexie（IndexedDB）本地数据
- react-markdown + remark-gfm 渲染模型回答
- Canvas 生成卡片 PNG
- date-fns、lucide-react
- 无 UI 框架，样式集中在 `src/styles.css`

## 数据存在哪里

| 数据 | 位置 |
| --- | --- |
| 说说、媒体、对话、消息、卡片、自定义技能、音乐 | 浏览器 IndexedDB：`interview-hub-db` |
| 设置、主题、API Key | localStorage：`interview-hub:settings:v1` |
| 已读版本号 | localStorage：`interview-hub:last-seen-version` |

**注意**：清理浏览器数据、换浏览器、重装系统都会丢失内容。请在「设置 → 数据管理」定期导出备份。

## 大模型配置

默认开启「演示模式」，不会调用真实模型。关闭演示模式后：

1. 填 API Base URL（例如 `https://api.deepseek.com/v1`）
2. 填模型名（例如 `deepseek-chat`）
3. 填 API Key
4. 点「测试连接」

浏览器直接请求接口可能遇到 CORS 限制；打包成桌面版后由 Electron 主进程代理请求，可以规避这个问题。

> 当前 API Key 明文保存在 localStorage，仅适合本机原型使用。桌面版会改为 Electron `safeStorage` 系统加密；备份文件不包含 API Key。

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

- 网页版关闭浏览器后音乐停止，无法真正做到托盘常驻。
- 视频格式受浏览器支持限制（MP4/H.264、WebM 较稳；MKV、HEVC 可能无法播放）。
- 大视频、大量音乐受浏览器存储配额限制，建议控制文件大小。
- 没有后端，不能多端同步；换设备请用导出/导入备份。
- 备份文件使用 Base64 保存媒体，数据多时 JSON 会很大。

## 下一步（桌面版）

建议用 Electron + Vite 迁移：

- `electron-vite` 搭主进程 / preload / 渲染进程
- SQLite（better-sqlite3）替换 IndexedDB，媒体改为本地文件夹
- `safeStorage` 加密 API Key，主进程代理 LLM 流式请求
- 托盘、单实例锁、后台播放、系统媒体键
- 启动更新公告可继续内置，后续加自动更新和安装包签名

## 目录结构

```text
src/
  App.tsx                 应用外壳与路由
  main.tsx                入口
  styles.css              全部样式
  types.ts                数据类型
  db.ts                   Dexie 数据表与读写
  skills.ts               内置技能与技能解析
  cards.ts                卡片模板、文字与 PNG 导出
  backup.ts               备份导出/恢复
  llm.ts                  大模型流式请求与演示模式
  storage.ts              设置、版本号等 localStorage
  mediaFiles.ts           媒体文件校验
  hooks.ts                路由、object URL
  contexts/               设置、Toast、确认框、音乐播放器
  components/chat/        技能库、技能编辑、卡片编辑与卡片库
  components/             布局、更新公告、音乐、模态框、博客组件
  pages/                  说说 / 对话 / 设置
```
