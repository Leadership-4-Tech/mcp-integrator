import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SimpleServerCliConfig } from '../types.js'
import { create as createFeatures } from '../features.js'

const create = (config: SimpleServerCliConfig) => {
  const setupServer = async (features: any) => {
    features.validateConfig()

    const server = new McpServer({
      name: config.name,
      version: config.version,
    })

    const formatted = features.getFormattedTools()
    formatted.forEach(tool => {
      //@ts-ignore
      server.tool(...tool)
    })

    return server
  }

  return {
    start: async () => {
      const features = createFeatures(config)
      const server = await setupServer(features)
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}

export { create }
