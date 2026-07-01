import { getConnections } from '@/lib/dataAccess'
import AppConnectionsClient from './AppConnectionsClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const connections = await getConnections()
  return <AppConnectionsClient initialConnections={connections} />
}
