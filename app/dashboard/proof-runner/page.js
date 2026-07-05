'use client'
import { PageTransition, PageHeader } from '@/components/amarkt/kit'
import { EmptyState } from '@/components/amarkt/EmptyState'
import { Button } from '@/components/ui/button'
import { Boxes, Lock } from 'lucide-react'
import Link from 'next/link'

export default function ProofRunnerPage() {
  return (
    <PageTransition className="space-y-8">
      <PageHeader title="Proof Runner" subtitle="Artifact proof will appear after the Fastify backend exposes real job and artifact data." />

      <EmptyState
        icon={Boxes}
        title="Backend Integration Pending"
        description="Simulation artifacts were removed. This page should connect to real /api/v1 job and artifact endpoints before showing proof."
        action={
          <Link href="/dashboard/studio">
            <Button variant="outline" disabled className="border-white/10">
              <Lock className="mr-1.5 h-4 w-4" /> Real artifact backend pending
            </Button>
          </Link>
        }
      />
    </PageTransition>
  )
}
