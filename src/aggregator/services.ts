import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { asyncMap } from 'modern-async'
import {
  McpAggregatorConfig,
  McpClientConfigs,
  Connection,
} from '../common/types.js'
import { createTransport } from '../common/libs.js'

const DEFAULT_MAX_PARALLEL_CALLS = 10

/**
 * Defensive parser for stringified JSON values in params.
 * Some MCP clients (like Kai) may stringify arrays/objects in the JSON-RPC request.
 * This recursively walks params and parses any stringified JSON.
 */
const parseStringifiedParams = (value: unknown): unknown => {
  // If it's a string, try to parse it as JSON
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      // Recursively parse the result (in case of nested stringification)
      return parseStringifiedParams(parsed)
    } catch {
      // Not valid JSON, return as-is
      return value
    }
  }
  // If it's an array, recursively parse each element
  if (Array.isArray(value)) {
    return value.map(parseStringifiedParams)
  }
  // If it's an object, recursively parse each value
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      // eslint-disable-next-line functional/immutable-data
      acc[key] = parseStringifiedParams(val)
      return acc
    }, {} as Record<string, unknown>)
  }
  // Primitive value, return as-is
  return value
}

const create = (config: McpAggregatorConfig) => {
  // eslint-disable-next-line functional/no-let
  let clients: Record<string, Client> = {}
  // eslint-disable-next-line functional/no-let
  let toolToClient: Record<string, Client> = {}

  const createClient = async (connection: Connection) => {
    const transport = createTransport(connection)
    const client = new Client(McpClientConfigs.integrator)
    await client.connect(transport)
    return client
  }

  return {
    connect: async () => {
      clients = await Promise.all(
        config.mcps.map(async mcp => {
          const client = await createClient(mcp.connection)
          return [mcp.id, client]
        })
      ).then(Object.fromEntries)
    },
    getTools: async () => {
      toolToClient = {}
      const allTools = await asyncMap(
        Object.values(clients),
        async client => {
          const tools = await client.listTools().then(x => x.tools)
          tools.forEach(tool => {
            // eslint-disable-next-line functional/immutable-data
            toolToClient[tool.name] = client
          })
          return tools
        },
        config.maxParallelCalls || DEFAULT_MAX_PARALLEL_CALLS
      )
      return allTools.flat()
    },
    executeTool: async (toolName: string, params: any) => {
      // Parse any stringified JSON in params (defensive fix for Kai stringification bug)
      const parsedParams = parseStringifiedParams(params)
      
      const client = toolToClient[toolName]
      return client
        .callTool({ name: toolName, arguments: parsedParams as Record<string, unknown> | undefined })
        .catch(() => [])
    },
  }
}

export { create }
