import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import LoginView from "../views/LoginView.vue";
import PlanningHubView from "../views/PlanningHubView.vue";
import FuelPlanningView from "../views/FuelPlanningView.vue";
import GenericPlanningCalendarView from "../views/GenericPlanningCalendarView.vue";
import LaunchDayPlanningView from "../views/LaunchDayPlanningView.vue";
import WorkflowDetailView from "../views/WorkflowDetailView.vue";
import MonitoringView from "../views/MonitoringView.vue";
import EvaluationView from "../views/EvaluationView.vue";
import QueryView from "../views/QueryView.vue";
import RulesView from "../views/RulesView.vue";
import { usePlatformState } from "../composables/usePlatformState";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/login", name: "login", component: LoginView, meta: { public: true, hideChrome: true } },
    { path: "/", name: "home", component: HomeView },
    { path: "/planning", name: "planning", component: PlanningHubView },
    { path: "/planning/fuel", name: "fuel-planning", component: FuelPlanningView },
    { path: "/planning/mission", name: "mission-planning", component: GenericPlanningCalendarView, props: { flowId: "mission" } },
    { path: "/planning/launch", name: "launch-planning", component: LaunchDayPlanningView },
    { path: "/planning/repair", name: "repair-planning", component: GenericPlanningCalendarView, props: { flowId: "repair" } },
    { path: "/planning/maintenance", name: "maintenance-planning", component: GenericPlanningCalendarView, props: { flowId: "maintenance" } },
    { path: "/planning/custom", name: "custom-planning", component: GenericPlanningCalendarView, props: { flowId: "custom" } },
    { path: "/planning/:flowId", name: "workflow", component: WorkflowDetailView, props: true },
    { path: "/monitoring", name: "monitoring", component: MonitoringView },
    { path: "/evaluation", name: "evaluation", component: EvaluationView },
    { path: "/query", name: "query", component: QueryView },
    { path: "/rules", name: "rules", component: RulesView }
  ]
});

router.beforeEach((to) => {
  const { currentUser } = usePlatformState();
  if (to.meta.public) {
    if (to.name === "login" && currentUser.value) return "/";
    return true;
  }
  if (!currentUser.value) {
    return { name: "login" };
  }
  return true;
});

export { router };
