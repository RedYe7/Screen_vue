<script setup>
import { computed, reactive, ref } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { executedPlans, assistantOpen, showToast } = usePlatformState();

const typeOptions = [
  { key: "calendar", label: "历史日历", kinds: ["monitoring-calendar-history"] },
  { key: "plan", label: "工作计划", kinds: ["monitoring-plan-history"] },
  { key: "work", label: "工作", kinds: ["monitoring-work-history"] }
];

const filters = reactive({
  keyword: "",
  refineKeyword: "",
  system: "",
  year: "",
  selectedTypes: {
    calendar: true,
    plan: true,
    work: true
  }
});

const selectedDetailId = ref("");

const historyItems = computed(() =>
  (executedPlans.value || [])
    .filter((item) => typeOptions.some((option) => option.kinds.includes(item.kind)))
    .map((item, index) => normalizeHistoryItem(item, index))
    .sort((left, right) => `${right.sortTime}`.localeCompare(`${left.sortTime}`))
);

const availableSystems = computed(() => [...new Set(historyItems.value.map((item) => item.system).filter(Boolean))]);
const availableYears = computed(() => [...new Set(historyItems.value.map((item) => item.year).filter(Boolean))].sort((a, b) => `${b}`.localeCompare(`${a}`)));

const filteredResults = computed(() => {
  const activeTypes = Object.entries(filters.selectedTypes)
    .filter(([, checked]) => checked)
    .map(([key]) => key);
  const keyword = filters.keyword.trim();
  const refineKeyword = filters.refineKeyword.trim();
  return historyItems.value.filter((item) => {
    if (!activeTypes.includes(item.typeKey)) return false;
    if (filters.system && item.system !== filters.system) return false;
    if (filters.year && item.year !== filters.year) return false;
    if (keyword && !item.searchBlob.includes(keyword)) return false;
    if (refineKeyword && !item.searchBlob.includes(refineKeyword)) return false;
    return true;
  });
});

const historyOverview = computed(() => ({
  total: historyItems.value.length,
  calendar: historyItems.value.filter((item) => item.typeKey === "calendar").length,
  plan: historyItems.value.filter((item) => item.typeKey === "plan").length,
  work: historyItems.value.filter((item) => item.typeKey === "work").length
}));

const selectedDetail = computed(() => historyItems.value.find((item) => item.id === selectedDetailId.value) || null);

const relatedItems = computed(() => {
  if (!selectedDetail.value) return [];
  return historyItems.value
    .filter((item) => item.id !== selectedDetail.value.id)
    .filter((item) => item.system === selectedDetail.value.system || item.planTitle === selectedDetail.value.title || item.sourcePlanId === selectedDetail.value.sourcePlanId)
    .slice(0, 6);
});

function normalizeHistoryItem(item, index) {
  const typeKey = item.kind === "monitoring-calendar-history" ? "calendar" : item.kind === "monitoring-plan-history" ? "plan" : "work";
  const typeLabel = typeOptions.find((option) => option.key === typeKey)?.label || "历史记录";
  const start = item.startTime ? item.startTime.slice(0, 10) : item.date || "";
  const end = item.endTime ? item.endTime.slice(0, 10) : item.date || "";
  const year = start ? start.slice(0, 4) : "";
  const personnelText = Array.isArray(item.personnel) ? item.personnel.join("、") : item.owner || "";
  const timeText = item.dateRange || [start, end].filter(Boolean).join(" - ");
  const taskCode = item.taskCode || `HIS-${String(index + 1).padStart(4, "0")}`;
  const sourceLabel = item.flowTitle || item.type || typeLabel;
  const searchBlob = [
    item.title,
    item.planTitle,
    item.owner,
    personnelText,
    item.system,
    item.gasLabel,
    item.type,
    item.flowTitle,
    item.date,
    item.dateRange,
    taskCode,
    ...(item.tags || [])
  ]
    .filter(Boolean)
    .join(" ");
  return { ...item, typeKey, typeLabel, year, taskCode, personnelText, timeText, sourceLabel, sortTime: item.archivedAt || item.endTime || item.startTime || item.date || "", searchBlob };
}

function executeSearch() {
  if (!Object.values(filters.selectedTypes).some(Boolean)) {
    showToast("请至少勾选一种检索类型");
    return;
  }
  showToast(`检索完成，共找到 ${filteredResults.value.length} 条记录`);
}

function resetSearch() {
  filters.keyword = "";
  filters.refineKeyword = "";
  filters.system = "";
  filters.year = "";
  filters.selectedTypes = { calendar: true, plan: true, work: true };
  showToast("已重置检索条件");
}

function openHistoryDetail(item) {
  selectedDetailId.value = item.id;
}

function closeHistoryDetail() {
  selectedDetailId.value = "";
}
</script>

