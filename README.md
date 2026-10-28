# HR Assistant

面向 HR 的自然语言招聘工作台，将简历录入、候选人跟进和面试安排连接到同一条工作流。

使用自然语言描述招聘进展，助手识别候选人、岗位和时间，补全缺失信息，并在确认后更新档案与处理记录。

![Next.js](https://img.shields.io/badge/Next.js-15-111827?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[功能预览](#功能预览) · [核心功能](#核心功能) · [快速开始](#快速开始) · [项目结构](#项目结构) · [架构设计](docs/architecture.md)

## 功能预览

### 招聘助手

查询候选人进度与面试安排，通过连续对话补充信息，核对操作卡后推进流程。

![招聘助手与操作确认](docs/images/assistant-workflow.png)

### 简历入库

上传文件或粘贴简历文本，核对提取字段、选择岗位，查看技能关键词后建立档案。

![简历录入与字段核对](docs/images/resume-intake.png)

### 候选人台账

按姓名、岗位和招聘阶段筛选档案，查看资料原文、后续安排与操作记录。

![候选人台账](docs/images/candidates.png)

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 自然语言协作 | 查询面试、待跟进、候选人阶段、岗位人数和操作记录；推进阶段并安排面试 |
| 连续对话 | 缺少姓名、日期、时间或轮次时继续补充，同名档案通过岗位或 ID 区分 |
| 操作确认 | 执行前显示变更内容，支持取消、过期处理、重复确认保护与档案版本检查 |
| 简历处理 | 支持文本 PDF、DOCX、UTF-8 TXT 和粘贴文本；字段可人工修改 |
| 关键词提示 | 展示岗位技能的命中与未提及项，辅助人工核对 |
| 档案与岗位 | 集中管理应聘档案、原文件、招聘阶段、JD 和处理记录 |

招聘指令在本地识别，无需配置外部大模型 API。所有流程数据通过服务端读写 PostgreSQL。

## 快速开始

### 环境要求

- Node.js 22.x 或 24.x
- pnpm
- PostgreSQL 16，或可运行 PostgreSQL 的 Docker 环境

### 安装与配置

```bash
git clone https://github.com/yhydumpling/hr-assistant.git
cd hr-assistant
pnpm install --frozen-lockfile
cp .env.example .env.local
```

在 `.env.local` 中配置数据库连接：

```dotenv
DATABASE_URL=postgresql://tsin:tsin_demo@127.0.0.1:5432/tsin_hr
```

已有 PostgreSQL 时填写自己的连接地址；使用项目的数据库容器时，执行：

```bash
docker compose up -d
```

数据库启动后初始化表结构与演示数据，再启动应用：

```bash
pnpm db:init
pnpm dev
```

访问 [http://127.0.0.1:3001](http://127.0.0.1:3001)。Windows 用户也可以在完成数据库初始化后双击 `Start-LocalDemo.cmd`。

### 生产构建

```bash
pnpm build
pnpm start
```

## 项目结构

```text
src/
├── app/                  页面入口、布局与 HTTP API
├── features/             招聘助手、简历、候选人和岗位功能
├── components/           公共基础界面组件
├── hooks/                工作区状态与数据请求
├── lib/                  共享类型、请求封装与格式化
└── server/               数据库、仓储、业务服务与指令解析
db/                       PostgreSQL 表结构与初始化数据
scripts/                  数据库初始化脚本
docs/                     架构说明与功能截图
```

页面按业务功能组织，服务端将 HTTP 请求、招聘流程和数据库访问分开。详细数据结构与处理链路见 [架构设计](docs/architecture.md)。

## 使用说明

- 一份候选人档案对应一次岗位应聘，可分别记录同一人在不同岗位的进度。
- 日期按北京时间理解，流程变更以确认卡中的具体内容为准。
- 文件大小上限为 4 MB，PDF 需要包含可提取文本；图片和扫描件 OCR 暂未接入。
- 岗位关键词“未提及”表示需要进一步核对，不直接作为淘汰依据。
- 页面截图使用虚构资料。
