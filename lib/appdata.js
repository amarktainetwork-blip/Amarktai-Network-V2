// Shared static data for the dashboard UI.
import { CAPABILITY_CONTRACTS, DASHBOARD_PAGES, ADVANCED_PAGES, PROVIDER_CONTRACTS } from '@/lib/dashboard-contract'

export const PROVIDERS = PROVIDER_CONTRACTS

export const CAPABILITIES = CAPABILITY_CONTRACTS

export const MUSIC_GENRES = ['Pop', 'Rock', 'House', 'Amapiano', 'Afrobeat', 'Hip-Hop', 'Jazz', 'Lo-Fi', 'Techno', 'Cinematic', 'R&B', 'Reggae']

export const NAV = DASHBOARD_PAGES.map(({ href, label, icon }) => ({ href, label, icon }))

export const ADVANCED_NAV = ADVANCED_PAGES.map(({ href, label, icon }) => ({ href, label, icon }))
