import { ExpressOptions } from '../../common/types.js'
import {
  SimpleServerConfig,
  SimpleServerSseConfig,
  SimpleServerHttpConfig,
  SimpleServerCliConfig,
  SimpleServerStatelessHttpConfig,
} from '../types.js'

import { create as createCli } from './cli.js'
import { create as createSse } from './sse.js'
import { create as createHttp } from './http.js'
import { create as createStatelessHttp } from './stateless-http.js'

const create = (
  config: SimpleServerConfig,
  options?: { express: ExpressOptions }
) => {
  switch (config.server.connection.type) {
    case 'cli':
      return createCli(config as SimpleServerCliConfig)
    case 'sse':
      return createSse(config as SimpleServerSseConfig, options?.express)
    case 'http':
      // @ts-ignore
      if (config.stateless) {
        return createStatelessHttp(
          config as SimpleServerStatelessHttpConfig,
          options?.express
        )
      }
      return createHttp(config as SimpleServerHttpConfig, options?.express)
    default:
      throw new Error(
        `Unsupported server type: ${config.server.connection.type}`
      )
  }
}

export { create }
