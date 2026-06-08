const defaultSettings = {
  theme: "light",
  sidebarTitle: "项目开发进程",
  sidebarSubtitle: "SiCLink Projects",
  dashboardTitle: "SiCLink开发中项目",
  subtitleTemplate: "{fileName}实时数据流大屏",
  developerName: "夏雨奇",
  developerEmail: "yuqi.xia@siclink.com",
  navLabels: { overview: "总览", projects: "项目", tasks: "任务", milestones: "里程碑", docs: "文档" },
  metricLabels: { projects: "项目", tasks: "任务", milestones: "里程碑", docs: "文档", averageProgress: "平均完成度" },
  panelTitles: {
    timeline: "项目时间线",
    timelineSubtitle: "开始、结束、今天位置与里程碑任务",
    projectStatus: "项目状态",
    projectStatusSubtitle: "按状态分布",
    taskStatus: "任务状态",
    taskStatusSubtitle: "执行健康度",
    projectProgress: "项目进度",
    projectProgressSubtitle: "来自项目表任务完成度",
  },
};

const config = {
  appId: process.env.FEISHU_APP_ID || "",
  appSecret: process.env.FEISHU_APP_SECRET || "",
  appToken: process.env.FEISHU_APP_TOKEN || "RlbzbNjmyavVVEslqRscxYrGnjc",
  baseName: process.env.FEISHU_BASE_NAME || "",
  tables: {
    projects: process.env.FEISHU_TABLE_PROJECTS || "tblKQMznyGdhkAZb",
    milestones: process.env.FEISHU_TABLE_MILESTONES || "tblaqTrXm84xF76k",
    tasks: process.env.FEISHU_TABLE_TASKS || "tblQ0mwD943BEYAr",
    docs: process.env.FEISHU_TABLE_DOCS || "tblByAX2Puelr7Gi",
  },
};

let tokenCache = { token: "", expiresAt: 0 };

export { defaultSettings };

export async function getDashboardPayload() {
  assertConfigured();
  const [projects, milestones, tasks, docs, meta] = await Promise.all([
    listRecords(config.tables.projects),
    listRecords(config.tables.milestones),
    listRecords(config.tables.tasks),
    listRecords(config.tables.docs),
    getBitableMeta(),
  ]);

  return {
    ok: true,
    loading: false,
    error: null,
    lastSyncedAt: new Date().toISOString(),
    meta,
    settings: defaultSettings,
    dashboard: buildDashboard({ projects, milestones, tasks, docs }),
  };
}

