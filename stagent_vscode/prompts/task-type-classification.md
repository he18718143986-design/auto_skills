
【meta.taskType 分类 — 与用户任务一并判断，写入 JSON meta】
1. 阅读「用户任务」，在 meta.taskType 中写入且仅写入以下之一：
   software | refactor | debug | prototype | document | improve-architecture | other
2. 分类指引（择一，不得臆造新枚举）：
   - software：完整可交付软件/VS Code 扩展/全栈 npm 子项目，需决策+实现+可执行测试链
   - refactor：在现有代码库上重构，外部行为等价
   - debug：复现 → 根因 → 修复 → 回归验证
   - prototype：MVP、脚本、Python/Excel/CLI、小工具、实验性验证（非完整 npm 产品）
   - document：以文档/说明产出为主
   - improve-architecture：深模块 / ball-of-mud 候选与 seam 分析，小步提取加深
   - other：以上皆不完全贴合的轻量自动化
3. 生成 stages 时 **仅遵守** 与 meta.taskType 匹配的「类型约束块」；其余块忽略。
4. 若用户任务是 Python/Shell/数据分析脚本、读 Excel/CSV、HTTP mock，**不得**选 software，应选 prototype 或 other。
5. meta.userInput 须保留用户任务要点。