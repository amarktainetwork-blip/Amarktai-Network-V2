export type RuntimeModelPolicyBlocker = 'removed_model_family_qwen' | 'coding_only_model_family_mimo'

const QWEN_PATTERN = /(?:^|[\/_-])qwen(?:$|[\/_-])/i
const MIMO_PATTERN = /(?:^|[\/_-])(?:xiaomi[-_]?mimo|mimo)(?:$|[\/_-])/i

/**
 * Provider hosting does not override the Network's model-family policy.
 * Qwen is removed from this build and Xiaomi MiMo remains coding-tools-only,
 * even when those model families appear in another provider's public catalogue.
 */
export function getRuntimeModelPolicyBlocker(modelId: string): RuntimeModelPolicyBlocker | null {
  const normalized = modelId.trim()
  if (!normalized) return null
  if (QWEN_PATTERN.test(normalized)) return 'removed_model_family_qwen'
  if (MIMO_PATTERN.test(normalized)) return 'coding_only_model_family_mimo'
  return null
}

export function isRuntimeModelFamilyAllowed(modelId: string): boolean {
  return getRuntimeModelPolicyBlocker(modelId) === null
}
