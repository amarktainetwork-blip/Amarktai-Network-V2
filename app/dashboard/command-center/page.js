import { getStats, getEvents } from '@/lib/dataAccess'
import CommandCenterClient from './CommandCenterClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [stats, events] = await Promise.all([getStats(), getEvents()])
  return <CommandCenterClient initialStats={stats} initialEvents={events} />
}
