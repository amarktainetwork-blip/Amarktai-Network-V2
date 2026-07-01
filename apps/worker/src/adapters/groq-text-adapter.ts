/**
 * Groq text adapter — live integration for text.* capabilities.
 *
 * Handles: chat, reasoning, code, embeddings, reranking, research,
 *          multimodal, tool_use, structured_output
 *
 * Routes text capability requests to Groq's LLM inference API.
 * Saves response as a text artifact.
 */

import { saveArtifact } from '@amarktai/artifacts'
import { groqChat, type GroqChatRequest } from '@amarktai/providers'
import { GROQ_DEFAULT_MODEL } from '@amarktai/core'
import type { ProviderAdapter, ProviderExecutionContext, ProviderExecutionResult } from './provider-adapter.js'

export class GroqTextAdapter implements ProviderAdapter {
  name = 'groq'
  supportedPrefixes = ['text']

  async execute(context: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const request: GroqChatRequest = {
      prompt: context.prompt,
      model: GROQ_DEFAULT_MODEL,
      systemPrompt: this.buildSystemPrompt(context),
      maxTokens: (context.input.maxTokens as number) ?? 4096,
      temperature: (context.input.temperature as number) ?? 0.7,
    }

    const result = await groqChat(request)

    // Save response as text artifact
    const artifact = await saveArtifact({
      input: {
        appSlug: context.appSlug,
        type: 'document',
        subType: context.capability,
        title: `${context.capability} output for ${context.appSlug}`,
        description: `Groq ${context.capability} response`,
        provider: 'groq',
        model: result.model,
        traceId: context.traceId,
        mimeType: 'text/plain',
        metadata: {
          capability: context.capability,
          usage: result.usage,
          finishReason: result.finishReason,
        },
      },
      data: Buffer.from(result.content, 'utf-8'),
      explicitMimeType: 'text/plain',
    })

    return {
      success: true,
      provider: 'groq',
      model: result.model,
      artifactId: artifact.id,
      output: result.content,
      metadata: {
        artifactId: artifact.id,
        usage: result.usage,
        finishReason: result.finishReason,
      },
    }
  }

  private buildSystemPrompt(context: ProviderExecutionContext): string {
    const parts = [`You are a helpful AI assistant for the app '${context.appSlug}'.`]

    switch (context.capability) {
      case 'code':
        parts.push('Respond with clean, well-structured code. Use appropriate language syntax.')
        break
      case 'reasoning':
        parts.push('Think step by step. Show your reasoning process clearly.')
        break
      case 'research':
        parts.push('Provide thorough, well-sourced research responses.')
        break
      case 'structured_output':
        parts.push('Respond with valid JSON unless otherwise specified.')
        break
    }

    return parts.join(' ')
  }
}
