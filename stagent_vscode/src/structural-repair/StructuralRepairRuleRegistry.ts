import type { PlanCompletenessViolationType } from '../PlanCompletenessGate';
import type { RepairFn } from './types';
import { repairMissingVerificationStage } from './rules/verification-stage';
import { repairMissingTestInfrastructure } from './rules/test-infrastructure';
import { repairMissingSelfHealChain } from './rules/self-heal-chain';

export const STRUCTURAL_REPAIR_RULES: Partial<Record<PlanCompletenessViolationType, RepairFn>> = {
  'missing-verification-stage': repairMissingVerificationStage,
  'missing-test-infrastructure': repairMissingTestInfrastructure,
  'missing-self-heal-chain': repairMissingSelfHealChain,
};
