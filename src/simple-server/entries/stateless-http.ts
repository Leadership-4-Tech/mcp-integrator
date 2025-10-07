import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { McpClientConfigs, ExpressOptions } from '../../common/types.js'
import { create as createFeatures } from '../features.js'
import { SimpleServerHttpConfig } from '../types.js'

const DEFAULT_PORT = 3000
const NOT_FOUND_STATUS = 404
const UNHANDLED_REQUEST_STATUS = 405

const create = (config: SimpleServerHttpConfig, options?: ExpressOptions) => {
  const app = express()
  app.use(bodyParser.json(options?.jsonBodyParser))
  app.use(cors())

  options?.preRouteMiddleware?.forEach(middleware => app.use(middleware))

  // Map to store transports by session ID
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

  const setupServer = async (features: any) => {
    features.validateConfig()

    const server = new McpServer(
      Object.assign({}, McpClientConfigs.aggregator, {
        capabilities: { tools: config.tools },
        name: config.name,
        version: config.version,
      })
    )
    const formatted = features.getFormattedTools()
    formatted.forEach(tool => {
      //@ts-ignore
      server.tool(...tool)
    })

    return server
  }

  const handleRequest =
    (features: any) => async (req: express.Request, res: express.Response) => {
      const server = await setupServer(features)
      const transport: StreamableHTTPServerTransport =
        new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        })
      res.on('close', () => {
        transport.close()
        server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    }

  const _unhandledRequest = (req, res: express.Response) => {
    res.writeHead(UNHANDLED_REQUEST_STATUS).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      })
    )
  }

  const _routeWrapper = (
    func: (req: express.Request, res: express.Response) => Promise<void> | void
  ) => {
    if (options?.afterRouteCallback) {
      return async (req: express.Request, res: express.Response) => {
        await func(req, res)
        // @ts-ignore
        await options.afterRouteCallback(req, res)
      }
    }
    return func
  }

  const getApp = async (): Promise<express.Express> => {
    const features = createFeatures(config)

    options?.additionalRoutes?.forEach(route => {
      app[route.method.toLowerCase()](route.path, route.handler)
    })

    // Handle POST requests for client-to-server communication
    app.post(config.server.path || '/', _routeWrapper(handleRequest(features)))
    // Handle GET requests for server-to-client notifications
    app.get(config.server.path || '/', _routeWrapper(_unhandledRequest))
    // Handle DELETE requests for session termination
    app.delete(config.server.path || '/', _routeWrapper(_unhandledRequest))

    // Add catch-all route for non-existent URLs
    app.use(
      _routeWrapper((req, res) => {
        res.status(NOT_FOUND_STATUS).json({
          error: 'Not Found',
          message: `The requested URL ${req.url} was not found on this server`,
          status: NOT_FOUND_STATUS,
        })
      })
    )

    return app
  }

  return {
    getApp,
    set: (key: string, value: any) => {
      app.set(key, value)
    },
    start: async () => {
      const app = await getApp()
      app.listen(config.server.connection.port || DEFAULT_PORT)
    },
    stop: async () => {
      Object.values(transports).forEach(transport => transport.close())
    },
  }
}
export { create }
