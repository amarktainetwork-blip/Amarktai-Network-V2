import { findCompletedArtifactByTraceId, getArtifactFile, getArtifactRecord, saveArtifact } from '@amarktai/artifacts'
import { DocumentIngestRequestSchema, inspectDocumentArtifact, type DocumentPageText } from '@amarktai/core'
import type { ProcessorResult, WorkerJobData } from './processors/job-processor.js'

function decodePdfString(value: string): string {
  return value.replace(/\\([()\\])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
}

function fallbackPdfPages(buffer: Buffer): DocumentPageText[] {
  const source = buffer.toString('latin1')
  const text = [...source.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((match) => decodePdfString(match[1] ?? '')).join(' ').trim()
  return text ? [{ page: 1, section: null, text, coordinates: null, parserEvidence: 'bounded_pdf_text_operator_fallback', ocrEvidence: null }] : []
}

async function extractPdfPages(buffer: Buffer, maxPages: number): Promise<DocumentPageText[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
    const pageCount = Math.min(document.numPages, maxPages)
    const pages: DocumentPageText[] = []
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.flatMap((item) => 'str' in item && typeof item.str === 'string' ? [item.str] : []).join(' ').replace(/\s+/g, ' ').trim()
      if (text) pages.push({ page: pageNumber, section: null, text, coordinates: null, parserEvidence: `pdfjs-dist@${pdfjs.version ?? 'pinned'}:text_layer`, ocrEvidence: null })
    }
    return pages
  } catch {
    return fallbackPdfPages(buffer)
  }
}

export async function executeDocumentExtraction(payload: WorkerJobData): Promise<ProcessorResult> {
  if (payload.capability !== 'document_ingest' || payload.metadata?.documentExtraction !== true || payload.metadata?.internalLocalExecution !== true) {
    return { success: false, status: 'failed', error: 'Invalid internal document extraction request' }
  }
  const existing = await findCompletedArtifactByTraceId(payload.traceId, 'document_extraction')
  if (existing) return { success: true, status: 'completed', provider: 'amarktai-network', model: 'document-inspection-v1', artifactId: existing.id, output: JSON.stringify({ extractionArtifactId: existing.id, reused: true }), metadata: { internalLocalExecution: true, reused: true } }
  try {
    const request = DocumentIngestRequestSchema.parse(payload.input ?? {})
    const source = await getArtifactRecord(request.sourceArtifactId)
    if (!source || source.appSlug !== payload.appSlug || source.status !== 'completed') throw new Error('Authorised source document was not found')
    const file = await getArtifactFile(source.id)
    if (!file?.buffer.length) throw new Error('Authorised source document bytes are missing')
    const inspection = inspectDocumentArtifact(file.buffer)
    let pages: DocumentPageText[] = []
    let ocrRequired = request.ocrMode === 'always'
    if (inspection.detectedMimeType === 'text/plain') {
      pages = [{ page: 1, section: null, text: file.buffer.toString('utf8').trim(), coordinates: null, parserEvidence: 'utf8_plain_text_v1', ocrEvidence: null }]
    } else if (inspection.detectedMimeType === 'application/pdf') {
      pages = await extractPdfPages(file.buffer, request.maxPages)
      if (!pages.length && request.ocrMode !== 'never') ocrRequired = true
    } else if (inspection.detectedMimeType.startsWith('image/')) {
      ocrRequired = request.ocrMode !== 'never'
    }
    if (!pages.length && !ocrRequired) throw new Error('Document contains no extractable text and OCR is disabled')
    const extraction = { version: 1, appSlug: payload.appSlug, documentId: request.documentId, sourceArtifactId: source.id, inspection, pages, ocrRequired, malwareSafeHandling: 'non_executing_parser_embedded_scripts_and_launch_actions_ignored', extractionLimits: { maxPages: request.maxPages, maxBytes: 50 * 1024 * 1024 }, partialPageFailures: [], extractedAt: new Date().toISOString() }
    const artifact = await saveArtifact({
      input: { appSlug: payload.appSlug, type: 'document', subType: 'document_extraction', title: `${request.title ?? request.documentId} extraction`, description: 'Inspected page-preserving document extraction evidence.', provider: 'amarktai-network', model: 'document-inspection-v1', traceId: payload.traceId, mimeType: 'application/json', metadata: { documentIngest: true, parentJobId: payload.metadata.parentJobId, executionId: payload.metadata.executionId, sourceArtifactId: source.id, checksum: inspection.checksum, pageCount: inspection.pageCount, ocrRequired } },
      data: Buffer.from(JSON.stringify(extraction, null, 2)), explicitMimeType: 'application/json',
    })
    return { success: true, status: 'completed', provider: 'amarktai-network', model: 'document-inspection-v1', artifactId: artifact.id, output: JSON.stringify({ extractionArtifactId: artifact.id, inspection, pages, ocrRequired, partialPageFailures: [] }), metadata: { internalLocalExecution: true, sourceArtifactId: source.id, outputValidation: { valid: true, contract: 'page_preserving_document_extraction_v1' } } }
  } catch (error) {
    return { success: false, status: 'failed', provider: 'amarktai-network', model: 'document-inspection-v1', error: error instanceof Error ? error.message : 'Document extraction failed', metadata: { internalLocalExecution: true } }
  }
}
