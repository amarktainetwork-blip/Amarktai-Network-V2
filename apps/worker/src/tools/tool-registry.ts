import { prisma } from '@amarktai/db'
import { getArtifactRecord } from '@amarktai/artifacts'
import type { AppCapabilityGrantContext } from '@amarktai/core'
import type { OpenAiToolDefinition } from '@amarktai/providers'

export const INTERNAL_TOOL_DEFINITIONS: readonly OpenAiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'calculator',
      description: 'Evaluate a finite arithmetic expression using numbers, parentheses, +, -, *, /, and ^.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', minLength: 1, maxLength: 500 } },
        required: ['expression'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'platform_health',
      description: 'Return a safe current summary of database and approved provider health.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'artifact_metadata',
      description: 'Look up safe metadata for one artifact owned by the calling app.',
      parameters: {
        type: 'object',
        properties: { artifactId: { type: 'string', format: 'uuid' } },
        required: ['artifactId'],
        additionalProperties: false,
      },
    },
  },
] as const

export type InternalToolName = 'calculator' | 'platform_health' | 'artifact_metadata'

export interface InternalToolContext {
  appSlug: string
  grant: AppCapabilityGrantContext
}

export async function executeInternalTool(
  name: string,
  rawArguments: string,
  context: InternalToolContext,
): Promise<Record<string, unknown>> {
  const args = parseArguments(rawArguments)
  if (name === 'calculator') {
    const expression = typeof args.expression === 'string' ? args.expression.trim() : ''
    if (!expression || expression.length > 500) throw new Error('calculator.expression is required and must be at most 500 characters')
    return { expression, result: evaluateArithmetic(expression) }
  }

  if (name === 'platform_health') {
    if (Object.keys(args).length > 0) throw new Error('platform_health accepts no arguments')
    const providers = await prisma.aiProvider.findMany({
      select: { providerKey: true, enabled: true, healthStatus: true, lastCheckedAt: true },
    })
    return {
      database: 'reachable',
      providers: providers.map((provider) => ({
        provider: provider.providerKey,
        enabled: provider.enabled,
        health: provider.healthStatus,
        lastCheckedAt: provider.lastCheckedAt?.toISOString() ?? null,
      })),
      checkedAt: new Date().toISOString(),
    }
  }

  if (name === 'artifact_metadata') {
    if (!context.grant.artifactRead) throw new Error('AppCapabilityGrant denies artifact read')
    const artifactId = typeof args.artifactId === 'string' ? args.artifactId : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(artifactId)) {
      throw new Error('artifact_metadata.artifactId must be a UUID')
    }
    const artifact = await getArtifactRecord(artifactId)
    if (!artifact || artifact.appSlug !== context.appSlug) throw new Error('Artifact not found')
    return {
      id: artifact.id,
      type: artifact.type,
      subType: artifact.subType,
      mimeType: artifact.mimeType,
      fileSizeBytes: artifact.fileSizeBytes,
      provider: artifact.provider,
      model: artifact.model,
      status: artifact.status,
      createdAt: artifact.createdAt.toISOString(),
    }
  }

  throw new Error(`Tool '${name}' is not registered`)
}

export function getInternalToolDefinitions(allowed: string[]): OpenAiToolDefinition[] {
  const allowedSet = new Set(allowed)
  return INTERNAL_TOOL_DEFINITIONS.filter((definition) => allowedSet.has(definition.function.name))
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('arguments must be an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('Tool arguments are not valid JSON')
  }
}

function evaluateArithmetic(expression: string): number {
  const tokens = tokenize(expression)
  let position = 0
  const parseExpression = (): number => {
    let value = parseTerm()
    while (tokens[position] === '+' || tokens[position] === '-') {
      const operator = tokens[position++]!
      const right = parseTerm()
      value = operator === '+' ? value + right : value - right
    }
    return value
  }
  const parseTerm = (): number => {
    let value = parsePower()
    while (tokens[position] === '*' || tokens[position] === '/') {
      const operator = tokens[position++]!
      const right = parsePower()
      if (operator === '/' && right === 0) throw new Error('Division by zero')
      value = operator === '*' ? value * right : value / right
    }
    return value
  }
  const parsePower = (): number => {
    let value = parseUnary()
    if (tokens[position] === '^') {
      position++
      value = value ** parsePower()
    }
    return value
  }
  const parseUnary = (): number => {
    if (tokens[position] === '+') { position++; return parseUnary() }
    if (tokens[position] === '-') { position++; return -parseUnary() }
    return parsePrimary()
  }
  const parsePrimary = (): number => {
    const token = tokens[position++]
    if (token === '(') {
      const value = parseExpression()
      if (tokens[position++] !== ')') throw new Error('Unbalanced parentheses')
      return value
    }
    const value = Number(token)
    if (!Number.isFinite(value)) throw new Error('Invalid arithmetic expression')
    return value
  }
  const result = parseExpression()
  if (position !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid or non-finite arithmetic result')
  return result
}

function tokenize(expression: string): string[] {
  if (!/^[0-9eE+\-*/^().\s]+$/.test(expression)) throw new Error('Unsupported calculator character')
  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?|[+\-*/^()]/g) ?? []
  if (tokens.join('').length !== expression.replace(/\s+/g, '').length || tokens.length === 0) throw new Error('Invalid arithmetic expression')
  return tokens
}
