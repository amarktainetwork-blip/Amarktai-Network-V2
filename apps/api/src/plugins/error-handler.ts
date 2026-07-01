/**
 * Global error interceptor plugin for Fastify.
 *
 * Catches all unhandled route errors and formats them into
 * consistent JSON error responses. Prevents internal stack traces
 * from leaking to external clients.
 */

import type { FastifyInstance, FastifyError } from 'fastify'

export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500
    const isServerError = statusCode >= 500

    if (isServerError) {
      app.log.error({ err: error }, 'Unhandled server error')
    }

    reply.status(statusCode).send({
      error: true,
      statusCode,
      message: isServerError ? 'Internal server error' : error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    })
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: true,
      statusCode: 404,
      message: 'Route not found',
    })
  })
}
