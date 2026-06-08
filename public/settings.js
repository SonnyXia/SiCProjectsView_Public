const fallbackSettings = {
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

let currentSettings = fallbackSettings;
let currentMeta = { fileName: "飞书多维表格" };

const $ = (selector) => document.querySelector(selector);
const byId = (id) => document.getElementById(id);

initSettings();

async function initSettings() {
  await Promise.all([loadSettings(), loadMeta()]);
  ensureThemeButton();
  applySettings();
  wireReapplyOnNavigation();
  subscribeSettings();
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  const payload = await response.json();
  currentSettings = merge(fallbackSettings, payload.settings || {});
}

async function loadMeta() {
  try {
    const response = await fetch("/api/dashboard");
    const payload = await response.json();
    currentMeta = payload.meta || currentMeta;
    if (payload.settings) currentSettings = merge(fallbackSettings, payload.settings);
  } catch {
    currentMeta = { fileName: "飞书多维表格" };
  }
}

function subscribeSettings() {
  const source = new EventSource("/api/events");
  source.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const payload = message.payload || {};
    if (payload.meta) currentMeta = payload.meta;
    if (payload.settings) currentSettings = merge(fallbackSettings, payload.settings);
    applySettings();
  };
}

function ensureThemeButton() {
  byId("themeToggle")?.addEventListener("click", async () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    currentSettings = merge(currentSettings, { theme: nextTheme });
    applySettings();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: currentSettings }),
    });
  });
}

function wireReapplyOnNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setTimeout(applySettings, 0));
  });
}

function applySettings() {
  document.body.dataset.theme = currentSettings.theme === "dark" ? "dark" : "light";
  if (byId("themeToggle")) byId("themeToggle").textContent = currentSettings.theme === "dark" ? "☀" : "◐";

  $(".brand h1").textContent = currentSettings.sidebarTitle;
  $(".brand p").textContent = currentSettings.sidebarSubtitle;
  byId("dashboardSubtitle").textContent = currentSettings.subtitleTemplate.replaceAll(
    "{fileName}",
    currentMeta.fileName || "飞书多维表格",
  );

  const activeView = document.querySelector(".nav-item.active")?.dataset.view || "overview";
  if (activeView === "overview") byId("viewTitle").textContent = currentSettings.dashboardTitle;

  setText('[data-view="overview"]', currentSettings.navLabels.overview);
  setText('[data-view="projects"]', currentSettings.navLabels.projects);
  setText('[data-view="tasks"]', currentSettings.navLabels.tasks);
  setText('[data-view="milestones"]', currentSettings.navLabels.milestones);
  setText('[data-view="docs"]', currentSettings.navLabels.docs);

  setText("#metricProjectsLabel", currentSettings.metricLabels.projects);
  setText("#metricTasksLabel", currentSettings.metricLabels.tasks);
  setText("#metricMilestonesLabel", currentSettings.metricLabels.milestones);
  setText("#metricDocsLabel", currentSettings.metricLabels.docs);
  setText("#metricProgressLabel", currentSettings.metricLabels.averageProgress);

  setText("#timelinePanelTitle", currentSettings.panelTitles.timeline);
  setText("#timelinePanelSubtitle", currentSettings.panelTitles.timelineSubtitle);
  setText("#projectStatusTitle", currentSettings.panelTitles.projectStatus);
  setText("#projectStatusSubtitle", currentSettings.panelTitles.projectStatusSubtitle);
  setText("#taskStatusTitle", currentSettings.panelTitles.taskStatus);
  setText("#taskStatusSubtitle", currentSettings.panelTitles.taskStatusSubtitle);
  setText("#projectProgressTitle", currentSettings.panelTitles.projectProgress);
  setText("#projectProgressSubtitle", currentSettings.panelTitles.projectProgressSubtitle);

  $(".developer-credit span").textContent = `开发：${currentSettings.developerName}`;
  $(".developer-credit a").textContent = currentSettings.developerEmail;
  $(".developer-credit a").href = `mailto:${currentSettings.developerEmail}`;
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function merge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    output[key] =
      value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
  }
  return output;
}
