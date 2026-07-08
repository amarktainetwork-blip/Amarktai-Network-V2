export const DESIGN_QUALITY_GATES = [
  { id: 'design_contract', label: 'Design contract', status: 'not_enforced', blocker: 'No V2 design compiler runtime is wired.' },
  { id: 'component_plan', label: 'Component plan', status: 'not_enforced', blocker: 'Component library selection remains a planning contract only.' },
  { id: 'creative_quality_gate', label: 'Creative quality gate', status: 'not_enforced', blocker: 'Premium design QA is not connected to job completion.' },
  { id: 'runtime_screenshot_qa', label: 'Runtime screenshot QA', status: 'not_enforced', blocker: 'Browser QA proof is not wired to V2 workers.' },
  { id: 'accessibility_expectation', label: 'Accessibility expectation', status: 'not_enforced', blocker: 'Axe/Lighthouse proof gates are not active in V2.' },
]

export function summarizeDesignQualityGates() {
  return {
    source: 'donor-pattern-app-builder-quality-gates',
    enforcedCount: DESIGN_QUALITY_GATES.filter((gate) => gate.status === 'enforced').length,
    plannedCount: DESIGN_QUALITY_GATES.length,
    gates: DESIGN_QUALITY_GATES,
  }
}
