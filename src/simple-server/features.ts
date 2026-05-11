import { isZodSchema, isZodRawShape, wrapRawShape, openApiToZodSchema } from '../common/libs.js'
import { SimpleServerConfig } from './types.js'

interface Features {
  getFormattedTools: () => any[]
  validateConfig: () => void
}

export const create = (config: SimpleServerConfig): Features => {
  const tools = config.tools

  const getFormattedTools = () => {
    return tools.map(tool => {
      // For raw shapes, pass them through directly - the SDK will wrap with z.object()
      // This avoids cross-package Zod instance issues
      if (isZodRawShape(tool.inputSchema)) {
        return [
          tool.name,
          tool.description || '',
          tool.inputSchema,  // Pass raw shape directly
          async (input: any) => {
            const result = await tool.execute(input)
            if (result === undefined) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(null),
                  },
                ],
              }
            }
            return result
          },
        ]
      }

      // For Zod schemas (same instance), use directly
      // For OpenAPI, convert to Zod shape
      return [
        tool.name,
        tool.description || '',
        isZodSchema(tool.inputSchema)
          ? tool.inputSchema
          : openApiToZodSchema(tool.inputSchema),
        async (input: any) => {
          const result = await tool.execute(input)
          if (result === undefined) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(null),
                },
              ],
            }
          }
          return result
        },
      ]
    })
  }

  const validateConfig = () => {
    if (!config.tools || !Array.isArray(config.tools)) {
      throw new Error('Config must include a tools array')
    }

    if (!config.server || !config.server.connection) {
      throw new Error('Config must include server connection configuration')
    }

    // Validate each tool
    const invalidTool = config.tools.find(
      tool =>
        !tool.name ||
        typeof tool.name !== 'string' ||
        !tool.execute ||
        typeof tool.execute !== 'function'
    )

    if (invalidTool) {
      throw new Error(
        `Invalid tool configuration: ${invalidTool.name || 'unnamed tool'}`
      )
    }
  }

  return {
    getFormattedTools,
    validateConfig,
  }
}
