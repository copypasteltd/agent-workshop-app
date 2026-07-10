import { services, tasks, workshops, workspaceEntries, type MobileTask } from "./mobileData";

export type MobileWorkspaceId = "harbor-finance" | "personal" | "brand-lab";

const workshopVisibility: Record<string, MobileWorkspaceId[]> = {
  "enterprise-tax": ["harbor-finance"],
  "creator-drama": ["personal", "brand-lab"],
  "brand-poster-suite": ["personal", "brand-lab"],
};

const serviceVisibility: Record<string, MobileWorkspaceId[]> = {
  "tax-filing": ["harbor-finance"],
  "drama-storyboard": ["personal", "brand-lab"],
  "poster-batch": ["personal", "brand-lab"],
};

const staticTaskWorkspaceIds: Record<string, MobileWorkspaceId> = {
  "tax-q2": "harbor-finance",
  "drama-ep08": "brand-lab",
  "poster-batch-17": "brand-lab",
  "personal-brand-lab": "personal",
};

export const mobileWorkspaceRuntimeIds: Record<MobileWorkspaceId, string> = {
  "harbor-finance": "wsp_harbor_finance",
  "personal": "wsp_personal",
  "brand-lab": "wsp_brand_content",
};

const supplementalTasks: MobileTask[] = [
  {
    id: "personal-brand-lab",
    workspaceId: "personal",
    title: "个人品牌封面实验",
    workshop: "品牌内容工坊",
    status: "running",
    statusLabel: "运行中",
    statusClass: "success",
    updatedAt: "8 分钟前更新",
    summary: "当前等待你补充新的版式偏好，结果会继续回流到同一任务对话中。",
    tags: ["#personal", "#brand", "KV 第二版"],
    targetPath: "/workspace/personal/brand-lab/",
    container: "ctx-2201",
    stage: "风格调整",
    eta: "预计完成：22:10",
    approvals: 0,
    objective: "继续完成个人品牌封面和简介页整套视觉稿",
    mounted: "codex-cli / imagegen / personal-key",
    messages: [
      {
        role: "系统引导",
        time: "21:06",
        body: "请告诉我你想保留的视觉方向、不可使用的颜色，以及这次结果主要用于头像、封面还是个人简介页。",
        kind: "system",
      },
      {
        role: "你",
        time: "21:08",
        body: "继续保留薄荷绿和白色，但减少科技感，主要用于个人介绍页封面。",
        kind: "user",
      },
      {
        role: "运行实例",
        time: "21:14",
        body: "第二版主视觉已经写入 output/profile-kv-v2.png。补充排版偏好后，我会继续生成整套简介页图稿。",
        kind: "agent",
        module: {
          type: "result",
          title: "第二版主视觉已生成",
          summary: "当前封面主视觉和提示词归档已经沉淀到实例目录，继续补充排版偏好即可推进整套简介页图稿。",
          status: "可继续迭代",
          items: ["output / profile-kv-v2.png", "archive / prompt-archive.json"],
          primaryAction: "查看文件",
          secondaryAction: "补充排版偏好",
          secondaryDraft: "请继续记录这一轮的版式偏好，我希望下一版更适合个人介绍页封面。",
        },
      },
    ],
    files: [
      {
        name: "output / profile-kv-v2.png",
        path: "/workspace/personal/brand-lab/output/profile-kv-v2.png",
        meta: "updated 21:14 / 2.8mb",
        status: "结果",
        helper: "第二版封面主视觉，可继续迭代。",
      },
      {
        name: "archive / prompt-archive.json",
        path: "/workspace/personal/brand-lab/archive/prompt-archive.json",
        meta: "updated 21:12 / 8kb",
        status: "归档",
        helper: "当前实验使用的提示词与参数记录。",
      },
    ],
    pathOptions: [
      {
        label: "实例目录",
        path: "/workspace/personal/brand-lab/",
        helper: "查看当前个人品牌实验实例的完整目录。",
      },
      {
        label: "输出目录",
        path: "/workspace/personal/brand-lab/output/",
        helper: "查看封面主视觉和最终交付图稿。",
      },
      {
        label: "归档目录",
        path: "/workspace/personal/brand-lab/archive/",
        helper: "查看提示词、参数与实验归档。",
      },
    ],
  },
];

function ensureWorkspaceId(task: MobileTask): MobileTask {
  if (task.workspaceId) {
    return task;
  }

  return {
    ...task,
    workspaceId: staticTaskWorkspaceIds[task.id] ?? "brand-lab",
  };
}

export function normalizeMobileWorkspaceId(workspaceId: string | undefined): MobileWorkspaceId {
  if (!workspaceId) {
    return "harbor-finance";
  }

  if (workspaceId.includes("harbor")) {
    return "harbor-finance";
  }

  if (workspaceId.includes("personal")) {
    return "personal";
  }

  if (workspaceId.includes("brand")) {
    return "brand-lab";
  }

  if (workspaceId === "harbor-finance" || workspaceId === "personal" || workspaceId === "brand-lab") {
    return workspaceId;
  }

  return "harbor-finance";
}

export function getWorkspaceEntry(workspaceId: string | undefined) {
  const normalized = normalizeMobileWorkspaceId(workspaceId);
  return workspaceEntries.find((item) => item.id === normalized) ?? workspaceEntries[0];
}

export function getVisibleWorkshops(workspaceId: string | undefined) {
  const normalized = normalizeMobileWorkspaceId(workspaceId);
  return workshops.filter((item) => workshopVisibility[item.id]?.includes(normalized));
}

export function getVisibleServices(workspaceId: string | undefined) {
  const normalized = normalizeMobileWorkspaceId(workspaceId);
  return services.filter((item) => serviceVisibility[item.id]?.includes(normalized));
}

export function findVisibleWorkshop(workshopId: string | undefined, workspaceId: string | undefined) {
  const visibleWorkshops = getVisibleWorkshops(workspaceId);
  return visibleWorkshops.find((item) => item.id === workshopId) ?? visibleWorkshops[0] ?? null;
}

export function getVisibleServicesForWorkshop(workshopId: string, workspaceId: string | undefined) {
  return getVisibleServices(workspaceId).filter((item) => item.workshopId === workshopId);
}

export function getAllStaticTasks() {
  return [...tasks, ...supplementalTasks].map(ensureWorkspaceId);
}

export function findStaticTaskById(taskId: string | undefined) {
  if (!taskId) {
    return null;
  }

  return getAllStaticTasks().find((item) => item.id === taskId) ?? null;
}

export function getVisibleTasks(workspaceId: string | undefined) {
  const normalized = normalizeMobileWorkspaceId(workspaceId);
  return getAllStaticTasks().filter((item) => item.workspaceId === normalized);
}

export function getWorkspaceMetrics(workspaceId: string | undefined) {
  return {
    workshops: getVisibleWorkshops(workspaceId).length,
    services: getVisibleServices(workspaceId).length,
    tasks: getVisibleTasks(workspaceId).length,
  };
}

export function findVisibleService(serviceId: string | undefined, workspaceId: string | undefined) {
  const visibleServices = getVisibleServices(workspaceId);
  return visibleServices.find((item) => item.id === serviceId) ?? visibleServices[0] ?? null;
}

export function findVisibleTask(taskId: string | undefined, workspaceId: string | undefined) {
  const visibleTasks = getVisibleTasks(workspaceId);
  return visibleTasks.find((item) => item.id === taskId) ?? null;
}
