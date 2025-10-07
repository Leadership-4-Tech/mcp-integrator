import { randomUUID } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import bodyParser from 'body-parser'
import {
  McpAggregatorHttpConfig,
  McpClientConfigs,
  ExpressOptions,
} from '../../common/types.js'
import { create as createFeatures } from '../features.js'
import { openApiToZodSchema } from '../../common/libs.js'

const DEFAULT_PORT = 3000
const BAD_REQUEST_STATUS = 400
const NOT_FOUND_STATUS = 404

const create = (config: McpAggregatorHttpConfig, options?: ExpressOptions) => {
  const app = express()
  app.use(bodyParser.json(options?.jsonBodyParser))
  app.use(cors())

  options?.preRouteMiddleware?.forEach(middleware => app.use(middleware))

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

  const setupServer = async (features: any) => {
    const rawTools = await features.getTools()
    const tools = rawTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema,
    }))

    const server = new McpServer(
      Object.assign({}, McpClientConfigs.aggregator, {
        capabilities: { tools },
      })
    )

    tools.forEach(tool => {
      // @ts-ignore
      server.tool(
        tool.name,
        tool.description || '',
        openApiToZodSchema(tool.parameters),
        async extra => {
          const results = await features.executeTool(tool.name, extra)
          return results as any
        }
      )
    })

    return server
  }

  const handleRequest =
    (features: any) => async (req: express.Request, res: express.Response) => {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      // eslint-disable-next-line functional/no-let
      let transport: StreamableHTTPServerTransport

      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId]
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        const server = await setupServer(features)
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: sessionId => {
            // Store the transport by session ID
            // eslint-disable-next-line functional/immutable-data
            transports[sessionId] = transport
          },
        })

        // Clean up transport when closed
        // eslint-disable-next-line functional/immutable-data
        transport.onclose = () => {
          if (transport.sessionId) {
            // eslint-disable-next-line functional/immutable-data
            delete transports[transport.sessionId]
          }
        }

        // Connect to the MCP server
        await server.connect(transport)
      } else {
        // Invalid request
        res.status(BAD_REQUEST_STATUS).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        })
        return
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body)
    }

  // Reusable handler for GET and DELETE requests
  const handleSessionRequest = async (
    req: express.Request,
    res: express.Response
  ) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (!sessionId || !transports[sessionId]) {
      res.status(BAD_REQUEST_STATUS).send('Invalid or missing session ID')
      return
    }

    const transport = transports[sessionId]
    await transport.handleRequest(req, res)
  }

  return {
    start: async () => {
      const features = await createFeatures(config)
      await features.connect()

      options?.additionalRoutes?.forEach(route => {
        app[route.method.toLowerCase()](route.path, route.handler)
      })

      // Handle POST requests for client-to-server communication
      app.post(config.server.path || '/', handleRequest(features))
      // Handle GET requests for server-to-client notifications
      app.get(config.server.path || '/', handleSessionRequest)
      // Handle DELETE requests for session termination
      app.delete(config.server.path || '/', handleSessionRequest)

      // Add catch-all route for non-existent URLs
      app.use((req, res) => {
        res.status(NOT_FOUND_STATUS).json({
          error: 'Not Found',
          message: `The requested URL ${req.url} was not found on this server`,
          status: NOT_FOUND_STATUS,
        })
      })

      app.listen(config.server.connection.port || DEFAULT_PORT)
    },
    stop: async () => {
      Object.values(transports).forEach(transport => transport.close())
    },
    set: (key: string, value: any) => {
      app.set(key, value)
    },
  }
}

export { create }
