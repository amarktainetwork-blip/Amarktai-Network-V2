export const REPO_WORKBENCH_ACTIONS = [
  {
    id: 'analyze',
    label: 'Repo analyze',
    endpoint: '/api/admin/repo-workbench/analyze',
    enabled: false,
    blocker: 'Backend repo workspace import, storage isolation, and analysis queue are not wired in V2.',
  },
  {
    id: 'repair-plan',
    label: 'Repair plan',
    endpoint: '/api/admin/repo-workbench/repair-plan',
    enabled: false,
    blocker: 'Repair planning must run through V2 job/approval policy before edits are allowed.',
  },
  {
    id: 'diff',
    label: 'Diff',
    endpoint: '/api/admin/repo-workbench/diff',
    enabled: false,
    blocker: 'No V2 repo workspace diff store is wired yet.',
  },
  {
    id: 'checks',
    label: 'Checks',
    endpoint: '/api/admin/repo-workbench/checks',
    enabled: false,
    blocker: 'Check execution must be isolated and audited before dashboard use.',
  },
  {
    id: 'pr',
    label: 'PR creation',
    endpoint: '/api/admin/repo-workbench/pr',
    enabled: false,
    blocker: 'PR creation is blocked until GitHub credentials, branch policy, and approval gates are wired.',
  },
]

export function getRepoWorkbenchAction(actionId) {
  return REPO_WORKBENCH_ACTIONS.find((action) => action.id === actionId) ?? null
}

export function repoWorkbenchActionResponse(actionId) {
  const action = getRepoWorkbenchAction(actionId)
  if (!action) {
    return {
      status: 404,
      body: { error: true, message: 'Unknown Repo Workbench action.' },
    }
  }

  return {
    status: 501,
    body: {
      error: true,
      action: action.id,
      enabled: false,
      message: `${action.label} is not ready in V2.`,
      blocker: action.blocker,
      fakeSuccess: false,
    },
  }
}
