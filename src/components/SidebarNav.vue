<script setup>
const items = [
  { label: "首页总览", sub: "Overview", to: "/", icon: "overview" },
  { label: "流程自主规划", sub: "Plan", to: "/planning", icon: "plan" },
  { label: "流程动态监控", sub: "Monitor", to: "/monitoring", icon: "monitor" },
  { label: "流程智能评估", sub: "Assess", to: "/evaluation", icon: "assess" },
  { label: "流程智能查询", sub: "Search", to: "/query", icon: "query" },
  { label: "工作规则管理", sub: "Rules", to: "/rules", icon: "rules" }
];
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <small class="sidebar-brand-kicker">智能流程辅助管理平台</small>
      <strong class="sidebar-brand-title">智能流程辅助管理</strong>
      <div class="sidebar-brand-subtitle">配置项设计界面</div>
    </div>

    <nav class="sidebar-menu">
      <RouterLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="nav-primary"
        active-class="active"
      >
        <span class="menu-icon" :class="`icon-${item.icon}`" aria-hidden="true"></span>
        <span class="nav-copy">
          <strong>{{ item.label }}</strong>
          <small>{{ item.sub }}</small>
        </span>
      </RouterLink>
    </nav>
  </aside>
</template>
