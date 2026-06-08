# SiCLink PM Dashboard

连接飞书多维表格的项目管理实时看板，包含：

- 项目、任务、里程碑、文档总览
- 项目时间线、里程碑任务详情
- 明色/深色模式
- 可维护后台 `/admin.html`
- 飞书数据定时同步和 SSE 实时推送

## 数据表

| 业务表 | table_id |
| --- | --- |
| 项目 |          |
| 里程碑 |  |
| 任务 |          |
| 项目文档 |  |

## 本地配置

复制 `.env.example` 为 `.env`，填入飞书应用凭证：

```ini
FEISHU_APP_ID=
FEISHU_APP_SECRET=
FEISHU_APP_TOKEN=
FEISHU_BASE_NAME=
FEISHU_TABLE_PROJECTS=
FEISHU_TABLE_MILESTONES=
FEISHU_TABLE_TASKS=
FEISHU_TABLE_DOCS=
PORT=3000
SYNC_INTERVAL_SECONDS=60
```

不要提交 `.env`。飞书 `APP_SECRET` 只能放在本地或部署平台的环境变量里。

## 运行

```powershell
npm.cmd run dev
```

看板：

```text
http://localhost:3000
```

维护后台：

```text
http://localhost:3000/admin.html
```

## GitHub 与在线访问

这个项目包含 Node 后端，需要服务端环境读取飞书 API。GitHub 仓库可以托管代码，但 GitHub Pages 不能安全运行该后端，也不能保存飞书密钥。

如果希望通过公网 URL 访问实时看板，推荐：

1. 将代码推送到 GitHub。
2. 在 Render、Railway、Fly.io、Vercel Serverless/Node 或自有服务器部署 Node 服务。
3. 在部署平台配置 `.env` 中的环境变量。
4. 使用部署平台提供的 HTTPS 地址访问看板。

如果只使用 GitHub Pages，只能展示静态页面，无法直接完成飞书实时同步。
