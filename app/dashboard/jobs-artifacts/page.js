import { getJobs, getArtifacts } from '@/lib/dataAccess'
import JobsArtifactsClient from './JobsArtifactsClient'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [jobs, artifacts] = await Promise.all([getJobs(), getArtifacts()])
  return <JobsArtifactsClient initialJobs={jobs} initialArtifacts={artifacts} />
}
