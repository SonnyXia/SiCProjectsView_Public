const state = {
  dashboard: null,
  view: "overview",
  timelineProjectIds: new Set(),
  selectedMilestoneId: null,
  timelineZooms: new Map(),
  sidebarCollapsed: false,
};

const timelineZoom = {
  min: 0.75,
  max: 4,
  step: 0.25,
  baseWidth: 920,
};

const viewTitles = {
  overview: "SiCLink开发中项目",
  projects: "项目列表",
  tasks: "任务明细",
  milestones: "里程碑计划",
  docs: "项目文档",
};

const el = (id) => document.getElementById(id);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

el("refreshBtn").addEventListener("click", async () => {
  setSync("pending", "正在同步", "手动刷新中");
  await fetch("/api/sync", { method: "POST" });
});

el("sidebarToggle").addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  el("sidebarToggle").title = state.sidebarCollapsed ? "显示目录" : "隐藏目录";
});

connectEvents();
loadDashboard();

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${view}View`);
  });
  el("viewTitle").textContent = viewTitles[view];
  render();
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    const payload = await response.json();
    applyPayload(payload);
  } catch (error) {
    showAlert(error.message);
  }
}

function connectEvents() {
  const source = new EventSource("/api/events");
  source.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "sync-started") {
      setSync("pending", "正在同步", "飞书数据读取中");
      return;
    }
    applyPayload(message.payload);
  };
  source.onerror = () => {
    setSync("error", "连接中断", "等待自动重连");
  };
}

function applyPayload(payload) {
  if (!payload) return;
  state.dashboard = payload.dashboard;
  const fileName = payload.meta?.fileName || "飞书多维表格";
  el("dashboardSubtitle").textContent = `${fileName}实时数据流大屏`;
  syncTimelineSelection();

  if (payload.error) {
    showAlert(payload.error);
    setSync("error", "同步失败", payload.error);
  } else if (payload.lastSyncedAt) {
    hideAlert();
    setSync("ok", "已同步", formatDateTime(payload.lastSyncedAt));
  } else {
    setSync("pending", "等待同步", "后端正在启动");
  }
  render();
}

function render() {
  const dashboard = state.dashboard;
  if (!dashboard) return;

  el("metricProjects").textContent = dashboard.metrics.projects;
  el("metricTasks").textContent = dashboard.metrics.tasks;
  el("metricMilestones").textContent = dashboard.metrics.milestones;
  el("metricDocs").textContent = dashboard.metrics.docs;
  el("metricProgress").textContent = `${dashboard.metrics.averageProjectProgress}%`;

  renderBarChart("projectStatusChart", dashboard.distributions.projectStatus);
  renderBarChart("taskStatusChart", dashboard.distributions.taskStatus);
  renderProjectProgress(dashboard.projects);
  renderTimelineFilter(dashboard.timelineProjects || []);
  renderProjectTimelines(dashboard.timelineProjects || []);
  renderProjects(dashboard.projects);
  renderTasks(dashboard.tasks);
  renderMilestones(dashboard.milestones);
  renderDocs(dashboard.docs);
}

function syncTimelineSelection() {
  const projects = state.dashboard?.timelineProjects || [];
  const availableIds = new Set(projects.map((project) => project.id));
  state.timelineProjectIds = new Set([...state.timelineProjectIds].filter((id) => availableIds.has(id)));
  state.timelineZooms = new Map([...state.timelineZooms].filter(([id]) => availableIds.has(id)));
  if (!state.timelineProjectIds.size) {
    projects.forEach((project) => state.timelineProjectIds.add(project.id));
  }
}

function renderTimelineFilter(projects) {
  const target = el("timelineProjectFilter");
  if (!projects.length) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = projects.map((project) => `
    <label class="filter-chip">
      <input type="checkbox" value="${escapeHtml(project.id)}" ${state.timelineProjectIds.has(project.id) ? "checked" : ""} />
      <span>${escapeHtml(project.name)}</span>
    </label>
  `).join("");

  target.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        state.timelineProjectIds.add(input.value);
      } else {
        state.timelineProjectIds.delete(input.value);
      }
      renderProjectTimelines(state.dashboard.timelineProjects || []);
    });
  });
}

function renderProjectTimelines(projects) {
  const target = el("projectTimelineList");
  const selected = projects.filter((project) => state.timelineProjectIds.has(project.id));
  if (!selected.length) {
    target.innerHTML = empty("请选择至少一个项目");
    return;
  }

  target.innerHTML = selected.map((project) => renderProjectTimeline(project)).join("");

  target.querySelectorAll(".milestone-pin").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.milestoneId;
      state.selectedMilestoneId = state.selectedMilestoneId === id ? null : id;
      renderProjectTimelines(state.dashboard.timelineProjects || []);
    });
  });

  target.querySelectorAll("[data-zoom-action]").forEach((control) => {
    control.addEventListener("click", () => {
      const projectId = control.dataset.projectId;
      const currentZoom = getTimelineZoom(projectId);
      const action = control.dataset.zoomAction;
      if (action === "fit") {
        setTimelineZoom(projectId, 1);
      } else {
        const direction = action === "in" ? timelineZoom.step : -timelineZoom.step;
        setTimelineZoom(projectId, currentZoom + direction);
      }
    });
  });

  target.querySelectorAll("[data-zoom-range]").forEach((range) => {
    range.addEventListener("input", () => setTimelineZoom(range.dataset.projectId, Number(range.value)));
  });

  setupTimelineCanvases(target);
}

function renderProjectTimeline(project) {
  const selectedMilestone = project.milestones.find((milestone) => milestone.id === state.selectedMilestoneId);
  const zoom = getTimelineZoom(project.id);
  const ticks = buildTimelineTicks(project);

  return `
    <article class="project-timeline-card" data-project-id="${escapeHtml(project.id)}">
      <div class="timeline-title-row">
        <div>
          <h4>${escapeHtml(project.name)}</h4>
          <p>${escapeHtml(project.owner || "未分配")} · ${escapeHtml(project.status || "未标记")}</p>
        </div>
        <div class="timeline-date-summary">
          <span>${escapeHtml(project.startDate)}</span>
          <strong>${project.elapsedDays}/${project.totalDays} 天</strong>
          <span>${escapeHtml(project.endDate)}</span>
          <small>起点：${escapeHtml(project.startSource || "项目创建时间")}</small>
        </div>
        <div class="zoom-control timeline-card-tools" aria-label="时间线缩放">
          <button type="button" data-zoom-action="out" data-project-id="${escapeHtml(project.id)}" title="缩小">-</button>
          <input data-zoom-range data-project-id="${escapeHtml(project.id)}" type="range" min="${timelineZoom.min}" max="${timelineZoom.max}" step="${timelineZoom.step}" value="${zoom}" />
          <button type="button" data-zoom-action="in" data-project-id="${escapeHtml(project.id)}" title="放大">+</button>
          <strong>${Math.round(zoom * 100)}%</strong>
          <button type="button" data-zoom-action="fit" data-project-id="${escapeHtml(project.id)}">适应宽度</button>
        </div>
      </div>
      <div class="timeline-canvas" data-draggable-timeline>
        <div class="timeline-scale">
          <span>${escapeHtml(project.startDate)}</span>
          <span>${escapeHtml(project.endDate)}</span>
        </div>
        <div class="timeline-content" style="--timeline-zoom:${zoom}">
          <div class="timeline-track-wrap">
            <div class="timeline-ticks">
              ${ticks.map((tick) => `
                <span class="timeline-tick" style="left:${tick.position}%">
                  <i></i>
                  <small>${escapeHtml(tick.label)}</small>
                </span>
              `).join("")}
            </div>
            <div class="timeline-track">
              <div class="timeline-elapsed" style="width:${project.todayPosition}%"></div>
              <div class="today-marker" style="left:${project.todayPosition}%"><span>今天</span></div>
              ${project.milestones.map((milestone) => `
                <button
                  class="milestone-pin ${state.selectedMilestoneId === milestone.id ? "active" : ""}"
                  style="left:${milestone.position}%"
                  data-milestone-id="${escapeHtml(milestone.id)}"
                  title="${escapeHtml(milestone.name)}"
                >
                  <span></span>
                </button>
              `).join("")}
            </div>
          </div>
          <div class="milestone-lane">
            ${project.milestones.map((milestone, index) => `
              <button
                class="milestone-card milestone-pin ${state.selectedMilestoneId === milestone.id ? "active" : ""}"
                style="left:${milestone.position}%; top:${(index % 3) * 64}px"
                data-milestone-id="${escapeHtml(milestone.id)}"
              >
                <strong>${escapeHtml(milestone.name)}</strong>
                <small>${escapeHtml(milestone.dueDate || "未设置")} · ${milestone.tasks?.length || 0} 项任务</small>
              </button>
            `).join("") || '<span class="meta">暂无里程碑</span>'}
          </div>
        </div>
      </div>
      ${selectedMilestone ? renderMilestoneTaskPanel(selectedMilestone) : ""}
    </article>
  `;
}

function renderMilestoneTaskPanel(milestone) {
  const tasks = milestone.tasks || [];
  return `
    <section class="milestone-task-panel">
      <div class="panel-head compact">
        <div>
          <h3>${escapeHtml(milestone.name)}</h3>
          <span>${escapeHtml(milestone.dueDate || "未设置日期")} · ${escapeHtml(milestone.status || "未标记")}</span>
        </div>
        <strong>${milestone.taskProgress || 0}%</strong>
      </div>
      ${tasks.length ? `
        <div class="timeline-task-list">
          ${tasks.map((task) => `
            <article class="timeline-task-item">
              <div>
                <strong>${escapeHtml(task.name)}</strong>
                <span>${escapeHtml(task.owner || "未分配")} · ${escapeHtml(task.status || "未标记")}</span>
              </div>
              <div class="mini-progress">
                <div class="progress-track"><div class="progress-fill" style="width:${task.progress || 0}%"></div></div>
                <small>${task.progress || 0}%</small>
              </div>
            </article>
          `).join("")}
        </div>
      ` : empty("这个里程碑下暂无任务")}
    </section>
  `;
}

function getTimelineZoom(projectId) {
  return state.timelineZooms.get(projectId) || 1;
}

function setTimelineZoom(projectId, value) {
  state.timelineZooms.set(projectId, clampNumber(value, timelineZoom.min, timelineZoom.max));
  renderProjectTimelines(state.dashboard?.timelineProjects || []);
}

function setupTimelineCanvases(root) {
  root.querySelectorAll("[data-draggable-timeline]").forEach((canvas) => {
    canvas.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? -timelineZoom.step : timelineZoom.step;
      const card = canvas.closest(".project-timeline-card");
      const projectId = card?.dataset.projectId;
      if (projectId) setTimelineZoom(projectId, getTimelineZoom(projectId) + direction);
    }, { passive: false });

    let dragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    canvas.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input, a, details, summary")) return;
      dragging = true;
      startX = event.clientX;
      startScrollLeft = canvas.scrollLeft;
      canvas.classList.add("dragging");
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      canvas.scrollLeft = startScrollLeft - (event.clientX - startX);
    });

    canvas.addEventListener("pointerup", () => {
      dragging = false;
      canvas.classList.remove("dragging");
    });

    canvas.addEventListener("pointercancel", () => {
      dragging = false;
      canvas.classList.remove("dragging");
    });
  });
}

function buildTimelineTicks(project) {
  const start = Number(project.startAt);
  const end = Number(project.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];

  const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
  const intervalDays = tickIntervalDays(totalDays, getTimelineZoom(project.id));
  const ticks = [];
  for (let offset = 0; offset <= totalDays; offset += intervalDays) {
    const tickTime = start + offset * 86400000;
    ticks.push({
      position: clampNumber(((tickTime - start) / (end - start)) * 100, 0, 100),
      label: formatTickLabel(tickTime, intervalDays),
    });
  }
  return ticks;
}

function tickIntervalDays(totalDays, zoom) {
  if (zoom >= 3) return totalDays > 120 ? 14 : 7;
  if (zoom >= 2) return totalDays > 180 ? 30 : 14;
  if (zoom >= 1.25) return totalDays > 240 ? 45 : 30;
  return totalDays > 240 ? 90 : 60;
}

function formatTickLabel(value, intervalDays) {
  const date = new Date(value);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (intervalDays <= 14) return `${month}/${day}`;
  return `${date.getFullYear()}/${month}`;
}

function renderBarChart(targetId, distribution) {
  const target = el(targetId);
  const entries = Object.entries(distribution || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    target.innerHTML = empty("暂无数据");
    return;
  }

  const max = Math.max(...entries.map(([, value]) => value));
  target.innerHTML = entries.map(([label, value]) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (value / max) * 100)}%"></div></div>
      <strong>${value}</strong>
    </div>
  `).join("");
}

