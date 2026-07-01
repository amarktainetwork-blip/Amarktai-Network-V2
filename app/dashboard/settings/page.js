import { getSettings } from '@/lib/dataAccess'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const settings = await getSettings()
  return <SettingsClient initialSettings={settings} />
}
