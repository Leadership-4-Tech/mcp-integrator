import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { asyncMap } from 'modern-async'

import {
  McpIntegratorConfig,
  Provider,
  McpClientConfigs,
  McpTool,
} from '../common/types.js'
import { createTransport } from '../common/libs.js'

import {
  LLMIntegrationService,
  ToolFormat,
  ProviderResponse,
  ToolCall,
  ToolResult,
  ProviderRequest,
  McpIntegrator,
  ClaudeToolUseContent,
  AwsBedrockClaudeToolUseContent,
} from './types.js'

const DEFAULT_MAX_PARALLEL_CALLS = 10

const createExecuteToolCalls =
  (client: Client, maxParallelCalls: number = DEFAULT_MAX_PARALLEL_CALLS) =>
  async (calls: readonly ToolCall[]): Promise<readonly ToolResult[]> =>
    asyncMap(
      calls,
      async call => {
        // Extract arguments, handling both wrapped and unwrapped formats
        const input = call.input as { arguments?: unknown } | undefined
        const args = input?.arguments ?? call.input

        const result = await client
          .callTool({
            name: call.name,
            arguments: args as Record<string, unknown> | undefined,
          })
          .catch(e => {
            console.error(e)
            throw e
          })
        return {
          id: call.id,
          content: result.content,
        }
      },
      maxParallelCalls
    )

const createSharedComponents = (config: McpIntegratorConfig) => {
  const transport = createTransport(config.connection)
  const client = new Client(McpClientConfigs.integrator)
  const executeToolCalls = createExecuteToolCalls(
    client,
    config.maxParallelCalls || DEFAULT_MAX_PARALLEL_CALLS
  )
  return { transport, client, executeToolCalls }
}

const createOpenAIService = (): LLMIntegrationService<Provider.OpenAI> => {
  const formatToolsForProvider = (
    tools: readonly McpTool[]
  ): readonly ToolFormat<Provider.OpenAI>[] =>
    tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        properties: tool.inputSchema,
      },
    }))

  const extractToolCalls = (
    response: ProviderResponse<Provider.OpenAI>
  ): readonly ToolCall[] =>
    response.choices[0].message.tool_calls?.map(call => ({
      id: call.id,
      name: call.function.name,
      input: JSON.parse(call.function.arguments),
    })) ?? []

  const createToolResponseRequest = (
    originalRequest: ProviderRequest<Provider.OpenAI>,
    response: ProviderResponse<Provider.OpenAI>,
    results: readonly ToolResult[]
  ): ProviderRequest<Provider.OpenAI> => ({
    ...originalRequest,
    messages: [
      ...originalRequest.messages,
      response.choices[0].message,
      ...results.map(result => ({
        role: 'tool',
        tool_call_id: result.id,
        content:
          typeof result.content === 'object'
            ? JSON.stringify(result.content)
            : typeof result.content === 'string'
              ? result.content
              : String(result.content),
      })),
    ],
  })

  return {
    formatToolsForProvider,
    extractToolCalls,
    createToolResponseRequest,
  }
}

const createClaudeService = (): LLMIntegrationService<Provider.Claude> => {
  const formatToolsForProvider = (
    tools: readonly McpTool[]
  ): readonly ToolFormat<Provider.Claude>[] =>
    tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }))

  const extractToolCalls = (
    response: ProviderResponse<Provider.Claude>
  ): readonly ToolCall[] =>
    response.content
      .filter(
        (block): block is ClaudeToolUseContent => block.type === 'tool_use'
      )
      .map(block => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }))

  const createToolResponseRequest = (
    originalRequest: ProviderRequest<Provider.Claude>,
    response: ProviderResponse<Provider.Claude>,
    results: readonly ToolResult[]
  ): ProviderRequest<Provider.Claude> => ({
    ...originalRequest,
    messages: [
      ...originalRequest.messages,
      {
        role: 'assistant',
        content: response.content,
      },
      ...results.map(result => ({
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: result.id,
            content:
              typeof result.content === 'object'
                ? JSON.stringify(result.content)
                : typeof result.content === 'string'
                  ? result.content
                  : String(result.content),
          },
        ],
      })),
    ],
  })

  return {
    formatToolsForProvider,
    extractToolCalls,
    createToolResponseRequest,
  }
}

const createAwsBedrockClaudeService =
  (): LLMIntegrationService<Provider.AwsBedrockClaude> => {
    const formatToolsForProvider = (
      tools: readonly McpTool[]
    ): readonly ToolFormat<Provider.AwsBedrockClaude>[] =>
      tools.map(tool => ({
        name: tool.name,
        description: tool.description ?? '',
        input_schema: tool.inputSchema,
      }))

    const extractToolCalls = (
      response: ProviderResponse<Provider.AwsBedrockClaude>
    ): readonly ToolCall[] =>
      response.content
        .filter(
          (block): block is AwsBedrockClaudeToolUseContent =>
            block.type === 'tool_use'
        )
        .map(block => ({
          id: block.id,
          name: block.name,
          input: block.input,
        }))

    const createToolResponseRequest = (
      originalRequest: ProviderRequest<Provider.AwsBedrockClaude>,
      response: ProviderResponse<Provider.AwsBedrockClaude>,
      results: readonly ToolResult[]
    ): ProviderRequest<Provider.AwsBedrockClaude> => ({
      ...originalRequest,
      messages: [
        ...originalRequest.messages,
        {
          role: 'assistant',
          content: response.content,
        },
        ...results.map(result => ({
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: result.id,
              content:
                typeof result.content === 'object'
                  ? JSON.stringify(result.content)
                  : typeof result.content === 'string'
                    ? result.content
                    : String(result.content),
            },
          ],
        })),
      ],
    })

    return {
      formatToolsForProvider,
      extractToolCalls,
      createToolResponseRequest,
    }
  }

const createIntegrationService = <P extends Provider>(
  provider: P
): LLMIntegrationService<P> => {
  switch (provider) {
    case Provider.OpenAI:
      return createOpenAIService() as unknown as LLMIntegrationService<P>
    case Provider.Claude:
      return createClaudeService() as unknown as LLMIntegrationService<P>
    case Provider.AwsBedrockClaude:
      return createAwsBedrockClaudeService() as unknown as LLMIntegrationService<P>
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

export const create = <P extends Provider>(
  config: McpIntegratorConfig & { provider: P }
): McpIntegrator<P> => {
  const { client, executeToolCalls, transport } = createSharedComponents(config)
  const integrationService = createIntegrationService<P>(config.provider)

  const getTools = async () => {
    const result = await client.listTools().catch(e => {
      console.error(e)
      throw e
    })
    return result.tools as readonly McpTool[]
  }

  const connect = async () => {
    await client.connect(transport).catch(e => {
      console.error(e)
      throw e
    })
  }
  const disconnect = async () => client.close()

  return {
    getTools,
    executeToolCalls,
    connect,
    disconnect,
    formatToolsForProvider: integrationService.formatToolsForProvider,
    extractToolCalls: integrationService.extractToolCalls,
    createToolResponseRequest: integrationService.createToolResponseRequest,
  }
}