function renderProjectProgress(projects) {
  const target = el("projectProgressList");
  if (!projects.length) {
    target.innerHTML = empty("暂无项目");
    return;
  }

  target.innerHTML = [...projects]
    .sort((a, b) => b.taskProgress - a.taskProgress)
    .map((project) => `
      <div class="progress-item">
        <strong>${escapeHtml(project.name)}</strong>
        <div class="progress-track"><div class="progress-fill" style="width:${project.taskProgress}%"></div></div>
        <span>${project.taskProgress}%</span>
      </div>
    `).join("");
}

function renderProjects(projects) {
  const target = el("projectsList");
  if (!projects.length) {
    target.innerHTML = empty("没有匹配的项目");
    return;
  }

  target.innerHTML = projects.map((project) => `
    <article class="project-card">
      <div>
        <span class="badge">${escapeHtml(project.status)}</span>
        <h3>${escapeHtml(project.name)}</h3>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${project.taskProgress}%"></div></div>
      <div class="meta">
        <div>负责人：${escapeHtml(project.owner || "未分配")}</div>
        <div>截止：${escapeHtml(project.deadline || "未设置")}</div>
        <div>任务：${project.taskCount || 0} 个，完成度 ${project.taskProgress}%</div>
      </div>
      <p>${escapeHtml(project.summary || project.goal || "暂无概述")}</p>
    </article>
  `).join("");
}

