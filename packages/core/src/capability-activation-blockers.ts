import type { CapabilityKey } from './capabilities.js'
import type { ProviderKey } from './providers.js'

export const CAPABILITY_ACTIVATION_BLOCKER_STAGES = [
  'staging_live_discovery',
  'provider_contract_activation',
  'internal_executor_selection',
] as const

export type CapabilityActivationBlockerStage = typeof CAPABILITY_ACTIVATION_BLOCKER_STAGES[number]

export interface CapabilityActivationBlocker {
  capability: CapabilityKey
  provider: Extract<ProviderKey, 'genx' | 'deepinfra'> | 'network'
  stage: CapabilityActivationBlockerStage
  blockerCode: string
  message: string
  requiredEvidence: readonly string[]
}

/**
 * Capabilities that have a canonical public contract or governed workflow
 * surface but cannot truthfully acquire a production executor before the live
 * account exposes a compatible model and its exact request/response contract.
 *
 * These records never make a capability executable. They replace generic
 * NOT_IMPLEMENTED labels with the exact activation gate that staging must
 * prove. Adult and 3D capabilities are deliberately excluded because they are
 * deferred release scope, not activation candidates.
 */
export const CAPABILITY_ACTIVATION_BLOCKERS = [
  {
    capability: 'object_detection', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_OBJECT_DETECTION_MODEL_CONTRACT_REQUIRED',
    message: 'Authenticated DeepInfra discovery must expose an accessible object-detection model and its native request/response contract before registration.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'native_request_schema', 'normalized_detection_response', 'worker_fixture'],
  },
  {
    capability: 'image_segmentation', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_IMAGE_SEGMENTATION_MODEL_CONTRACT_REQUIRED',
    message: 'Authenticated DeepInfra discovery must expose an accessible segmentation model with a validated mask response contract.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'native_request_schema', 'mask_response_schema', 'worker_fixture'],
  },
  {
    capability: 'depth_estimation', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_DEPTH_MODEL_CONTRACT_REQUIRED',
    message: 'The provider-neutral depth workflow is fixture-proven; activation requires an accessible DeepInfra depth model plus validated depth artifact semantics.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'depth_request_schema', 'relative_or_metric_depth_contract', 'artifact_validation', 'worker_fixture'],
  },
  {
    capability: 'keypoint_detection', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_KEYPOINT_MODEL_CONTRACT_REQUIRED',
    message: 'The provider-neutral keypoint workflow is fixture-proven; activation requires an accessible model and non-fabricated keypoint response contract.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'keypoint_request_schema', 'keypoint_response_schema', 'worker_fixture'],
  },
  {
    capability: 'zero_shot_object_detection', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_ZERO_SHOT_DETECTION_MODEL_CONTRACT_REQUIRED',
    message: 'Activation requires an accessible zero-shot detector with candidate-label and bounding-box schemas proven against the live account.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'candidate_label_schema', 'bounding_box_response_schema', 'worker_fixture'],
  },
  {
    capability: 'mask_generation', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_MASK_MODEL_CONTRACT_REQUIRED',
    message: 'The governed mask workflow is fixture-proven; activation requires a compatible segmentation or mask model and validated binary-mask artifacts.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'guidance_schema', 'mask_artifact_contract', 'worker_fixture'],
  },
  {
    capability: 'visual_document_retrieval', provider: 'network', stage: 'internal_executor_selection',
    blockerCode: 'VISUAL_DOCUMENT_REGION_RETRIEVAL_EXECUTOR_REQUIRED',
    message: 'The ranked citation contract is fixture-proven, but production requires one approved region-aware document retrieval executor rather than text-only RAG substitution.',
    requiredEvidence: ['region_extraction_engine', 'page_coordinate_preservation', 'ranked_region_retrieval', 'citation_validation', 'worker_fixture'],
  },
  {
    capability: 'video_classification', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_VIDEO_CLASSIFICATION_MODEL_CONTRACT_REQUIRED',
    message: 'Activation requires an accessible video-classification route or a proven sampled-frame multimodal contract with explicit sampling evidence.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'sampling_contract', 'classification_response_schema', 'worker_fixture'],
  },
  {
    capability: 'audio_classification', provider: 'deepinfra', stage: 'staging_live_discovery',
    blockerCode: 'DEEPINFRA_AUDIO_CLASSIFICATION_MODEL_CONTRACT_REQUIRED',
    message: 'Activation requires an accessible audio-classification model and a normalized finite-score label contract.',
    requiredEvidence: ['authenticated_model_list', 'model_access_probe', 'audio_upload_schema', 'classification_response_schema', 'worker_fixture'],
  },
  {
    capability: 'voice_activity_detection', provider: 'network', stage: 'provider_contract_activation',
    blockerCode: 'VOICE_ACTIVITY_DETECTION_EXECUTOR_REQUIRED',
    message: 'A production VAD executor must return timestamped speech segments from authorised audio; generic transcription is not accepted as proof.',
    requiredEvidence: ['authorised_audio_input', 'timestamped_segment_contract', 'silence_threshold_evidence', 'worker_fixture'],
  },
  {
    capability: 'voice_clone', provider: 'genx', stage: 'staging_live_discovery',
    blockerCode: 'GENX_VOICE_CLONE_MODEL_SCHEMA_REQUIRED',
    message: 'Consent and Voice Profile governance are implemented; activation requires the account-visible GenX clone model ID and exact sample/upload/result schema.',
    requiredEvidence: ['authenticated_model_list', 'model_detail_schema', 'account_access_probe', 'consent_scope_enforcement', 'voice_profile_linkage', 'live_audio_artifact'],
  },
  {
    capability: 'voice_conversion', provider: 'genx', stage: 'staging_live_discovery',
    blockerCode: 'GENX_VOICE_CONVERSION_MODEL_SCHEMA_REQUIRED',
    message: 'Source ownership and conversion governance are implemented; activation requires the account-visible conversion model and exact audio input/result schema.',
    requiredEvidence: ['authenticated_model_list', 'model_detail_schema', 'account_access_probe', 'source_rights_enforcement', 'live_audio_artifact'],
  },
  {
    capability: 'text_to_audio', provider: 'genx', stage: 'staging_live_discovery',
    blockerCode: 'GENX_TEXT_TO_AUDIO_MODEL_SCHEMA_REQUIRED',
    message: 'Activation requires an account-visible GenX sound-effects or text-to-audio model with exact generation and downloadable-audio contracts.',
    requiredEvidence: ['authenticated_model_list', 'model_detail_schema', 'account_access_probe', 'audio_download_contract', 'live_audio_artifact'],
  },
  {
    capability: 'lip_sync', provider: 'genx', stage: 'staging_live_discovery',
    blockerCode: 'GENX_LIP_SYNC_MODEL_SCHEMA_REQUIRED',
    message: 'Avatar and voice rights governance exist; activation requires the exact GenX lip-sync model schema, authorised video/audio inputs and live output proof.',
    requiredEvidence: ['authenticated_model_list', 'model_detail_schema', 'account_access_probe', 'video_audio_rights_enforcement', 'live_video_artifact'],
  },
  {
    capability: 'avatar_generation', provider: 'genx', stage: 'staging_live_discovery',
    blockerCode: 'GENX_AVATAR_MODEL_SCHEMA_REQUIRED',
    message: 'Avatar Profile governance exists; activation requires the exact account-visible GenX avatar model schema and live governed output proof.',
    requiredEvidence: ['authenticated_model_list', 'model_detail_schema', 'account_access_probe', 'avatar_profile_enforcement', 'live_video_artifact'],
  },
] as const satisfies readonly CapabilityActivationBlocker[]

const BLOCKER_BY_CAPABILITY = new Map<CapabilityKey, CapabilityActivationBlocker>(
  CAPABILITY_ACTIVATION_BLOCKERS.map((blocker) => [blocker.capability, blocker]),
)

export function getCapabilityActivationBlocker(capability: CapabilityKey): CapabilityActivationBlocker | undefined {
  return BLOCKER_BY_CAPABILITY.get(capability)
}
