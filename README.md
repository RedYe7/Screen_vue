# Screen_vue

基于 `Vue 3 + Vue Router + Vite` 重建的流程智能管控平台原型。

## 启动

```bash
npm install
npm run dev
```

## 结构

- `src/views/HomeView.vue` 首页总览
- `src/views/PlanningHubView.vue` 流程自主规划总入口
- `src/views/WorkflowDetailView.vue` 6 个专项流程的统一详情页
- `src/views/MonitoringView.vue` 流程动态监控
- `src/views/EvaluationView.vue` 流程智能评估
- `src/views/QueryView.vue` 流程智能查询
- `src/views/RulesView.vue` 工作规则管理

## 已迁移能力

- 规则库、人员库、模板库联动
- 专项流程拖拽编排、模板生成、手动调整
- 特燃特气专项测算、电子审签、专项计划生成
- 已执行计划写入查询中心
- 跨计划工作/人员/设备冲突检测与自动优化
