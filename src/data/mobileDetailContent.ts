export const mobileWorkshopDetailContent = {
  "enterprise-tax": {
    audience: "适合企业财务、代账团队与需要重复报税的运营成员。",
    boundary: "服务启动后不会先弹出大表单，系统会直接创建任务，再由 Codex 在对话中追问缺失材料与审批条件。",
    outputs: [
      "税务回执 PDF",
      "执行总结 Markdown",
      "审计时间线 JSON",
    ],
    flow: [
      "从服务详情点击启动",
      "系统创建实例并注入首条引导消息",
      "在任务对话中继续补充主体、周期、审批要求",
      "结果文件回流到任务页与我的资产",
    ],
    highlights: ["OTP 登录", "浏览器代办", "回执沉淀"],
  },
  "creator-drama": {
    audience: "适合导演、编导、内容策划与需要持续审稿的人。",
    boundary: "外部素材与导演意见都通过同一任务对话持续补充，避免在启动前一次性填完全部信息。",
    outputs: [
      "分镜草案 Markdown",
      "镜头清单 CSV",
      "导演修订记录",
    ],
    flow: [
      "选择服务并启动",
      "Codex 在对话中确认剧情目标与参考风格",
      "生成第一版分镜后继续回收导演意见",
      "修订结果持续回写到同一任务目录",
    ],
    highlights: ["持续追问", "审稿回流", "外部素材引用"],
  },
  "brand-content": {
    audience: "适合品牌内容团队、独立创作者和需要批量结果交付的人。",
    boundary: "图像能力和私有 key 只在实例容器内只读挂载，不在移动端暴露原始凭证。",
    outputs: [
      "海报结果包 ZIP",
      "提示词归档 JSON",
      "候选图目录",
    ],
    flow: [
      "选择批量生成服务",
      "在任务中补充品牌边界与尺寸要求",
      "对话里确认筛选结果与二次变体",
      "最终结果打包沉淀到 output 目录",
    ],
    highlights: ["批量出图", "结果打包", "私有图像能力"],
  },
} as const;

export const mobileServiceDetailContent = {
  "tax-filing": {
    creator: "华港财务组 / Chrome Tax Runner",
    risk: "最终提交前必须回到当前对话流请求确认，浏览器敏感动作不会自动越过审批节点。",
    connectors: ["企业邮箱 OTP", "浏览器自动化能力", "只读财务目录挂载"],
    outputs: ["filing-slip.pdf", "final-summary.md", "audit-log.json"],
    launchFlow: [
      "立即创建实例",
      "系统插入“请问你需要我提供什么信息给你”语义的首轮引导消息",
      "Codex 继续追问主体、周期、材料与审批边界",
      "浏览器执行结果持续写回任务目录",
    ],
  },
  "drama-storyboard": {
    creator: "内容导演组 / Drama Suite",
    risk: "外部素材和视频额度属于受控资源，超额或需要外发时会回到任务对话请求确认。",
    connectors: ["Seedance API", "内容素材引用", "导演审稿回流"],
    outputs: ["storyboard-v1.md", "shot-list.csv", "review-notes.md"],
    launchFlow: [
      "创建短剧实例",
      "Codex 追问剧情目标、风格参考与优先交付",
      "生成分镜草案并回到同一对话持续修订",
      "所有版本沉淀在实例 target path",
    ],
  },
  "poster-batch": {
    creator: "品牌内容组 / Poster Suite",
    risk: "私有图像 key 只读挂载，候选图默认不对外公开，最终导出前可在对话中继续筛选。",
    connectors: ["GPT Image 2", "品牌资产库引用", "只读图像额度凭证"],
    outputs: ["poster-bundle.zip", "prompt-archive.json", "variants/*"],
    launchFlow: [
      "启动批量生成实例",
      "在任务对话中补充品牌约束、尺寸与批次数量",
      "结果生成后在同一会话里筛选最终版本",
      "打包件同步沉淀到 output 目录",
    ],
  },
} as const;
