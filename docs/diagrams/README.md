# 系统架构图

- [交互版 HTML](hr-assistant.html)：下载后用浏览器打开，可查看节点、关系和固定版本的源码引用。
- [可编辑 JSON](hr-assistant.architecture.json)：Archify 架构描述。
- [静态预览](../images/architecture.png)：项目首页使用的完整架构图。

图中展示 HR 的操作入口、浏览器工作台、Next.js 服务端模块、PostgreSQL 和用户邮件客户端。服务端模块属于同一应用进程。原文依据、字段标准和外部适配器的说明放在详情卡中；默认关闭的招聘软件与企业微信接口没有活跃数据流。

源码引用固定到 `d84bf614c5dc1263299556161560543e09e15ffe`，对应图中业务行为的代码版本。更新业务实现后，应同步更新 JSON 中的职责、连接、引用范围和版本，再重新生成图。

## 重新生成

本图由 [Archify 3.2.0](https://github.com/tt-a1i/archify) 生成。取得 Archify 工具包后，在本项目根目录执行以下命令，并将第一行路径换成实际工具位置：

```bash
node /path/to/archify/bin/archify.mjs finalize architecture \
  docs/diagrams/hr-assistant.architecture.json \
  docs/diagrams/hr-assistant.html \
  --repo-root . --quality showcase
```

从交互页面的导出菜单下载完整 PNG，保存为 `docs/images/architecture.png`。交付检查文件保留在本地，静态图与可编辑源随仓库维护。

生成的 HTML 包含 Archify 运行时与字体。相关版权、许可和第三方声明保留在 [licenses](licenses/) 目录。
