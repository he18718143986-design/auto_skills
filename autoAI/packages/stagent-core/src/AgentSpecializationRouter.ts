import type { Stage } from './WorkflowDefinition';

export type AgentRole = 'decision' | 'implementation' | 'test-write' | 'lightweight' | 'default';

export interface AgentSelectionConfig {
  preferredModelByRole?: Partial<Record<AgentRole, string>>;
  fallbackToDefault: boolean;
}

export interface LanguageModelLike {
  family: string;
  name: string;
  id: string;
}

export function classifyStageRole(stage: Stage): AgentRole {
  if (stage.isDecisionStage) {
    return 'decision';
  }
  if (/^stage_test_write_/.test(stage.id)) {
    return 'test-write';
  }
  if (/^stage_impl_/.test(stage.id)) {
    return 'implementation';
  }
  if (/^stage_(zoom|doc|polish|summary)/.test(stage.id)) {
    return 'lightweight';
  }
  return 'default';
}

function resolveModelFamilyOverride(
  role: AgentRole,
  overrides: Partial<Record<AgentRole, string>>,
): string | undefined {
  const direct = overrides[role]?.trim();
  if (direct) {
    return direct;
  }
  const fallback = overrides.default?.trim();
  return fallback || undefined;
}

function modelMatchesHint(model: LanguageModelLike, hint: string): boolean {
  const h = hint.trim();
  if (!h) {
    return false;
  }
  if (model.family === h || model.name === h || model.id === h) {
    return true;
  }
  if (h.startsWith('direct:')) {
    const modelName = h.slice('direct:'.length);
    return (
      model.family === h ||
      model.name === h ||
      (model.family.startsWith('direct:') && model.family.slice('direct:'.length) === modelName)
    );
  }
  return model.family.includes(h) || model.name.includes(h);
}

/** 从可用模型列表中按角色 overrides 选取；纯函数，便于单测。 */
export function pickModelForStage<T extends LanguageModelLike>(
  stage: Stage,
  config: AgentSelectionConfig,
  availableModels: T[],
): T | undefined {
  if (availableModels.length === 0) {
    return undefined;
  }
  const role = classifyStageRole(stage);
  const hint = resolveModelFamilyOverride(role, config.preferredModelByRole ?? {});
  if (hint) {
    const matched = availableModels.find((m) => modelMatchesHint(m, hint));
    if (matched) {
      return matched;
    }
  }
  return config.fallbackToDefault ? availableModels[0] : undefined;
}

export function buildAgentSelectionConfig(
  overrides: Partial<Record<string, string>>,
  fallbackToDefault = true,
): AgentSelectionConfig {
  const preferredModelByRole: Partial<Record<AgentRole, string>> = {};
  for (const role of ['decision', 'implementation', 'test-write', 'lightweight', 'default'] as AgentRole[]) {
    const v = overrides[role]?.trim();
    if (v) {
      preferredModelByRole[role] = v;
    }
  }
  return { preferredModelByRole, fallbackToDefault };
}
