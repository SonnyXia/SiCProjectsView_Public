const defaults = {
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

const form = document.getElementById("settingsForm");
const saveState = document.getElementById("saveState");

load();

document.getElementById("saveBtn").addEventListener("click", save);
document.getElementById("resetBtn").addEventListener("click", () => fillForm(defaults));
form.addEventListener("input", () => {
  saveState.textContent = "有未保存修改";
  saveState.dataset.state = "dirty";
});

async function load() {
  const response = await fetch("/api/settings");
  const payload = await response.json();
  fillForm(merge(defaults, payload.settings || {}));
  saveState.textContent = "已载入配置";
  saveState.dataset.state = "clean";
}

async function save() {
  const settings = readForm();
  saveState.textContent = "保存中...";
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings }),
  });
  const payload = await response.json();
  if (!payload.ok) {
    saveState.textContent = "保存失败";
    saveState.dataset.state = "error";
    return;
  }
  fillForm(payload.settings);
  saveState.textContent = "已保存";
  saveState.dataset.state = "clean";
}

function fillForm(settings) {
  document.body.dataset.theme = settings.theme === "dark" ? "dark" : "light";
  for (const field of form.elements) {
    if (!field.name) continue;
    field.value = getPath(settings, field.name) ?? "";
  }
}

function readForm() {
  const settings = structuredClone(defaults);
  for (const field of form.elements) {
    if (!field.name) continue;
    setPath(settings, field.name, field.value);
  }
  return settings;
}

function getPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function merge(base, override) {
  const output = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    output[key] =
      value && typeof value === "object" && !Array.isArray(value) ? merge(base[key] || {}, value) : value;
  }
  return output;
}