async function listRecords(tableId) {
  const token = await getTenantToken();
  const allItems = [];
  let pageToken = "";

  do {
    const url = new URL(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${tableId}/records`,
    );
    url.searchParams.set("page_size", "100");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await response.json();
    if (json.code !== 0) throw new Error(`读取表 ${tableId} 失败：${json.msg || json.code}`);

    allItems.push(...(json.data?.items || []));
    pageToken = json.data?.has_more ? json.data?.page_token : "";
  } while (pageToken);

  return allItems.map((item) => ({
    id: item.record_id,
    fields: normalizeFields(item.fields || {}),
  }));
}

async function getTenantToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token;

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const json = await response.json();
  if (json.code !== 0) throw new Error(`获取飞书 token 失败：${json.msg || json.code}`);

  tokenCache = {
    token: json.tenant_access_token,
    expiresAt: Date.now() + Math.max(60, (json.expire || 7200) - 300) * 1000,
  };
  return tokenCache.token;
}

async function getBitableMeta() {
  if (config.baseName) return { fileName: config.baseName };
  try {
    const token = await getTenantToken();
    const response = await fetch(`https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json();
    if (json.code !== 0) return { fileName: "飞书多维表格" };
    return { fileName: json.data?.app?.name || json.data?.name || json.data?.app_name || "飞书多维表格" };
  } catch {
    return { fileName: "飞书多维表格" };
  }
}

function buildDashboard(data) {
  const projectRows = data.projects.map((record) => {
    const fields = record.fields;
    return {
      id: record.id,
      name: valueOf(fields, ["项目名称", "项目", "名称"]) || "未命名项目",
      status: valueOf(fields, ["状态"]) || "未标记",
      owner: valueOf(fields, ["总负责人", "负责人", "项目负责人"]),
      members: valueOf(fields, ["成员", "项目成员"]),
      deadline: dateText(fieldOf(fields, ["项目截止时间", "截止时间", "计划完成时间"])),
      goal: valueOf(fields, ["目标", "项目目标"]),
      summary: valueOf(fields, ["项目情况概述", "概述", "说明"]),
      taskCount: number(fieldOf(fields, ["任务数量", "任务数"])),
      taskProgress: percent(fieldOf(fields, ["任务完成度", "完成度", "进度"])),
      raw: fields,
    };
  });

  const taskRows = data.tasks.map((record) => {
    const fields = record.fields;
    return {
      id: record.id,
      name: valueOf(fields, ["任务", "任务名称", "名称", "标题"]) || "未命名任务",
      status: valueOf(fields, ["状态"]) || "未标记",
      owner: valueOf(fields, ["任务执行人", "负责人", "执行人", "总负责人"]),
      project: valueOf(fields, ["所属项目", "对应项目", "项目"]),
      milestone: valueOf(fields, ["里程碑", "对应里程碑"]),
      deadline: dateText(fieldOf(fields, ["截止时间", "任务截止时间", "计划完成时间"])),
      progress: percent(fieldOf(fields, ["完成度", "任务完成度", "进度"])),
      goal: valueOf(fields, ["目标", "任务目标", "说明"]),
      fieldSummary: summarizeFields(fields),
      raw: fields,
    };
  });

  const milestoneRows = data.milestones.map((record) => {
    const fields = record.fields;
    return {
      id: record.id,
      name: valueOf(fields, ["里程碑名称", "里程碑", "名称"]) || "未命名里程碑",
      status: valueOf(fields, ["状态"]) || "未标记",
      project: valueOf(fields, ["项目", "所属项目", "对应项目"]),
      owner: valueOf(fields, ["总负责人", "负责人"]),
      deadline: dateText(fieldOf(fields, ["计划完成时间", "截止时间"])),
      goal: valueOf(fields, ["目标", "说明"]),
      taskCount: number(fieldOf(fields, ["任务数量", "任务数"])),
      taskProgress: percent(fieldOf(fields, ["任务完成度", "完成度", "进度"])),
      fieldSummary: summarizeFields(fields),
      raw: fields,
    };
  });

  const docRows = data.docs.map((record) => {
    const fields = record.fields;
    return {
      id: record.id,
      name: valueOf(fields, ["文档标题", "文档名称", "名称", "标题"]) || "未命名文档",
      project: valueOf(fields, ["所属项目", "对应项目", "项目"]),
      owner: valueOf(fields, ["提交人", "负责人", "创建人"]),
      date: dateText(fieldOf(fields, ["日期", "提交日期", "创建时间"])),
      content: valueOf(fields, ["进度内容", "内容", "说明"]),
      fieldSummary: summarizeFields(fields),
      raw: fields,
    };
  });

  return {
    metrics: {
      projects: projectRows.length,
      tasks: taskRows.length,
      milestones: milestoneRows.length,
      docs: docRows.length,
      averageProjectProgress: average(projectRows.map((item) => item.taskProgress)),
    },
    projects: projectRows,
    tasks: taskRows,
    milestones: milestoneRows,
    docs: docRows,
    timelineProjects: buildProjectTimelines(projectRows, milestoneRows, taskRows),
    distributions: {
      projectStatus: countBy(projectRows, "status"),
      taskStatus: countBy(taskRows, "status"),
      milestoneStatus: countBy(milestoneRows, "status"),
      owners: countOwners(projectRows),
    },
  };
}

function buildProjectTimelines(projectRows, milestoneRows, taskRows) {
  const todayMs = startOfDay(Date.now());
  return projectRows.map((project) => {
    const projectMilestones = milestoneRows
      .filter((milestone) => belongsToProject(milestone, project))
      .map((milestone) => {
        const milestoneTasks = taskRows.filter((task) => belongsToMilestone(task, milestone));
        const dueAt = rowDateMs(milestone, ["计划完成时间", "截止时间"]);
        return { ...milestone, dueAt, dueDate: dueAt ? formatDate(dueAt) : milestone.deadline, tasks: milestoneTasks };
      })
      .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));

    const projectTasks = taskRows.filter((task) => belongsToProject(task, project));
    const relatedDates = [
      ...projectMilestones.map((item) => item.dueAt),
      ...projectTasks.map((task) => rowDateMs(task, ["截止时间", "任务截止时间", "计划完成时间"])),
    ].filter(Boolean);

    const projectCreatedAt = rowDateMs(project, ["项目创建时间"]);
    const explicitEnd = rowDateMs(project, ["项目截止时间", "截止时间", "计划完成时间"]);
    const startAt = projectCreatedAt || Math.min(...relatedDates, todayMs);
    const endAt = Math.max(explicitEnd || 0, ...relatedDates, todayMs);
    const safeStart = Number.isFinite(startAt) ? startAt : todayMs;
    const safeEnd = Number.isFinite(endAt) && endAt > safeStart ? endAt : addDays(safeStart, 1);
    const span = safeEnd - safeStart;

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      owner: project.owner,
      startAt: safeStart,
      endAt: safeEnd,
      startDate: formatDate(safeStart),
      endDate: formatDate(safeEnd),
      startSource: projectCreatedAt ? "项目创建时间" : "关联任务/里程碑最早日期",
      todayPosition: clamp(Math.round(((todayMs - safeStart) / span) * 100), 0, 100),
      elapsedDays: Math.max(0, Math.floor((Math.min(todayMs, safeEnd) - safeStart) / 86400000)),
      totalDays: Math.max(1, Math.ceil(span / 86400000)),
      milestones: projectMilestones.map((milestone) => ({
        ...milestone,
        position: milestone.dueAt ? clamp(Math.round(((milestone.dueAt - safeStart) / span) * 100), 0, 100) : 0,
      })),
    };
  });
}

