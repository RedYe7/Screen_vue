<script setup>
import { useRouter } from "vue-router";

const router = useRouter();

const modules = [
  { title: "流程自主规划", desc: "统一总入口，支持 6 类专项流程规划与拖拽编排。", to: "/planning" },
  { title: "日程规划", desc: "跟踪工作完成情况、冲突预警和流程动态优化。", to: "/monitoring" },
  { title: "流程智能评估", desc: "展示态势、进度、风险和历史流程比对。", to: "/evaluation" },
  { title: "流程智能查询", desc: "支持历史流程、执行计划和多维条件检索。", to: "/query" },
  { title: "工作规则管理", desc: "维护工作项目、约束、人员、算法和流程模板。", to: "/rules" }
];
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>流程智能管控平台</h1>
        <div class="muted">Vue 重构版首页，总览与现有静态原型保持一致。</div>
      </div>
    </div>

    <section class="hero">
      <div>
        <h2>统一流程规划、执行、监控、评估与查询</h2>
        <p>支持多系统隔离空间、规则联动、模板生成、拖拽编排、冲突识别、电子审签和查询回溯。</p>
        <div class="button-row">
          <button class="button" type="button" @click="router.push('/planning')">进入流程自主规划</button>
          <button class="ghost" type="button" @click="router.push('/rules')">查看工作规则管理</button>
        </div>
      </div>
      <div class="panel">
        <div class="summary-line"><span>专项流程</span><strong>6 类</strong></div>
        <div class="summary-line"><span>工作项目</span><strong>16 项</strong></div>
        <div class="summary-line"><span>保障规则</span><strong>7 项</strong></div>
        <div class="summary-line"><span>可视化组件</span><strong>4 类</strong></div>
      </div>
    </section>

    <section class="card-grid">
      <button v-for="module in modules" :key="module.to" class="workflow-link-card" type="button" @click="router.push(module.to)">
        <strong>{{ module.title }}</strong>
        <p>{{ module.desc }}</p>
        <span>进入模块</span>
      </button>
    </section>
  </div>
</template>
