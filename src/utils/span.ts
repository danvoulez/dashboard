import { v4 as uuidv4 } from 'uuid'
import type { Span, SpanEvent } from '@/types'
import { saveSpan } from './db'
import { useAuthStore } from '@/stores/auth'

// Simple hash function (in production, use BLAKE3)
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface CreateSpanOptions {
  name: string
  kind?: Span['kind']
  traceId?: string
  parentSpanId?: string
  attributes?: Record<string, any>
}

export class SpanBuilder {
  private span: Span

  constructor(options: CreateSpanOptions) {
    const authStore = useAuthStore()

    this.span = {
      id: uuidv4(),
      traceId: options.traceId || uuidv4(),
      parentSpanId: options.parentSpanId,
      name: options.name,
      kind: options.kind || 'internal',
      startTime: new Date().toISOString(),
      status: 'pending',
      attributes: options.attributes || {},
      events: [],
      hash: '',
      userId: authStore.user?.id || 'anonymous'
    }
  }

  addEvent(name: string, attributes?: Record<string, any>): this {
    this.span.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes: attributes || {}
    })
    return this
  }

  setAttribute(key: string, value: any): this {
    this.span.attributes[key] = value
    return this
  }

  setAttributes(attributes: Record<string, any>): this {
    this.span.attributes = { ...this.span.attributes, ...attributes }
    return this
  }

  async end(status: 'ok' | 'error' = 'ok', error?: string): Promise<Span> {
    this.span.endTime = new Date().toISOString()
    this.span.status = status

    if (error) {
      this.span.attributes.error = error
    }

    // Compute hash
    const spanData = JSON.stringify({
      id: this.span.id,
      traceId: this.span.traceId,
      name: this.span.name,
      startTime: this.span.startTime,
      endTime: this.span.endTime,
      attributes: this.span.attributes,
      events: this.span.events
    })

    this.span.hash = await hashString(spanData)

    // Save to IndexedDB
    await saveSpan(this.span)

    return this.span
  }

  getSpan(): Span {
    return { ...this.span }
  }
}

export function createSpan(options: CreateSpanOptions): SpanBuilder {
  return new SpanBuilder(options)
}

// Track action with automatic span creation
export async function trackAction<T>(
  name: string,
  action: (span: SpanBuilder) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createSpan({ name, attributes })

  try {
    const result = await action(span)
    await span.end('ok')
    return result
  } catch (error) {
    await span.end('error', error instanceof Error ? error.message : String(error))
    throw error
  }
}

// Export spans as NDJSON
export function exportSpansAsNDJSON(spans: Span[]): string {
  return spans.map(span => JSON.stringify(span)).join('\n')
}

// Import spans from NDJSON
export function importSpansFromNDJSON(ndjson: string): Span[] {
  return ndjson
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}
