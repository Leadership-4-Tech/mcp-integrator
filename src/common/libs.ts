import { z, ZodSchema, ZodType } from 'zod'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

import { Connection } from './types.js'

export const toMcpConfig = (
  connection: Connection
): StreamableHTTPClientTransportOptions => {
  if (connection.type === 'http') {
    return {
      requestInit: {
        headers: connection.headers,
        signal: connection.timeout
          ? AbortSignal.timeout(connection.timeout)
          : undefined,
      },
      reconnectionOptions: connection.retry
        ? {
            maxReconnectionDelay: connection.retry.backoff,
            initialReconnectionDelay: 1000,
            reconnectionDelayGrowFactor: 1.5,
            maxRetries: connection.retry.attempts,
          }
        : undefined,
    }
  }
  throw new Error(`Unsupported connection type: ${connection.type}`)
}

export const createTransport = (connection: Connection) => {
  if (connection.type === 'http') {
    return new StreamableHTTPClientTransport(new URL(connection.url))
  }
  if (connection.type === 'ws') {
    return new WebSocketClientTransport(new URL(connection.url))
  }
  if (connection.type === 'cli') {
    return new StdioClientTransport({
      command: connection.path,
      args: connection.args,
      env: connection.env,
      cwd: connection.cwd,
    })
  }
  if (connection.type === 'sse') {
    return new SSEClientTransport(new URL(connection.url))
  }
  throw new Error(
    `Unsupported connection type: ${(connection as { type: string }).type}`
  )
}

/**
 * Defensive preprocessor for Zod schemas.
 * Some MCP clients (like Kai) stringify arrays in JSON-RPC requests.
 * This creates a pre-processor that attempts to parse stringified JSON before validation.
 */
const createStringifiedPreprocessor = (innerType: ZodType): ZodType => {
  return z.preprocess(
    (val) => {
      // If it's a string, try to parse it as JSON
      if (typeof val === 'string') {
        try {
          return JSON.parse(val)
        } catch {
          return val // Return as-is if not valid JSON
        }
      }
      return val // Return as-is if not a string
    },
    innerType
  ) as unknown as ZodType
}

export const openApiToZodSchema = (
  parameters: any
): Record<string, ZodType> => {
  const { properties, required } = parameters

  if (!properties) {
    return {}
  }

  return Object.entries(properties).reduce(
    (acc, [key, propDef]: [string, any]) => {
      // Create the Zod field and apply optional if needed
      const zodField = createZodTypeFromDefinition(propDef)
      const finalField = !required?.includes(key)
        ? zodField.optional()
        : zodField

      // Return new accumulated object with this field
      return { ...acc, [key]: finalField }
    },
    {}
  )
}

// Break complex handling into small helpers to satisfy lint rules
const buildUnionFromArray = (arr: any[]) => {
  const members = arr.map(createZodTypeFromDefinition)
  if (members.length === 1) {
    return members[0]
  }
  return z.union(
    members as unknown as [any, any, ...any[]]
  ) as unknown as ZodType
}

const buildIntersectionFromArray = (arr: any[]) => {
  if (arr.length === 0) {
    return z.any()
  }
  return arr
    .map(createZodTypeFromDefinition)
    .reduce((acc, member) => z.intersection(acc as any, member as any))
}

const createEnumOrLiterals = (
  enumValues: any[] | undefined,
  preferredType: 'string' | 'number' | 'boolean' | null
) => {
  if (!Array.isArray(enumValues) || enumValues.length === 0) {
    return null
  }
  if (
    preferredType === 'string' &&
    enumValues.every(v => typeof v === 'string')
  ) {
    return z.enum(enumValues as [string, ...string[]]) as ZodType
  }
  const literals = enumValues.map((v: unknown) => z.literal(v as any))
  if (literals.length === 1) {
    return literals[0]
  }
  return z.union(
    literals as unknown as [any, any, ...any[]]
  ) as unknown as ZodType
}

// Single function to handle all types of definitions
const createZodTypeFromDefinition = (def: any): ZodType => {
  if (!def || typeof def !== 'object') {
    return z.any()
  }

  const {
    type,
    items,
    nullable,
    anyOf,
    oneOf,
    allOf,
    enum: enumValues,
    format,
  } = def

  // Handle combinators first
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    return buildUnionFromArray(anyOf)
  }
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return buildUnionFromArray(oneOf)
  }
  if (Array.isArray(allOf) && allOf.length > 0) {
    return buildIntersectionFromArray(allOf)
  }

  // Compute by base type
  const zodType: ZodType = (() => {
    switch (type) {
      case 'string': {
        const enumType = createEnumOrLiterals(enumValues, 'string')
        const base = enumType ?? z.string()
        if (format === 'date-time' && (base as any).datetime) {
          return (base as any).datetime()
        }
        return base
      }
      case 'number':
      case 'integer': {
        const enumType = createEnumOrLiterals(enumValues, 'number')
        return enumType ?? z.number()
      }
      case 'boolean': {
        const enumType = createEnumOrLiterals(enumValues, 'boolean')
        return enumType ?? z.boolean()
      }
      case 'array': {
        // Wrap arrays with stringified JSON preprocessor to handle Kai's serialization
        const innerArray = z.array(items ? createZodTypeFromDefinition(items) : z.any())
        return createStringifiedPreprocessor(innerArray)
      }
      case 'object': {
        // Wrap objects with stringified JSON preprocessor to handle Kai's serialization
        const innerObject = z.object(openApiToZodSchema(def)).passthrough()
        return createStringifiedPreprocessor(innerObject)
      }
      default: {
        const enumType = createEnumOrLiterals(enumValues, null)
        return enumType ?? z.any()
      }
    }
  })()

  if (nullable) {
    return zodType.nullable()
  }
  return zodType
}

export const isZodSchema = (schema: any): schema is ZodSchema => {
  return schema instanceof ZodSchema
}
