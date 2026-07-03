'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Check, ChevronRight } from 'lucide-react'

export default function Stepper({ steps, onComplete }) {
  const [current, setCurrent] = useState(0)

  const next = () => {
    if (current < steps.length - 1) setCurrent(current + 1)
    else if (onComplete) onComplete()
  }
  const prev = () => { if (current > 0) setCurrent(current - 1) }
  const goTo = (i) => { if (i <= current) setCurrent(i) }

  return (
    <div className="flex flex-col h-full">
      {/* Step indicators */}
      <div className="flex items-center gap-1 mb-6 px-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center">
            <button
              onClick={() => goTo(i)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                i === current
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : i < current
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-pointer'
                    : 'bg-white/[0.03] text-muted-foreground border border-white/[0.06] cursor-default'
              )}
              disabled={i > current}
            >
              {i < current ? <Check className="h-3 w-3" /> : <span className="w-3 text-center text-[10px]">{i + 1}</span>}
              <span className="hidden sm:inline">{step.label}</span>
            </button>
            {i < steps.length - 1 && <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground/30" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        {steps[current]?.content}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] mt-4">
        <button
          onClick={prev}
          disabled={current === 0}
          className="rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default transition"
        >
          Back
        </button>
        <div className="text-[10px] text-muted-foreground">
          Step {current + 1} of {steps.length}
        </div>
        <button
          onClick={next}
          className="rounded-lg bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2 text-xs font-medium text-black hover:opacity-90 transition"
        >
          {current === steps.length - 1 ? 'Generate' : 'Next'}
        </button>
      </div>
    </div>
  )
}