function renderTasks(tasks) {
  const target = el("tasksTable");
  if (!tasks.length) {
    target.innerHTML = empty("没有匹配的任务");
    return;
  }

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>任务</th>
          <th>状态</th>
          <th>负责人</th>
          <th>项目</th>
          <th>里程碑</th>
          <th>目标</th>
          <th>截止时间</th>
          <th>完成度</th>
          <th>全部字段</th>
        </tr>
      </thead>
      <tbody>
        ${tasks.map((task) => `
          <tr>
            <td><strong>${escapeHtml(task.name)}</strong></td>
            <td><span class="badge">${escapeHtml(task.status)}</span></td>
            <td>${escapeHtml(task.owner || "未分配")}</td>
            <td>${escapeHtml(task.project || "-")}</td>
            <td>${escapeHtml(task.milestone || "-")}</td>
            <td>${escapeHtml(task.goal || "-")}</td>
            <td>${escapeHtml(task.deadline || "-")}</td>
            <td>${task.progress}%</td>
            <td>${renderFieldDetails(task.fieldSummary)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderMilestones(milestones) {
  const target = el("milestonesList");
  if (!milestones.length) {
    target.innerHTML = empty("没有匹配的里程碑");
    return;
  }

  target.innerHTML = milestones.map((item) => `
    <article class="timeline-item">
      <time>${escapeHtml(item.deadline || "未设置")}</time>
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="meta">${escapeHtml(item.project || "-")} · ${escapeHtml(item.owner || "未分配")} · ${item.taskProgress || 0}%</div>
        ${renderFieldDetails(item.fieldSummary)}
      </div>
      <span class="badge">${escapeHtml(item.status)}</span>
    </article>
  `).join("");
}

function renderDocs(docs) {
  const target = el("docsList");
  if (!docs.length) {
    target.innerHTML = empty("没有匹配的文档");
    return;
  }

  target.innerHTML = docs.map((doc) => `
    <article class="doc-item">
      <div>
        <strong>${escapeHtml(doc.name)}</strong>
        <div class="meta">${escapeHtml(doc.project || "-")} · ${escapeHtml(doc.date || "未设置日期")}</div>
        <p>${escapeHtml(doc.content || "")}</p>
        ${renderFieldDetails(doc.fieldSummary)}
      </div>
      <span>${escapeHtml(doc.owner || "未分配")}</span>
    </article>
  `).join("");
}

function renderFieldDetails(fields = []) {
  if (!fields.length) return "-";
  return `
    <details class="field-details">
      <summary>查看</summary>
      <dl>
        ${fields.map((field) => `
          <dt>${escapeHtml(field.name)}</dt>
          <dd>${escapeHtml(field.value || "-")}</dd>
        `).join("")}
      </dl>
    </details>
  `;
}

function setSync(status, text, time) {
  const dot = el("syncState");
  dot.className = `status-dot ${status}`;
  el("syncText").textContent = text;
  el("syncTime").textContent = time;
}

function showAlert(message) {
  const alert = el("alert");
  alert.textContent = message;
  alert.classList.remove("hidden");
}

function hideAlert() {
  el("alert").classList.add("hidden");
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
