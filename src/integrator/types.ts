import { ZodSchema } from 'zod'
import {
  McpIntegratorConfig,
  Provider,
  McpTool,
  OpenAPISchema,
  XOR,
} from '../common/types.js'

export type OpenAIToolFormat = Readonly<{
  type: 'function'
  function: Readonly<{
    name: string
    description: string
    properties: XOR<OpenAPISchema, ZodSchema>
  }>
}>

export type ClaudeToolFormat = Readonly<{
  name: string
  description: string
  input_schema: XOR<OpenAPISchema, ZodSchema>
}>

export type AwsBedrockClaudeToolFormat = Readonly<{
  name: string
  description: string
  input_schema: XOR<OpenAPISchema, ZodSchema>
}>

export type ToolFormat<P extends Provider> = P extends Provider.OpenAI
  ? OpenAIToolFormat
  : P extends Provider.Claude
    ? ClaudeToolFormat
    : P extends Provider.AwsBedrockClaude
      ? AwsBedrockClaudeToolFormat
      : never

export type OpenAIToolCall = Readonly<{
  id: string
  type: 'function'
  function: Readonly<{
    name: string
    arguments: string
  }>
}>

export type OpenAIMessage = Readonly<{
  role: string
  content: string | null
  tool_calls?: readonly OpenAIToolCall[]
}>

export type OpenAIResponse = Readonly<{
  id: string
  object: 'chat.completion'
  created: number
  model: string
  choices: Readonly<
    Array<{
      index: number
      message: OpenAIMessage
      finish_reason: 'stop' | 'tool_calls'
    }>
  >
  usage: Readonly<{
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }>
}>

// Claude Direct Content Types
export type ClaudeTextContent = Readonly<{
  type: 'text'
  text: string
}>

export type ClaudeToolUseContent = Readonly<{
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}>

export type ClaudeToolResultContent = Readonly<{
  type: 'tool_result'
  tool_use_id: string
  content: string
}>

export type ClaudeContentBlock =
  | ClaudeTextContent
  | ClaudeToolUseContent
  | ClaudeToolResultContent

export type ClaudeMessage = Readonly<{
  role: string
  content: string | readonly ClaudeContentBlock[]
}>

export type ClaudeResponse = Readonly<{
  id: string
  type: 'message'
  role: string
  model: string
  content: readonly ClaudeContentBlock[]
  stop_reason: 'tool_use' | 'end_turn'
  usage: Readonly<{
    input_tokens: number
    output_tokens: number
  }>
}>

export type AwsBedrockClaudeTextContent = Readonly<{
  type: 'text'
  text: string
}>

export type AwsBedrockClaudeToolUseContent = Readonly<{
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}>

export type AwsBedrockClaudeToolResultContent = Readonly<{
  type: 'tool_result'
  tool_use_id: string
  content: string
}>

export type AwsBedrockClaudeContentBlock =
  | AwsBedrockClaudeTextContent
  | AwsBedrockClaudeToolUseContent
  | AwsBedrockClaudeToolResultContent

export type AwsBedrockClaudeMessage = Readonly<{
  role: string
  content: readonly AwsBedrockClaudeContentBlock[]
}>

export type AwsBedrockClaudeResponse = Readonly<{
  id: string
  type: 'message'
  role: string
  model: string
  content: readonly AwsBedrockClaudeContentBlock[]
  stop_reason: 'tool_use' | 'end_turn'
  stop_sequence: string | null
  usage: Readonly<{
    input_tokens: number
    output_tokens: number
  }>
}>

export type ProviderResponse<P extends Provider> = P extends Provider.OpenAI
  ? OpenAIResponse
  : P extends Provider.Claude
    ? ClaudeResponse
    : P extends Provider.AwsBedrockClaude
      ? AwsBedrockClaudeResponse
      : never

export type ToolCall = Readonly<{
  id: string
  name: string
  input: unknown
}>

