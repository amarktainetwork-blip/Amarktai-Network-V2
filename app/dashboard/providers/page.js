'use client'
import { PageHeader, PageTransition } from '@/components/amarkt/kit'; import { ProviderSettingsPanel } from '@/components/dashboard/provider-settings-panel'
export default function ProvidersPage(){return <PageTransition className="space-y-6"><PageHeader title="Providers" subtitle="Connections, discovery, account access and pricing for GenX, Together, DeepInfra and coding-only MiMo."/><ProviderSettingsPanel/></PageTransition>}
