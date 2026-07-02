'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Theme Colors
const COLOR_WANDERING = { r: 70, g: 90, b: 120 }
const COLOR_AI = { r: 34, g: 211, b: 238 }

export default function ParticleEntry({ onComplete }) {
  const canvasRef = useRef(null)
  const textCanvasRef = useRef(null)
  const [phase, setPhase] = useState('animating') // animating | dispersing | done
  const particlesRef = useRef([])
  const stateRef = useRef('WANDERING')
  const animFrameRef = useRef(null)
  const timeoutsRef = useRef([])

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const textCanvas = textCanvasRef.current
    if (!canvas || !textCanvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const textCtx = textCanvas.getContext('2d', { willReadFrequently: true })

    let width, height
    let particles = []

    class Particle {
      constructor(targetX, targetY, color, isAI) {
        this.x = Math.random() * width
        this.y = Math.random() * height
        this.vx = (Math.random() - 0.5) * 1.5
        this.vy = (Math.random() - 0.5) * 1.5
        this.targetX = targetX
        this.targetY = targetY
        this.color = { ...COLOR_WANDERING }
        this.targetColor = color
        this.size = Math.random() * 1.5 + 1
        this.friction = 0.88
        this.ease = Math.random() * 0.008 + 0.004
        this.isAI = isAI
      }

      update() {
        const state = stateRef.current
        if (state === 'WANDERING') {
          this.float()
        } else if (state === 'FORMING_BASE') {
          if (this.isAI) {
            this.float()
          } else {
            this.formToTarget()
          }
        } else if (state === 'FORMING_AI') {
          this.formToTarget()
        } else if (state === 'HOLDING') {
          this.holdTarget()
        } else if (state === 'DISPERSING') {
          this.disperse()
        }
      }

      float() {
        this.x += this.vx
        this.y += this.vy
        if (this.x < 0 || this.x > width) this.vx *= -1
        if (this.y < 0 || this.y > height) this.vy *= -1
      }

      formToTarget() {
        const dx = this.targetX - this.x
        const dy = this.targetY - this.y
        this.vx += dx * this.ease
        this.vy += dy * this.ease
        this.vx *= this.friction
        this.vy *= this.friction
        this.x += this.vx
        this.y += this.vy
        this.color = this.lerpColor(this.color, this.targetColor, 0.04)
      }

      holdTarget() {
        this.x = this.targetX
        this.y = this.targetY
        this.color = this.targetColor
      }

      disperse() {
        this.x += this.vx
        this.y += this.vy
        this.size *= 0.985
      }

      draw(context) {
        if (this.size < 0.1) return
        context.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`
        context.fillRect(this.x, this.y, this.size, this.size)
      }

      lerpColor(c1, c2, amt) {
        return {
          r: Math.round(c1.r + (c2.r - c1.r) * amt),
          g: Math.round(c1.g + (c2.g - c1.g) * amt),
          b: Math.round(c1.b + (c2.b - c1.b) * amt),
        }
      }
    }

    function initParticles() {
      particles = []
      particlesRef.current = particles
      textCtx.clearRect(0, 0, width, height)

      const fontSize1 = Math.min(width * 0.07, 80)
      const fontSize2 = Math.min(width * 0.18, 220)
      const fontSize3 = Math.min(width * 0.09, 100)

      textCtx.textBaseline = 'top'
      const spacing1 = 40
      const spacing2 = 40

      const totalHeight = fontSize1 + spacing1 + fontSize2 + spacing2 + fontSize3
      const startY = (height / 2) - (totalHeight / 2)

      textCtx.textAlign = 'center'
      textCtx.font = `bold ${fontSize1}px 'Space Grotesk', sans-serif`
      textCtx.fillStyle = '#ffffff'
      textCtx.fillText('Welcome to', width / 2, startY)

      const line2Y = startY + fontSize1 + spacing1
      textCtx.font = `900 ${fontSize2}px 'Space Grotesk', sans-serif`

      const textAmarkt = 'Amarkt'
      const textAI = 'AI'
      const widthAmarkt = textCtx.measureText(textAmarkt).width
      const widthAI = textCtx.measureText(textAI).width
      const startX = (width / 2) - ((widthAmarkt + widthAI) / 2)

      textCtx.textAlign = 'left'
      textCtx.fillStyle = '#ffffff'
      textCtx.fillText(textAmarkt, startX, line2Y)

      textCtx.fillStyle = `rgb(${COLOR_AI.r}, ${COLOR_AI.g}, ${COLOR_AI.b})`
      textCtx.fillText(textAI, startX + widthAmarkt, line2Y)

      const line3Y = line2Y + fontSize2 + spacing2
      textCtx.textAlign = 'center'
      textCtx.font = `bold ${fontSize3}px 'Space Grotesk', sans-serif`
      textCtx.fillStyle = '#ffffff'
      textCtx.fillText('Network', width / 2, line3Y)

      const imageData = textCtx.getImageData(0, 0, width, height)
      const data = imageData.data
      const gap = 2

      for (let y = 0; y < height; y += gap) {
        for (let x = 0; x < width; x += gap) {
          const index = (y * width + x) * 4
          const alpha = data[index + 3]

          if (alpha > 128) {
            const r = data[index]
            const g = data[index + 1]
            const b = data[index + 2]
            const isAI = (r < 100 && g > 150 && b > 180)
            particles.push(new Particle(x, y, { r, g, b }, isAI))
          }
        }
      }
      particlesRef.current = particles
    }

    function startDispersing() {
      stateRef.current = 'DISPERSING'
      setPhase('dispersing')
      const centerX = width / 2
      const centerY = height / 2

      particles.forEach(p => {
        const dx = p.x - centerX
        const dy = p.y - centerY
        const angle = Math.atan2(dy, dx)
        const blast = Math.random() * 2 + 0.5
        p.vx = Math.cos(angle) * blast
        p.vy = Math.sin(angle) * blast
      })

      const t = setTimeout(() => {
        stateRef.current = 'LOADED'
        setPhase('done')
        if (onComplete) onComplete()
      }, 3000)
      timeoutsRef.current.push(t)
    }

    function triggerInteraction() {
      if (stateRef.current === 'WANDERING') {
        stateRef.current = 'FORMING_BASE'
        const t1 = setTimeout(() => {
          stateRef.current = 'FORMING_AI'
          const t2 = setTimeout(() => {
            stateRef.current = 'HOLDING'
            const t3 = setTimeout(() => {
              startDispersing()
            }, 8000)
            timeoutsRef.current.push(t3)
          }, 1000)
          timeoutsRef.current.push(t2)
        }, 4000)
        timeoutsRef.current.push(t1)
      }
    }

    function forceDisperse() {
      if (stateRef.current === 'HOLDING' || stateRef.current === 'FORMING_AI') {
        clearAllTimeouts()
        startDispersing()
      }
    }

    function resize() {
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
      textCanvas.width = width
      textCanvas.height = height

      if (stateRef.current === 'WANDERING') {
        initParticles()
      }
    }

    function animate() {
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < particles.length; i++) {
        particles[i].update()
        particles[i].draw(ctx)
      }
      animFrameRef.current = requestAnimationFrame(animate)
    }

    // Initialize
    resize()
    animate()

    // Trigger on first interaction
    const interactionHandler = () => {
      if (stateRef.current === 'WANDERING') triggerInteraction()
    }
    const skipHandler = () => {
      if (stateRef.current === 'HOLDING') forceDisperse()
    }

    ;['mousemove', 'mousedown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, interactionHandler, { once: true })
    })
    ;['mousedown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, skipHandler)
    })
    window.addEventListener('resize', resize)

    // Auto-start after a short delay
    const autoStart = setTimeout(() => {
      if (stateRef.current === 'WANDERING') triggerInteraction()
    }, 1500)
    timeoutsRef.current.push(autoStart)

    return () => {
      clearAllTimeouts()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
      ;['mousemove', 'mousedown', 'touchstart'].forEach(evt => {
        window.removeEventListener(evt, interactionHandler)
        window.removeEventListener(evt, skipHandler)
      })
    }
  }, [onComplete, clearAllTimeouts])

  return (
    <>
      {/* Hidden canvas for reading text pixel data */}
      <canvas
        ref={textCanvasRef}
        style={{ display: 'none' }}
      />

      {/* Main visible animation canvas */}
      <canvas
        ref={canvasRef}
        id="particleCanvas"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 50,
          pointerEvents: phase === 'done' ? 'none' : 'auto',
          opacity: phase === 'done' ? 0 : 1,
          transition: 'opacity 2s ease-in-out',
        }}
      />
    </>
  )
}