<template>
  <div class="history-query-page">
    <section class="history-query-hero">
      <div class="history-query-brand">
        <div class="history-query-brand-mark">历史库</div>
        <h1>流程智能查询</h1>
      </div>

      <div class="history-search-panel">
        <div class="history-search-tabs">
          <button class="history-tab active" type="button">检索</button>
          <button class="history-tab" type="button" @click="assistantOpen = true">智能助手</button>
        </div>

        <div class="history-search-box">
          <div class="history-search-type">主题</div>
          <input v-model="filters.keyword" class="history-search-input" placeholder="输入日期、工作、计划、人员、任务代号等关键词" @keyup.enter="executeSearch">
          <button class="history-search-button" type="button" @click="executeSearch">检索</button>
        </div>

        <div class="history-search-box refine">
          <div class="history-search-type">结果内</div>
          <input v-model="filters.refineKeyword" class="history-search-input" placeholder="对当前检索结果进一步检索">
        </div>

        <div class="history-type-row">
          <label v-for="option in typeOptions" :key="option.key" class="history-check" :class="{ active: filters.selectedTypes[option.key] }">
            <input v-model="filters.selectedTypes[option.key]" type="checkbox">
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
    </section>

    <section class="panel history-library-panel">
      <div class="panel-head">
        <div>
          <h3>历史库</h3>
          <div class="muted">汇总历史日历、历史工作计划和历史工作，支持查询、回溯和流程对比。</div>
        </div>
        <span class="chip active">历史记录 {{ historyOverview.total }} 条</span>
      </div>
      <div class="history-overview-grid">
        <div class="history-overview-card"><strong>{{ historyOverview.calendar }}</strong><span>历史日历</span></div>
        <div class="history-overview-card"><strong>{{ historyOverview.plan }}</strong><span>工作计划</span></div>
        <div class="history-overview-card"><strong>{{ historyOverview.work }}</strong><span>工作</span></div>
      </div>
    </section>

    <section class="history-query-layout">
      <aside class="history-filter-rail">
        <div class="history-filter-card">
          <div class="history-filter-title">气体系统</div>
          <select v-model="filters.system">
            <option value="">全部系统</option>
            <option v-for="item in availableSystems" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div class="history-filter-card">
          <div class="history-filter-title">年度</div>
          <select v-model="filters.year">
            <option value="">全部年度</option>
            <option v-for="item in availableYears" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <div class="history-filter-actions">
          <button class="button" type="button" @click="executeSearch">执行检索</button>
          <button class="ghost" type="button" @click="resetSearch">重置条件</button>
        </div>
      </aside>

      <div class="history-result-panel">
        <div class="history-result-toolbar">
          <div class="history-result-meta"><strong>检索结果</strong><span>共找到 {{ filteredResults.length }} 条</span></div>
        </div>
        <div class="history-result-table">
          <div class="history-result-head">
            <span>类型</span><span>题名</span><span>人员 / 责任人</span><span>来源</span><span>时间</span><span>任务代号</span><span>操作</span>
          </div>
          <div v-if="filteredResults.length" class="history-result-body">
            <div v-for="item in filteredResults" :key="item.id" class="history-result-row">
              <div class="history-cell type"><span class="chip" :class="{ active: item.typeKey === 'calendar' }">{{ item.typeLabel }}</span></div>
              <div class="history-cell title"><strong>{{ item.title }}</strong><small>{{ item.system }} · {{ item.status }} · 风险 {{ item.risk || "低" }}</small></div>
              <div class="history-cell">{{ item.personnelText || item.owner }}</div>
              <div class="history-cell">{{ item.sourceLabel }}</div>
              <div class="history-cell">{{ item.timeText }}</div>
              <div class="history-cell">{{ item.taskCode }}</div>
              <div class="history-cell action"><button class="ghost small" type="button" @click="openHistoryDetail(item)">查看</button></div>
            </div>
          </div>
          <div v-else class="history-empty-state">
            <strong>未检索到结果</strong>
            <p>请调整关键词、历史类型或筛选条件后重新检索。</p>
          </div>
        </div>
      </div>
    </section>

    <div class="modal-overlay" :class="{ open: Boolean(selectedDetail) }" @click.self="closeHistoryDetail">
      <div class="modal-card monitoring-plan-detail-modal">
        <template v-if="selectedDetail">
          <div class="panel-head">
            <div>
              <h3>{{ selectedDetail.title }}</h3>
              <div class="muted">{{ selectedDetail.typeLabel }} · {{ selectedDetail.system }} · {{ selectedDetail.timeText }}</div>
            </div>
            <span class="chip active">{{ selectedDetail.status || "已归档" }}</span>
          </div>
          <div class="plan-detail-meta-grid">
            <div class="summary-line"><span>计划安排</span><strong>{{ selectedDetail.dateRange || selectedDetail.timeText }}</strong></div>
            <div class="summary-line"><span>执行记录</span><strong>{{ selectedDetail.archivedAt || selectedDetail.sortTime || "已记录" }}</strong></div>
            <div class="summary-line"><span>质量证据</span><strong>{{ selectedDetail.dataStatus || "过程记录、签字表、电子报表" }}</strong></div>
            <div class="summary-line"><span>完成情况</span><strong>{{ selectedDetail.completionMeta?.progress ?? selectedDetail.progress ?? 100 }}%</strong></div>
          </div>
          <section class="panel" style="margin-top: 16px;">
            <h3>工作脉络与关联数据</h3>
            <div class="detail-list">
              <div class="notice-card"><span>流程来源：{{ selectedDetail.sourceLabel }}</span><span class="accent">来源</span></div>
              <div class="notice-card"><span>责任人员：{{ selectedDetail.personnelText || selectedDetail.owner || "系统记录" }}</span><span class="accent">人员</span></div>
              <div class="notice-card"><span>评估数据：完成度、风险、资源占用和质量证据已归集。</span><span class="accent">评估</span></div>
            </div>
          </section>
          <section class="panel" style="margin-top: 16px;">
            <h3>关联记录</h3>
            <div v-if="relatedItems.length" class="detail-list">
              <div v-for="item in relatedItems" :key="item.id" class="notice-card">
                <span>{{ item.typeLabel }}：{{ item.title }}</span>
                <span class="accent">{{ item.timeText }}</span>
              </div>
            </div>
            <div v-else class="notice-card"><span>暂无关联记录。</span><span class="warning">无关联</span></div>
          </section>
          <div class="button-row" style="margin-top: 18px;">
            <button class="ghost" type="button" @click="closeHistoryDetail">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
