import { McpTool, Provider, McpIntegratorConfig } from '../common/types.js'

import { create as createServices } from './services.js'
import {
  McpIntegrator,
  ToolFormat,
  ProviderResponse,
  ToolCall,
  ToolResult,
  ProviderRequest,
} from './types.js'

const listToolsTool = {
  name: 'mcp-integrator-list-tools',
  description:
    'List all the tools you have access to. Or better yet the user does.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
  },
}

const create = <P extends Provider>(
  config: McpIntegratorConfig & { provider: P }
): McpIntegrator<P> => {
  const services = createServices(config)

  const connect = async () => {
    await services.connect()
  }

  const disconnect = async () => {
    await services.disconnect()
  }

  const getTools = async (): Promise<readonly McpTool[]> => {
    const tools = await services.getTools()
    return config.includeListToolsTool !== false
      ? // @ts-ignore
        [listToolsTool].concat(tools)
      : tools
  }

  const formatToolsForProvider = (
    tools: readonly McpTool[]
  ): readonly ToolFormat<P>[] => {
    return services.formatToolsForProvider(tools)
  }

  const extractToolCalls = (
    response: ProviderResponse<P>
  ): readonly ToolCall[] => {
    return services.extractToolCalls(response)
  }

  const executeToolCalls = async (
    calls: readonly ToolCall[]
  ): Promise<readonly ToolResult[]> => {
    const metatoolCall = calls.find(x => x.name === 'mcp-integrator-list-tools')
    if (metatoolCall) {
      const tools = await services.getTools()
      return [
        {
          id: metatoolCall.id,
          content: JSON.stringify(tools.map(x => x.name)),
        },
      ]
    }
    return services.executeToolCalls(calls)
  }

  const createToolResponseRequest = (
    request: ProviderRequest<P>,
    response: ProviderResponse<P>,
    results: readonly ToolResult[]
  ): ProviderRequest<P> => {
    return services.createToolResponseRequest(request, response, results)
  }

  return {
    connect,
    disconnect,
    getTools,
    formatToolsForProvider,
    extractToolCalls,
    executeToolCalls,
    createToolResponseRequest,
  }
}

export { create }
