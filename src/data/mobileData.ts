export type MobileTask = {
  id: string;
  workspaceId?: string;
  title: string;
  workshop: string;
  status: "running" | "approval" | "done";
  statusLabel: string;
  statusClass: string;
  updatedAt: string;
  summary: string;
  tags: string[];
  targetPath: string;
  container: string;
  stage: string;
  eta: string;
  approvals: number;
  objective: string;
  mounted: string;
  messages: MobileTaskMessage[];
  files: Array<{ name: string; path: string; meta: string; status: string; helper: string }>;
  pathOptions: Array<{ label: string; path: string; helper: string }>;
};

export type MobileTaskMessageModule = {
  type: "approval" | "file" | "result" | "error";
  title: string;
  summary: string;
  status: string;
  items?: string[];
  primaryAction?: string;
  primaryDraft?: string;
  secondaryAction?: string;
  secondaryDraft?: string;
};

export type MobileTaskMessage = {
  role: string;
  time: string;
  body: string;
  kind: "system" | "user" | "agent";
  module?: MobileTaskMessageModule;
};

export type MobileWorkshop = {
  id: string;
  name: string;
  owner: string;
  description: string;
  badge: string;
};

export type MobileService = {
  id: string;
  workshopId: string;
  name: string;
  summary: string;
  auth: string;
  eta: string;
};

export type MobileWorkspaceEntry = {
  id: string;
  name: string;
  type: string;
  meta: string;
  root: string;
  workshops: number;
  tasks: number;
};

export const workshops: MobileWorkshop[] = [
  {
    id: "enterprise-tax",
    name: "企业财税工坊",
    owner: "华港财务组",
    description:
      "围绕登录、报税、回执和审计摘要组织高频财税服务，适合企业财务与代账场景。",
    badge: "企业工坊",
  },
  {
    id: "creator-drama",
    name: "短剧生产工坊",
    owner: "内容导演组",
    description:
      "围绕分镜、镜头节奏、角色设定和外部素材能力组织短剧生产服务，适合快速拉起内容实例。",
    badge: "Creator 工坊",
  },
  {
    id: "brand-content",
    name: "品牌内容工坊",
    owner: "品牌内容组",
    description:
      "围绕图像、海报、KV 和提示词归档组织内容生产服务，结果同步沉淀到任务页和我的资产。",
    badge: "推荐工坊",
  },
];

export const services: MobileService[] = [
  {
    id: "tax-filing",
    workshopId: "enterprise-tax",
    name: "香港有限公司季度报税",
    summary: "启动后直接进入任务对话，由 Codex 继续收集缺失信息与审批要求。",
    auth: "企业邮箱 OTP / 只读财务目录挂载",
    eta: "约 4-8 分钟",
  },
  {
    id: "drama-storyboard",
    workshopId: "creator-drama",
    name: "短剧分镜生成与审稿",
    summary: "从角色设定、节奏偏好到导演意见都在对话里补齐，结果持续回流到同一任务中。",
    auth: "Seedance / 外部素材引用",
    eta: "约 8-15 分钟",
  },
  {
    id: "poster-batch",
    workshopId: "brand-content",
    name: "品牌海报批量生成",
    summary: "围绕品牌约束批量生成海报、KV 和提示词归档，结果包会同步沉淀到任务页和我的资产。",
    auth: "图像能力额度 / 只读密钥挂载",
    eta: "约 6-12 分钟",
  },
];

