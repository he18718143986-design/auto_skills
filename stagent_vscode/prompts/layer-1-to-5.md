
Layer 1 骨架层（Skeleton）
  内容：类型定义、配置文件、接口声明
  特征：无逻辑实现，纯声明

Layer 2 管道层（Plumbing）
  内容：工具函数、适配器、格式转换
  特征：无业务逻辑，只依赖 Layer 1

Layer 3 逻辑层（Logic）
  内容：核心业务模块、状态机、服务
  特征：核心逻辑所在，依赖 Layer 1-2
  ★ 每个模块必须有决策阶段前置（isDecisionStage）

Layer 4 集成层（Integration）
  内容：入口文件、路由、组装层
  特征：组装 Layer 1-3，不含新业务逻辑
  ★ 每个模块必须有决策阶段前置（isDecisionStage）

Layer 5 强化层（Hardening）
  内容：端到端测试、错误处理、文档
  特征：所有其他层都已存在后再写
