export const MEDIA_TRUTH_CONTRACTS = [
  { capability: 'tts', mediaType: 'audio', proofRequired: 'provider_response_and_artifact', fallbackCountsAsProof: false },
  { capability: 'stt', mediaType: 'text', proofRequired: 'provider_response', fallbackCountsAsProof: false },
  { capability: 'music_generation', mediaType: 'audio', proofRequired: 'provider_response_and_artifact', fallbackCountsAsProof: false },
  { capability: 'avatar_generation', mediaType: 'video', proofRequired: 'provider_response_and_artifact', fallbackCountsAsProof: false },
  { capability: 'long_form_video', mediaType: 'video', proofRequired: 'provider_response_and_artifact', fallbackCountsAsProof: false },
  { capability: 'image_to_video', mediaType: 'video', proofRequired: 'provider_response_and_artifact', fallbackCountsAsProof: false },
]

export function fallbackMediaCanProveCapability(capability) {
  const contract = MEDIA_TRUTH_CONTRACTS.find((item) => item.capability === capability)
  return contract?.fallbackCountsAsProof === true
}