export type ToolResult = Readonly<{
  id: string
  content: unknown
}>

export type OpenAIRequest = Readonly<{
  model: string
  messages: readonly OpenAIMessage[]
  tools?: readonly OpenAIToolFormat[]
  tool_choice?: 'auto'
  temperature?: number
  max_tokens?: number
}>

export type ClaudeRequest = Readonly<{
  model: string
  max_tokens: number
  system?: string
  messages: readonly ClaudeMessage[]
  tools?: readonly ClaudeToolFormat[]
  temperature?: number
  top_p?: number
}>

export type AwsBedrockClaudeRequest = Readonly<{
  anthropic_version: string
  max_tokens: number
  system?: string
  messages: readonly AwsBedrockClaudeMessage[]
  tools?: readonly AwsBedrockClaudeToolFormat[]
  temperature?: number
  top_p?: number
}>

export type ProviderRequest<P extends Provider> = P extends Provider.OpenAI
  ? OpenAIRequest
  : P extends Provider.Claude
    ? ClaudeRequest
    : P extends Provider.AwsBedrockClaude
      ? AwsBedrockClaudeRequest
      : never

/**
 * The service that handles the integration with the LLM provider.
 * This only handles the integration with the LLM provider, not the MCP.
 */
export type LLMIntegrationService<P extends Provider> = Readonly<{
  formatToolsForProvider: (
    tools: readonly McpTool[]
  ) => readonly ToolFormat<P>[]
  extractToolCalls: (response: ProviderResponse<P>) => readonly ToolCall[]
  /**
   * Creates a full response request to the LLM provider, using the original request, the LLM's call to tools, and the results of the tool calls.
   * It is important to note that the LLM provider may return regular messages in the response, and tool calls.
   * @param originalRequest
   * @param response
   * @param results
   * @returns
   */
  createToolResponseRequest: (
    originalRequest: ProviderRequest<P>,
    response: ProviderResponse<P>,
    results: readonly ToolResult[]
  ) => ProviderRequest<P>
}>

/**
 * Creates a new LLM integration service.
 * @param config - The configuration for the MCP integrator
 * @returns A new LLM integration service
 */
export type CreateLLMIntegrationService = <P extends Provider>(
  config: McpIntegratorConfig & { provider: P }
) => LLMIntegrationService<P>

/**
 * The primary interface for the MCP integrator.
 */
export type McpIntegrator<P extends Provider> = Readonly<{
  /**
   * Starts connections to the MCP
   * @returns
   */
  connect: () => Promise<void>
  /**
   * Disconnects from the MCP
   * @returns
   */
  disconnect: () => Promise<void>
  /**
   * Gets the tools available to the MCP
   * @returns
   */
  getTools: () => Promise<readonly McpTool[]>
  /**
   * Formats the tools for the provider
   * @param tools - The tools to format
   * @returns
   */
  formatToolsForProvider: (
    tools: readonly McpTool[]
  ) => readonly ToolFormat<P>[]
  /**
   * Extracts the tool calls from the provider response and formats them as a ToolCall for MCP format.
   * @param response - The response from the provider
   * @returns
   */
  extractToolCalls: (response: ProviderResponse<P>) => readonly ToolCall[]
  /**
   * Executes the tool calls with the MCPsand returns the results.
   * @param calls - The tool calls to execute
   * @returns
   */
  executeToolCalls: (
    calls: readonly ToolCall[]
  ) => Promise<readonly ToolResult[]>
  /**
   * Creates a new request to the LLM provider, using the original request, the LLM's call to tools, and the results of the tool calls.
   * @param originalRequest - The original request to the LLM provider
   * @param response - The response from the LLM provider
   * @param results - The results of the tool calls
   * @returns
   */
  createToolResponseRequest: (
    originalRequest: ProviderRequest<P>,
    response: ProviderResponse<P>,
    results: readonly ToolResult[]
  ) => ProviderRequest<P>
}>
