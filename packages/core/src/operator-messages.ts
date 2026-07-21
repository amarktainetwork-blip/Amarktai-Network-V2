const OPERATOR_MESSAGES: Record<string, string> = {
  executor_registration_missing: 'This model route still needs an execution adapter.',
  executor_missing: 'This capability still needs an execution adapter.',
  provider_health_not_ready: 'Provider connection is not responding.',
  provider_health_failed: 'Provider connection check failed.',
  request_shape_unknown: "This model's request format has not been verified.",
  response_shape_unknown: "This model's response format has not been verified.",
  credentials_missing: 'Provider setup is required.',
  infrastructure_missing: 'A required platform service is not ready.',
  live_proof_missing: 'This route has not completed a genuine live proof yet.',
  no_executor_compatible_catalogued_model: 'No currently accessible model has a verified execution contract.',
  app_requested_route_not_approved: 'The requested model route is not approved for this app.',
}
export function operatorMessage(reason: string): string { return OPERATOR_MESSAGES[reason] ?? reason.replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase()) + '.' }
