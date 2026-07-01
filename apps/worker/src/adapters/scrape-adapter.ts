/**
 * Brand scraping adapter — Crawlee + Playwright for brand.scrape capability.
 *
 * Extracts from target corporate URLs:
 *   - Typography matrices (font families, sizes, weights)
 *   - Primary color balances (hex values from CSS)
 *   - Branding taglines (h1, h2, hero text)
 *   - Clean raw copy walls (main content paragraphs)
 *
 * Saves extracted summaries as structured .json config bundles
 * to the VPS artifact storage directories.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { prisma } from '@amarktai/db'
import { CRAWLEE_MAX_PAGES, CRAWLEE_TIMEOUT_MS } from '@amarktai/core'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandExtraction {
  url: string
  title: string
  taglines: string[]
  colors: string[]
  fonts: Array<{ family: string; size: string; weight: string }>
  rawCopy: string[]
  metadata: {
    pagesScraped: number
    extractedAt: string
    loadTimeMs: number
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ScrapeAdapter implements ProviderAdapter {
  name = 'crawlee'
  supportedPrefixes = ['scrape']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const url = context.prompt.trim()
    if (!url || !url.startsWith('http')) {
      throw new Error('brand.scrape requires a valid URL in the prompt field')
    }

    await this.updateJobStatus(context, 'processing', 10)

    // Run Crawlee extraction
    const extraction = await this.scrapeBrand(url, context)

    await this.updateJobStatus(context, 'processing', 80)

    // Save as structured JSON artifact
    const jsonBuffer = Buffer.from(JSON.stringify(extraction, null, 2), 'utf-8')

    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'document',
        subType: 'brand_scrape',
        title: `Brand extraction for ${new URL(url).hostname}`,
        description: `Crawlee brand scrape of ${url}`,
        provider: 'crawlee',
        model: 'playwright',
        traceId: context.traceId,
        mimeType: 'application/json',
        metadata: {
          capability: 'brand_scrape',
          url,
          pagesScraped: extraction.metadata.pagesScraped,
        },
      },
      data: jsonBuffer,
      explicitMimeType: 'application/json',
    })

    return {
      success: true,
      provider: 'crawlee',
      model: 'playwright',
      artifactId: artifact.id,
      output: JSON.stringify(extraction, null, 2),
      metadata: {
        artifactId: artifact.id,
        pagesScraped: extraction.metadata.pagesScraped,
        colorsFound: extraction.colors.length,
        fontsFound: extraction.fonts.length,
      },
    }
  }

  private async scrapeBrand(url: string, context: ProviderExecutionContext): Promise<BrandExtraction> {
    // Dynamic import to avoid loading Playwright in non-scrape contexts
    const { PlaywrightCrawler } = await import('crawlee')

    const taglines: Set<string> = new Set()
    const colors: Set<string> = new Set()
    const fonts: Map<string, { family: string; size: string; weight: string }> = new Map()
    const rawCopy: string[] = []
    let pageTitle = ''
    let pagesScraped = 0
    const startTime = Date.now()

    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: CRAWLEE_MAX_PAGES,
      requestHandlerTimeoutSecs: CRAWLEE_TIMEOUT_MS / 1000,
      async requestHandler({ page }) {
        pagesScraped++

        // Update progress
        const progress = Math.min(70, 10 + (pagesScraped / CRAWLEE_MAX_PAGES) * 60)
        await context.metadata // no-op to keep async context
        try {
          await prisma.job.update({
            where: { id: context.jobId },
            data: { progress: Math.round(progress) },
          })
        } catch { /* non-critical */ }

        // Extract title
        if (pagesScraped === 1) {
          pageTitle = await page.title()
        }

        // Extract taglines from h1, h2, hero sections
        const headingTexts = await page.$$eval(
          'h1, h2, [class*="hero"] h1, [class*="hero"] h2, [class*="tagline"], [class*="slogan"]',
          (els) => els.map((el) => (el as HTMLElement).innerText?.trim()).filter(Boolean),
        )
        for (const t of headingTexts) {
          if (t && t.length < 200) taglines.add(t)
        }

        // Extract colors from computed styles
        const extractedColors = await page.$$eval(
          'h1, h2, h3, a, button, [class*="primary"], [class*="brand"], [class*="hero"]',
          (els) => {
            const colorSet = new Set<string>()
            for (const el of els.slice(0, 50)) {
              const style = window.getComputedStyle(el)
              const color = style.color
              const bgColor = style.backgroundColor
              if (color && color !== 'rgb(0, 0, 0)') colorSet.add(color)
              if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'rgb(0, 0, 0)') colorSet.add(bgColor)
            }
            return Array.from(colorSet)
          },
        )
        for (const c of extractedColors) colors.add(c)

        // Extract font families
        const extractedFonts = await page.$$eval(
          'h1, h2, h3, p, a, span, button',
          (els) => {
            const fontMap = new Map<string, { family: string; size: string; weight: string }>()
            for (const el of els.slice(0, 100)) {
              const style = window.getComputedStyle(el)
              const key = `${style.fontFamily}|${style.fontSize}|${style.fontWeight}`
              if (!fontMap.has(key)) {
                fontMap.set(key, {
                  family: style.fontFamily,
                  size: style.fontSize,
                  weight: style.fontWeight,
                })
              }
            }
            return Array.from(fontMap.values())
          },
        )
        for (const f of extractedFonts) {
          const key = `${f.family}|${f.size}|${f.weight}`
          fonts.set(key, f)
        }

        // Extract raw copy from main content areas
        const contentTexts = await page.$$eval(
          'p, article p, main p, [class*="content"] p, [class*="about"] p',
          (els) => els.map((el) => (el as HTMLElement).innerText?.trim()).filter((t) => t && t.length > 30),
        )
        for (const t of contentTexts.slice(0, 20)) {
          if (t) rawCopy.push(t)
        }
      },
    })

    await crawler.run([url])

    // Convert RGB colors to hex
    const hexColors = Array.from(colors)
      .map((c) => this.rgbToHex(c))
      .filter(Boolean) as string[]
    const uniqueHexColors = [...new Set(hexColors)].slice(0, 20)

    return {
      url,
      title: pageTitle,
      taglines: Array.from(taglines).slice(0, 10),
      colors: uniqueHexColors,
      fonts: Array.from(fonts.values()).slice(0, 20),
      rawCopy: rawCopy.slice(0, 30),
      metadata: {
        pagesScraped,
        extractedAt: new Date().toISOString(),
        loadTimeMs: Date.now() - startTime,
      },
    }
  }

  private rgbToHex(rgb: string): string | null {
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
    if (!match) return null
    const [, r, g, b] = match as [string, string, string, string]
    return `#${[r, g, b].map((x) => parseInt(x, 10).toString(16).padStart(2, '0')).join('')}`
  }

  private async updateJobStatus(
    context: ProviderExecutionContext,
    status: string,
    progress: number,
  ): Promise<void> {
    try {
      await prisma.job.update({
        where: { id: context.jobId },
        data: {
          status,
          progress,
          ...(status === 'processing' ? { startedAt: new Date() } : {}),
        },
      })
    } catch { /* non-critical */ }
  }
}
