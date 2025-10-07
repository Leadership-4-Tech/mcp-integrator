import express from 'express'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js'
import { ZodSchema } from 'zod'

/**
 * A value that can be serialized to JSON
 */
export type JsonAble =
  | string
  | number
  | boolean
  | null
  | JsonAble[]
  | { [key: string]: JsonAble }

/**
 * Base configuration for an MCP instance
 */
export type McpConfig = Readonly<{
  transport: Transport
  capabilities?: ClientCapabilities
}>

/**
 * Supported AI providers
 */
export enum Provider {
  Claude = 'claude',
  OpenAI = 'openai',
  AwsBedrockClaude = 'aws-bedrock-claude',
}
type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }

type XOR<T, U> = T | U extends object
  ? (Without<T, U> & U) | (Without<U, T> & T)
  : T | U

/**
 * Definition of an MCP tool
 */
export type McpTool = Readonly<{
  name: string
  description: string
  inputSchema: XOR<OpenAPISchema, ZodSchema>
  outputSchema?: XOR<OpenAPISchema, ZodSchema>
}>

/**
 * CLI connection configuration
 */
export type CliConnection = Readonly<{
  type: 'cli'
  path: string
  args?: string[]
  env?: Readonly<Record<string, string>>
  cwd?: string
}>

/**
 * SSE connection configuration
 */
export type SseConnection = Readonly<{
  type: 'sse'
  url: string
}>

/**
 * HTTP connection configuration
 */
export type HttpConnection = Readonly<{
  type: 'http'
  url: string
  headers?: Readonly<Record<string, string>>
  timeout?: number
  retry?: Readonly<{
    attempts: number
    backoff: number
  }>
}>

/**
 * WebSocket connection configuration
 */
export type WsConnection = Readonly<{
  type: 'ws'
  url: string
  protocols?: Readonly<string[]>
  headers?: Readonly<Record<string, string>>
  reconnect?: Readonly<{
    attempts: number
    backoff: number
  }>
}>

/**
 * Union type of all possible connection types
 */
export type Connection =
  | CliConnection
  | HttpConnection
  | WsConnection
  | SseConnection

/**
 * MCP Integrator configuration
 */
export type McpIntegratorConfig = Readonly<{
  connection: Connection
  provider: Provider
  model?: string
  modelId?: string
  includeListToolsTool?: boolean
  maxParallelCalls?: number
}>

/**
 * HTTP server configuration
 */
export type HttpServerConfig = Readonly<{
  connection: Readonly<{
    type: 'http'
    url: string
    port?: number
    headers?: Readonly<Record<string, string>>
    timeout?: number
    retry?: Readonly<{
      attempts: number
      backoff: number
    }>
  }>
  /** Path to handle MCP requests. Defaults to '/' */
  path?: string
}>

/**
 * WebSocket server configuration
 */
export type WsServerConfig = Readonly<{
  connection: WsConnection
}>

/**
 * CLI server configuration
 */
export type CliServerConfig = Readonly<{
  connection: {
    type: 'cli'
  }
}>

/**
 * SSE server configuration
 */
export type SseServerConfig = Readonly<{
  connection: Readonly<{
    type: 'sse'
    url: string
    port?: number
  }>
  /** Path to establish SSE connection. Defaults to '/' */
  path?: string
  /** Path to handle SSE messages. Defaults to '/messages' */
  messagesPath?: string
}>

/**
 * Union type of all possible server configurations
 */
export type ServerConfig =
  | HttpServerConfig
  | WsServerConfig
  | CliServerConfig
  | SseServerConfig

/**
 * Base configuration for MCP Aggregator
 */
export type McpAggregatorConfigBase = Readonly<{
  mcps: Readonly<
    Readonly<{
      id: string
      connection: Connection
    }>[]
  >
  maxParallelCalls?: number
}>

/**
 * Configuration for an HTTP server
 */
export type ServerHttpConfig = Readonly<{
  server: HttpServerConfig
}>

/**
 * Configuration for a stateless HTTP server
 */
export type ServerStatelessHttpConfig = Readonly<{
  server: HttpServerConfig
  stateless: true
}>

/**
 * Configuration for a WebSocket server
 */
export type ServerWsConfig = Readonly<{
  server: WsServerConfig
}>

/**
 * Configuration for a CLI server
 */
export type ServerCliConfig = Readonly<{
  server: CliServerConfig
}>

/**
 * Configuration for a SSE server
 */
export type ServerSseConfig = Readonly<{
  server: SseServerConfig
}>

export type McpAggregatorHttpConfig = McpAggregatorConfigBase & ServerHttpConfig
export type McpAggregatorWsConfig = McpAggregatorConfigBase & ServerWsConfig
export type McpAggregatorCliConfig = McpAggregatorConfigBase & ServerCliConfig
export type McpAggregatorSseConfig = McpAggregatorConfigBase & ServerSseConfig

/**
 * Union type of all possible MCP Aggregator configurations
 */
export type McpAggregatorConfig =
  | McpAggregatorHttpConfig
  | McpAggregatorWsConfig
  | McpAggregatorCliConfig
  | McpAggregatorSseConfig

/**
 * Full configuration for both MCP Integrator and Aggregator
 */
export type McpIntegratorFullConfig = Readonly<{
  integrator: McpIntegratorConfig
  aggregator: McpAggregatorConfig
}>

/**
 * Current version of the MCP library
 */
export const LibraryVersion = '1.1.1'

/**
 * Default client configurations for MCP Integrator and Aggregator
 */
export const McpClientConfigs = {
  integrator: {
    name: 'mcp-integrator',
    version: LibraryVersion,
  },
  aggregator: {
    name: 'mcp-aggregator',
    version: LibraryVersion,
  },
} as const

/**
 * OpenAPI schema definition for tool parameters
 */
export type OpenAPISchema = Readonly<{
  type: 'object'
  properties: Readonly<
    Record<
      string,
      {
        type: string
        description?: string
        enum?: Readonly<string[]>
        /**
         * If true, the value can be null in addition to its type
         */
        nullable?: boolean
      }
    >
  >
  required?: Readonly<string[]>
}>

export type ExpressRoute = Readonly<{
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  handler: (req: express.Request, res: express.Response) => Promise<void>
}>

export type ExpressMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => Promise<void>

export type ExpressOptions = Readonly<{
  additionalRoutes?: ExpressRoute[]
  preRouteMiddleware?: ExpressMiddleware[]
  afterRouteCallback?: (
    req: express.Request,
    res: express.Response
  ) => Promise<void> | void
  limit?: string
  jsonBodyParser?: {
    limit?: string
    strict?: boolean
  }
}>
