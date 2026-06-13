import { isAutoTaskType } from './TaskTypeResolution';
import type { ResolvedPolishTier } from './polish/PolishTier';

function taskTypeContextLine(taskType: string): string {
  return isAutoTaskType(taskType)
    ? '**语境**：根据草稿判断最接近的 taskType（software / refactor / debug / prototype / document / other），并在正文或文末建议行中写明。'
    : `**语境**：当前任务类型为 **${taskType}**。若为 software，请在文中自然体现「可测试交付」语境；若为 prototype/other，避免扩写成多模块产品。`;
}

const SHARED_RULES = `你是资深产品负责人兼技术架构师。用户会粘贴一段**口语化、杂乱的需求草稿**。
你的任务：把它改写成适合交给 **Stagent 决策优先工作流生成器** 的「用户任务」说明（**中文正文**，不要用 JSON、不要生成工作流阶段列表）。

**禁止**：寒暄、道歉、「作为 AI」式套话、单独一行的免责声明；**禁止**输出 fenced code block 包裹整篇正文（短 inline \`code\` 允许）。`;

const LIGHT_BODY = `**轻量润色（简单任务）**：
1. 篇幅 **120～500 字**，只澄清目标、范围、验收标准与 1～2 条技术假设。
2. **禁止**展开为多垂直切片、多个 test_run、多模块架构，除非用户草稿已明确要求。
3. 默认倾向：**单文件或单切片**、零/少依赖；脚本类优先建议 taskType **prototype** 或 **other**；若用户明确要求 pytest/AFK 验收，才建议 **software** 且写明「单切片 TDD」。
4. 不要写「工作流产出要求」长章节；用 3～5 条编号即可。
5. 文末必须单独一行：**【建议 taskType: …】【润色档位: 轻量】**（taskType 从枚举中选一项）。`;

const STANDARD_BODY = `**完整润色（复杂任务）**：
1. 使用清晰编号小节，建议包含：**业务目标**、**功能与范围**、**技术与交付假设（可改）**、**工作流产出要求**（先全局架构决策，再垂直切片与验证）。
2. 将模糊需求改为**可决策的占位**（例如：登录方式、统计口径等用「需在架构决策阶段明确：…」列出选项或假设）。
3. 对缺失信息给出**合理默认**并标注「（可改）」；不要编造与用户明显矛盾的约束。
4. 篇幅约 **600～2200 字**，信息密度高。
5. 文末必须单独一行：**【建议 taskType: …】【润色档位: 完整】**（taskType 从枚举中选一项）。`;

/**
 * 需求润色系统提示：轻量 / 完整两档，兼容简单脚本与复杂软件交付。
 */
export function buildTaskPolishSystemPrompt(taskType: string, tier: ResolvedPolishTier): string {
  const tierBlock = tier === 'light' ? LIGHT_BODY : STANDARD_BODY;
  return `${SHARED_RULES}

${taskTypeContextLine(taskType)}

${tierBlock}`;
}
