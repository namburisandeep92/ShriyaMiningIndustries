import { randomUUID } from 'node:crypto';

let handlerPromise;

export default async function (context, req) {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      let code = 'API-MODULE-503';
      try {
        // Keep dependency loading inside the error boundary for cold-start diagnostics.
        const [{ default: serverlessExpress }, { createAppForFunctions }, { getDatabase }] = await Promise.all([
          import('@codegenie/serverless-express'),
          import('./server.js'),
          import('./services/database.js'),
        ]);
        code = 'API-CONFIG-503';
        const app = await createAppForFunctions();
        code = 'DB-CONNECT-503';
        await getDatabase().connect();
        code = 'API-ADAPTER-503';
        return serverlessExpress({
          app, eventSourceName: 'AZURE_HTTP_FUNCTION_V4',
          binarySettings: {
            contentTypes: ['image/*', 'application/pdf', 'application/octet-stream',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
          },
        });
      } catch (cause) {
        const error = new Error('API initialization failed', { cause });
        error.code = code;
        throw error;
      }
    })();
  }

  let handler;
  try {
    handler = await handlerPromise;
  } catch (error) {
    handlerPromise = undefined;
    const referenceId = randomUUID();
    context.log.error('API initialization failed:', {
      code: error.code,
      referenceId,
      technicalMessage: error.cause?.message,
      stack: error.cause?.stack,
    });
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        error: {
          code: error.code,
          message: 'The API is temporarily unavailable. Please contact support with the reference ID.',
          referenceId,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  return handler(context, req);
}