export const tasks: MobileTask[] = [
  {
    id: "tax-q2",
    workspaceId: "harbor-finance",
    title: "香港有限公司 2026Q2 报税",
    workshop: "企业报税执行器",
    status: "running",
    statusLabel: "运行中",
    statusClass: "success",
    updatedAt: "2 分钟前更新",
    summary: "当前等待沿用上一季度结转税项审批，已上传 3 个附件。",
    tags: ["#tax", "#high", "已传 3 件", "1 项审批"],
    targetPath: "/workspace/tax-q2/",
    container: "ctx-2048",
    stage: "材料校验",
    eta: "预计完成：14:12",
    approvals: 1,
    objective: "完成申报并输出回执结果包",
    mounted: "codex-cli / chrome-mcp / OTP",
    messages: [
      {
        role: "系统引导",
        time: "09:42",
        body: "请先提供报税主体、周期、登录方式，以及当前已准备好的材料清单。",
        kind: "system",
      },
      {
        role: "你",
        time: "09:43",
        body: "主体是香港有限公司，周期 2026Q2，登录走企业邮箱 OTP。材料已准备利润表、银行流水和董事签章。",
        kind: "user",
      },
      {
        role: "运行实例",
        time: "09:44",
        body: "开始校验字段并准备接管浏览器。敏感操作会回到当前消息流请求审批。",
        kind: "agent",
      },
      {
        role: "运行实例",
        time: "09:47",
        body: "检测到上一季度结转税项，是否沿用？",
        kind: "agent",
        module: {
          type: "approval",
          title: "沿用上一季度结转税项",
          summary: "继续执行前需要你明确是否继承上一季度结转税项。确认后实例会继续当前容器，不重新收集材料。",
          status: "待确认",
          items: ["影响本次申报税额计算", "确认后继续当前浏览器上下文", "拒绝后重新填写该字段"],
          primaryAction: "沿用上一季度",
          primaryDraft: "请沿用上一季度结转税项并继续执行当前报税实例。",
          secondaryAction: "重新填写",
          secondaryDraft: "不要沿用上一季度结转税项，请回到该字段并等待我补充新的数值。",
        },
      },
      {
        role: "运行实例",
        time: "09:53",
        body: "首批结果已经回写到当前任务目录，你可以直接打开文件页查看回执和执行总结。",
        kind: "agent",
        module: {
          type: "file",
          title: "已有可查看文件",
          summary: "回执、执行总结和浏览器截图已经进入当前任务路径。",
          status: "目录已更新",
          items: [
            "receipts / filing-slip.pdf",
            "output / final-summary.md",
            "screenshots / login-step.png",
          ],
          primaryAction: "查看文件",
          secondaryAction: "继续追问",
          secondaryDraft: "请先概括当前回执和执行总结里的关键信息，再继续说明下一步建议。",
        },
      },
    ],
    files: [
      {
        name: "receipts / filing-slip.pdf",
        path: "/workspace/tax-q2/receipts/filing-slip.pdf",
        meta: "updated 09:52 / 184kb",
        status: "完成",
        helper: "最终税务回执，可直接下载。",
      },
      {
        name: "screenshots / login-step.png",
        path: "/workspace/tax-q2/screenshots/login-step.png",
        meta: "updated 09:46 / 612kb",
        status: "记录",
        helper: "浏览器执行截图，用于审计复核。",
      },
      {
        name: "output / final-summary.md",
        path: "/workspace/tax-q2/output/final-summary.md",
        meta: "updated 09:53 / 18kb",
        status: "结果",
        helper: "面向用户的执行总结。",
      },
    ],
    pathOptions: [
      {
        label: "实例目录",
        path: "/workspace/tax-q2/",
        helper: "查看当前任务实例的根目录以及共享输出内容。",
      },
      {
        label: "输出目录",
        path: "/workspace/tax-q2/output/",
        helper: "查看回执包、审计摘要和浏览器追踪文件。",
      },
      {
        label: "截图目录",
        path: "/workspace/tax-q2/screenshots/",
        helper: "查看登录和关键步骤截图。",
      },
    ],
  },
  {
    id: "drama-ep08",
    workspaceId: "brand-lab",
    title: "短剧第 8 集分镜确认",
    workshop: "短剧生成套件",
    status: "approval",
    statusLabel: "待确认",
    statusClass: "warn",
    updatedAt: "9 分钟前更新",
    summary: "等待用户确认视频额度和最终镜头节奏，已生成分镜和镜头清单。",
    tags: ["#drama", "#content", "18 个镜头"],
    targetPath: "/workspace/drama-ep08/",
    container: "ctx-2119",
    stage: "导演修订",
    eta: "预计完成：18:20",
    approvals: 1,
    objective: "收集导演意见并完成第二轮分镜修订",
    mounted: "codex-cli / seedance / asset-ref",
    messages: [
      {
        role: "系统引导",
        time: "14:20",
        body: "请告诉我本集剧情目标、已有剧本版本、参考风格，以及你希望我先完成分镜还是先整理镜头素材。",
        kind: "system",
      },
      {
        role: "你",
        time: "14:23",
        body: "先完成分镜。风格参考偏港风都市。素材稍后补。",
        kind: "user",
      },
      {
        role: "运行实例",
        time: "14:51",
        body: "分镜草案已完成并写入 output/storyboard-v1.md。当前建议你补充导演修改意见。",
        kind: "agent",
        module: {
          type: "result",
          title: "第一版分镜已生成",
          summary: "当前结果已经写入任务目录，可以继续在同一对话里补充导演意见并触发第二轮修订。",
          status: "草案完成",
          items: ["output / storyboard-v1.md", "output / shot-list.csv"],
          primaryAction: "查看文件",
          secondaryAction: "补充导演意见",
          secondaryDraft: "请基于第一版分镜继续记录导演修改意见，我会在同一任务里推进第二轮修订。",
        },
      },
    ],
    files: [
      {
        name: "output / storyboard-v1.md",
        path: "/workspace/drama-ep08/output/storyboard-v1.md",
        meta: "updated 14:51 / 32kb",
        status: "草稿",
        helper: "第一版分镜草案。",
      },
      {
        name: "output / shot-list.csv",
        path: "/workspace/drama-ep08/output/shot-list.csv",
        meta: "updated 14:52 / 12kb",
        status: "列表",
        helper: "镜头排期清单。",
      },
    ],
    pathOptions: [
      {
        label: "实例目录",
        path: "/workspace/drama-ep08/",
        helper: "查看当前剧集实例目录以及共享的策划输出。",
      },
      {
        label: "输出目录",
        path: "/workspace/drama-ep08/output/",
        helper: "查看分镜草案和镜头列表。",
      },
      {
        label: "审稿目录",
        path: "/workspace/drama-ep08/review/",
        helper: "导演意见会回流到这里。",
      },
    ],
  },
  {
    id: "poster-batch-17",
    workspaceId: "brand-lab",
    title: "品牌海报批次 17",
    workshop: "图像资产批处理",
    status: "done",
    statusLabel: "已完成",
    statusClass: "active",
    updatedAt: "26 分钟前更新",
    summary: "24 张图像已出图并归档，可直接查看结果文件，或继续继承该会话。",
    tags: ["#image", "#brand", "24 份结果"],
    targetPath: "/workspace/poster-batch-17/",
    container: "ctx-2140",
    stage: "选图回流",
    eta: "已完成",
    approvals: 0,
    objective: "确认最终 4 张图并打包交付",
    mounted: "codex-cli / imagegen / readonly-key",
    messages: [
      {
        role: "运行实例",
        time: "19:04",
        body: "12 张图已出，最终选中的 4 张将写入 output/final/，同时保留候选版本。",
        kind: "agent",
      },
      {
        role: "运行实例",
        time: "19:12",
        body: "结果已归档，当前可直接打开文件目录，或继续发起二次变体生成。",
        kind: "agent",
        module: {
          type: "result",
          title: "品牌海报结果包已归档",
          summary: "精选图、候选图和提示词归档已经写回任务目录，可直接下载或继续派生二次变体。",
          status: "已完成",
          items: ["output / poster-bundle.zip", "output / prompt-archive.json"],
          primaryAction: "查看文件",
          secondaryAction: "继续生成变体",
          secondaryDraft: "请基于当前精选图继续生成一轮二次变体，并保持同一品牌约束。",
        },
      },
    ],
    files: [
      {
        name: "output / poster-bundle.zip",
        path: "/workspace/poster-batch-17/output/poster-bundle.zip",
        meta: "updated 19:13 / 88mb",
        status: "结果",
        helper: "精选图与说明文档的打包件。",
      },
      {
        name: "output / prompt-archive.json",
        path: "/workspace/poster-batch-17/output/prompt-archive.json",
        meta: "updated 19:11 / 6kb",
        status: "归档",
        helper: "提示词与配置归档。",
      },
    ],
    pathOptions: [
      {
        label: "实例目录",
        path: "/workspace/poster-batch-17/",
        helper: "查看当前海报批次的完整目录。",
      },
      {
        label: "输出目录",
        path: "/workspace/poster-batch-17/output/",
        helper: "查看已打包海报和可直接交付的导出文件。",
      },
      {
        label: "候选目录",
        path: "/workspace/poster-batch-17/variants/",
        helper: "查看候选图与变体结果。",
      },
    ],
  },
];

