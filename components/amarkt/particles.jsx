'use client'

import { useEffect, useRef } from 'react'

/**
 * Lightweight canvas-based particle effect.
 * Uses requestAnimationFrame with automatic pause when tab is hidden.
 * Particles are small dots that drift slowly with subtle connections.
 * Designed for premium aesthetic without compromising LCP.
 */
export function ParticleField({ className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let animId
    let particles = []
    const PARTICLE_COUNT = 60
    const CONNECTION_DIST = 120

    function resize() {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }

    function createParticles() {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      particles = Array.from({ length: PARTICLE_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.4 + 0.1,
      }))
    }

    function draw() {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.12
            ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(34, 211, 238, ${p.opacity})`
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    createParticles()
    draw()

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animId)
      } else {
        draw()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('resize', () => { resize(); createParticles() })

    return () => {
      cancelAnimationFrame(animId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
