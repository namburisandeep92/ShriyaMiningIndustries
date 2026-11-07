import serverlessExpress from '@codegenie/serverless-express';
import { createAppForFunctions } from './server.js';
import { getDatabase } from './services/database.js';

let handlerPromise;

export default async function (context, req) {
  if (!handlerPromise) {
    handlerPromise = (async () => {
      const app = await createAppForFunctions();
      await getDatabase().connect();
      return serverlessExpress({ app });
    })();
  }

  let handler;
  try {
    handler = await handlerPromise;
  } catch (error) {
    handlerPromise = undefined;
    context.log.error('API initialization failed:', error.message);
    throw error;
  }

  return handler(context, req);
}
