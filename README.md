# HR招聘助手

面向 HR 的自然语言招聘工作台，将简历录入、候选人跟进和面试安排连接到同一条工作流。

使用自然语言描述招聘进展，助手识别候选人、岗位和时间，补全缺失信息，并在确认后更新档案与处理记录。

![Next.js](https://img.shields.io/badge/Next.js-15-111827?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[核心功能](#核心功能) · [快速开始](#快速开始) · [系统架构](#系统架构) · [项目结构](#项目结构) · [系统接入](#系统接入) · [文档入口](#文档入口)

![候选人台账](docs/images/candidates.png)

## 核心功能

| 功能 | 说明 |
| --- | --- |
| 自然语言协作 | 查询面试、待跟进、候选人阶段、岗位人数和操作记录；推进阶段并安排面试 |
| 邮件邀约 | 整理邀请邮件草稿，支持收件人、抄送、主题与正文编辑，再交由邮件客户端发送 |
| 表格台账 | 按视图查看申请记录，支持筛选、排序、阶段分组与字段显示设置 |
| 连续对话 | 缺少姓名、日期、时间或轮次时继续补充，同名档案通过岗位或 ID 区分 |
| 操作确认 | 执行前显示变更内容，支持取消、过期处理、重复确认保护与档案版本检查 |
| 简历处理 | 支持文本 PDF、DOCX、TXT 和粘贴文本；统一中英文标签、常见技能别名与字段格式 |
| 字段核对 | 展示提取依据、候选值和待核对项，保留在读等原文状态；字段可人工修改 |
| 关键词提示 | 将核对后的技能与岗位要求对照，按技能名称及别名匹配，辅助人工核对 |
| 档案与岗位 | 集中管理应聘档案、原文件、招聘阶段、JD 和处理记录 |

招聘指令在本地识别，无需配置外部大模型 API。所有流程数据通过服务端读写 PostgreSQL。

简历解析采用“文件读取 → 文本规范化 → 字段提取 → 人工核对”的流程；字段约定、不同写法的处理和适用边界见 [简历解析](docs/resume-parsing.md)。

<details>
<summary>查看更多功能界面</summary>

### 招聘对话

通过自然语言查询进度、更新阶段和补充面试信息，核对具体安排后推进流程。

![招聘助手与操作确认](docs/images/assistant-workflow.png)

### 悬浮助手与邮件

从台账打开悬浮助手，整理带收件人和抄送的邀请邮件。切换页面可以继续同一段对话。

![候选人台账中的悬浮招聘助手](docs/images/assistant-widget.png)

### 简历入库

上传文件或粘贴文本，将不同标签和写法映射到统一字段，核对后选择岗位并建立档案。

![简历录入与字段核对](docs/images/resume-intake.png)

### 原文依据

展开字段依据，查看现居城市与意向城市的区分，以及教育层次的原文状态。

![简历字段提取依据](docs/images/resume-evidence.png)

</details>

<details>
<summary>使用范围与资料说明</summary>

- 一份候选人档案对应一次岗位应聘，可分别记录同一人在不同岗位的进度。
- 日期按北京时间理解，流程变更以确认卡中的具体内容为准。
- 文件大小上限为 4 MB，PDF 最多 30 页且需要包含可提取文本；图片或扫描件需先转换为文字。
- TXT 优先读取 UTF-8，支持带 BOM 的 UTF-16 和 GB18030 回退；出现乱码时请转换编码或粘贴文本。
- 解析状态表示规则是否找到依据或发现歧义，不代表身份真实性或能力评价。
- 岗位技能“待核对”表示当前技能字段未列出对应项，不直接作为淘汰依据。
- 页面截图使用虚构资料。

</details>

全部功能图见 [功能预览](docs/screenshots.md)。

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

访问 [http://127.0.0.1:3001](http://127.0.0.1:3001)。Windows 用户也可以在完成数据库初始化后双击 [scripts/start-local.cmd](scripts/start-local.cmd)。

已有数据库升级表结构时执行以下命令，只补充表结构，不插入演示资料：

```bash
pnpm db:migrate
```

### 生产构建

```bash
pnpm build
pnpm start
```

## 系统架构

浏览器工作台通过 HTTP API 访问同一 Next.js 应用内的业务服务；简历解析、招聘指令和数据仓储按职责分开，流程数据保存到 PostgreSQL。

![HR招聘助手模块运行架构](docs/images/architecture.png)

[交互式架构图](docs/diagrams/hr-assistant.html) · [可编辑源文件](docs/diagrams/hr-assistant.architecture.json) · [详细架构说明](docs/architecture.md)

交互版请下载 HTML 文件后，用浏览器打开。架构图使用 [Archify](https://github.com/tt-a1i/archify) 生成，并保留可编辑的架构描述。

## 项目结构

```text
src/
├── app/                  页面入口、布局与 HTTP API
├── features/             招聘助手、简历、候选人和岗位功能
├── components/           公共基础界面组件
├── hooks/                工作区状态与数据请求
├── lib/                  共享类型、字段约定、请求封装与格式化
└── server/               数据库、仓储、业务服务与文本解析
db/                       PostgreSQL 表结构与初始化数据
scripts/                  数据库初始化、表结构更新与本地启动脚本
docs/                     文档索引、领域词汇、架构图与功能截图
├── README.md             文档入口
├── domain.md             领域词汇
├── diagrams/             交互式架构图与可编辑源文件
└── images/               架构图和功能截图
```

页面按业务功能组织，服务端将 HTTP 请求、招聘流程和数据库访问分开。详细数据结构与处理链路见 [架构设计](docs/architecture.md)。

## 系统接入

已为招聘软件、企业微信预留适配器接口。考虑候选人数据的隐私风险，公开版本默认停用外部同步与通知，不会向这些系统传输候选人资料。

取得合作授权后，可沿预留接口接入目标系统；需要配置企业凭证、数据范围和字段映射，再启用对应业务流程。接口契约与接入方式见 [外部系统接入](docs/integrations.md)。

邀请邮件以可编辑草稿提供，支持收件人与抄送；生成草稿不代表已经发送，发送由用户的邮件客户端完成。

## 文档入口

| 文档 | 内容 |
| --- | --- |
| [文档索引](docs/README.md) | 全部技术说明与功能预览入口 |
| [领域词汇](docs/domain.md) | 候选人档案、提取依据与招聘流程的概念约定 |
| [架构设计](docs/architecture.md) | 模块职责、业务链路与数据模型 |
| [简历解析](docs/resume-parsing.md) | 标准字段、不同写法与人工核对 |
| [外部系统接入](docs/integrations.md) | 招聘软件、企业微信的授权接入方式 |