export const authEntries = [
  {
    name: "企业邮箱 OTP",
    detail: "当前实例可读取账号额度并发起浏览审批。",
    status: "已连接",
  },
  {
    name: "财务共享目录",
    detail: "以只读挂载方式注入任务环境，不在移动端暴露原值。",
    status: "只读",
  },
  {
    name: "Image Gen Key",
    detail: "按用户账户绑定，可在任务中直接调外部图像能力。",
    status: "可用",
  },
];

export const assetEntries = [
  {
    title: "回执与汇总",
    meta: "回执、汇总与审计摘要，已沉淀到目标路径 output/",
  },
  {
    title: "短剧个人项目",
    meta: "短剧个人项目当前版本，可继续在任务对话里补充镜头要求。",
  },
  {
    title: "个人品牌实验",
    meta: "个人品牌实验生成记录，结果文件保存于个人资产目录。",
  },
];

export const noticeEntries = [
  {
    title: "有 1 个报税任务待确认",
    detail: "处理动作会继续回到对应任务对话里执行。",
  },
  {
    title: "短剧工坊额度待确认",
    detail: "确认后继续当前实例，不重新收集材料。",
  },
];

export const workspaceEntries: MobileWorkspaceEntry[] = [
  {
    id: "harbor-finance",
    name: "华港财务组",
    type: "企业",
    meta: "成员 / 已连接 4 项能力",
    root: "/workspace/tax-q2/",
    workshops: 1,
    tasks: 1,
  },
  {
    id: "personal",
    name: "个人空间",
    type: "个人",
    meta: "个人项目 / 已连接 2 项能力",
    root: "/workspace/personal/",
    workshops: 2,
    tasks: 1,
  },
  {
    id: "brand-lab",
    name: "品牌内容组",
    type: "企业",
    meta: "编辑 / 已连接 3 项能力",
    root: "/workspace/poster-batch-17/",
    workshops: 2,
    tasks: 2,
  },
];