function fieldOf(fields, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(fields, name) && fields[name] != null) return fields[name];
  }
  return undefined;
}

function valueOf(fields, names) {
  return text(fieldOf(fields, names));
}

function belongsToProject(row, project) {
  const relation = fieldOf(row.raw || {}, ["所属项目", "对应项目", "项目"]);
  const ids = relationRecordIds(relation);
  if (ids.includes(project.id)) return true;
  const label = text(relation);
  return Boolean(label && project.name && label.includes(project.name));
}

function belongsToMilestone(task, milestone) {
  const relation = fieldOf(task.raw || {}, ["里程碑", "对应里程碑"]);
  const ids = relationRecordIds(relation);
  if (ids.includes(milestone.id)) return true;
  const label = text(relation);
  return Boolean(label && milestone.name && label.includes(milestone.name));
}

function relationRecordIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(relationRecordIds);
  if (typeof value === "object") {
    const direct = Array.isArray(value.record_ids) ? value.record_ids : [];
    return [...direct, ...Object.values(value).flatMap(relationRecordIds)];
  }
  return [];
}

function normalizeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, simplify(value)]));
}

function simplify(value) {
  if (Array.isArray(value)) return value.map(simplify);
  if (value && typeof value === "object") {
    if ("text" in value && Object.keys(value).length <= 2) return value.text;
    if ("name" in value) return value.name;
    if ("link" in value && "text" in value) return value.text || value.link;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, simplify(nested)]));
  }
  return value;
}

function text(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("、");
  if (typeof value === "object") {
    return value.name || value.text || value.value || Object.values(value).map(text).filter(Boolean).join("、");
  }
  return String(value);
}

function summarizeFields(fields) {
  return Object.entries(fields).map(([name, value]) => ({ name, value: displayValue(value) }));
}

function displayValue(value) {
  if (typeof value === "number" && value > 1000000000000) return dateText(value);
  return text(value) || String(value ?? "");
}

function number(value) {
  const parsed = Number(text(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(value) {
  const parsed = number(value);
  if (parsed > 1) return Math.round(parsed);
  if (parsed > 0) return Math.round(parsed * 100);
  return 0;
}

function dateText(value) {
  if (!value) return "";
  if (typeof value === "number") return new Date(value).toLocaleDateString("zh-CN");
  return text(value);
}

function rowDateMs(row, names) {
  const rawValue = fieldOf(row.raw || {}, names);
  return dateMs(rawValue) || dateMs(row.deadline);
}

function dateMs(value) {
  if (!value) return 0;
  if (Array.isArray(value)) return dateMs(value[0]);
  if (typeof value === "number") return startOfDay(value);
  const parsed = Date.parse(text(value).replace(/\//g, "-"));
  return Number.isFinite(parsed) ? startOfDay(parsed) : 0;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(value, days) {
  return value + days * 86400000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("zh-CN");
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const label = row[key] || "未标记";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function countOwners(rows) {
  return rows.reduce((acc, row) => {
    const names = String(row.owner || "未分配").split(/[、,，]/).map((name) => name.trim()).filter(Boolean);
    for (const name of names.length ? names : ["未分配"]) acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
}

function assertConfigured() {
  if (!config.appId || !config.appSecret || !config.appToken) {
    throw new Error("请在 Vercel 环境变量中配置 FEISHU_APP_ID、FEISHU_APP_SECRET 和 FEISHU_APP_TOKEN");
  }
}
