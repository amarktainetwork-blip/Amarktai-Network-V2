import { DIRECT_EXECUTOR_HANDLERS } from './direct-provider-executor.js'
import { executeDeepInfraVisionCapability } from './deepinfra-vision-executor.js'

// Registration remains transport/capability based. Runtime model selection is
// still owned by Orchestra and live model metadata; no model ID is fixed here.
DIRECT_EXECUTOR_HANDLERS['deepinfra.vision'] = executeDeepInfraVisionCapability
