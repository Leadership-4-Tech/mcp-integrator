import express from 'express'
import cors from 'cors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { McpClientConfigs, ExpressOptions } from '../../common/types.js'
import { create as createFeatures } from '../features.js'
import { SimpleServerSseConfig } from '../types.js'

const HTTP_ERROR = 500
const BAD_REQUEST = 400
const NOT_FOUND_STATUS = 404
const DEFAULT_PORT = 3000

const create = (config: SimpleServerSseConfig, options?: ExpressOptions) => {
  // eslint-disable-next-line functional/no-let
  let server: McpServer | undefined
  const transports: Record<string, SSEServerTransport> = {}
  const app = express()
  app.use(express.json())
  app.use(cors())

  options?.preRouteMiddleware?.forEach(middleware => app.use(middleware))

  const handleSseConnection = async (
    req: express.Request,
    res: express.Response
  ) => {
    // eslint-disable-next-line functional/no-try-statements
    try {
      const transport = new SSEServerTransport('/messages', res)
      const sessionId = transport.sessionId
      // eslint-disable-next-line functional/immutable-data
      transports[sessionId] = transport

      // eslint-disable-next-line functional/immutable-data
      transport.onclose = () => {
        // eslint-disable-next-line functional/immutable-data
        delete transports[sessionId]
      }

      if (server) {
        await server.connect(transport)
      }
    } catch {
      if (!res.headersSent) {
        res.status(HTTP_ERROR).send('Error establishing SSE stream')
      }
      throw new Error('Failed to establish SSE connection')
    }
  }

  const handlePostMessage = async (
    req: express.Request,
    res: express.Response
  ) => {
    const sessionId = req.query.sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(BAD_REQUEST).send('Missing sessionId parameter')
      return
    }

    const transport = transports[sessionId]
    if (!transport) {
      res.status(NOT_FOUND_STATUS).send('Session not found')
      return
    }

    // eslint-disable-next-line functional/no-try-statements
    try {
      await transport.handlePostMessage(req, res, req.body)
    } catch {
      if (!res.headersSent) {
        res.status(HTTP_ERROR).send('Error handling request')
      }
    }
  }

  const setupServer = async (features: any) => {
    features.validateConfig()

    server = new McpServer(
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
    const features = await createFeatures(config)
    await setupServer(features)

    const path = config.server.path || '/'
    const messagesPath = config.server.messagesPath || '/messages'

    options?.additionalRoutes?.forEach(route => {
      app[route.method.toLowerCase()](route.path, route.handler)
    })

    app.get(path, _routeWrapper(handleSseConnection))

    app.post(messagesPath, _routeWrapper(handlePostMessage))

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
    start: async () => {
      const app = await getApp()
      app.listen(config.server.connection.port || DEFAULT_PORT)
    },
    stop: async () => {
      await Promise.all(
        Object.values(transports).map(transport => transport.close())
      )
      await server?.close()
    },
  }
}

export { create }
