// Shared static data for the dashboard UI.
import { CAPABILITY_CONTRACTS, DASHBOARD_PAGES, ADVANCED_PAGES, PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'

export const PROVIDERS = PROVIDER_CONTRACTS

export const CAPABILITIES = CAPABILITY_CONTRACTS

export const READINESS = {
  api: 'contract_ready',
  database: 'backend_pending',
  redis: 'backend_pending',
  qdrant: 'backend_pending',
  providers: {
    genx: 'backend_pending',
    groq: 'backend_pending',
    together: 'backend_pending',
    mimo: 'runtime_disabled',
    deepinfra: 'backend_pending',
  },
}

export const MUSIC_GENRES = ['Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop', 'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae']

export const NAV = DASHBOARD_PAGES.map(({ href, label, icon }) => ({ href, label, icon }))

export const ADVANCED_NAV = ADVANCED_PAGES.map(({ href, label, icon }) => ({ href, label, icon }))
