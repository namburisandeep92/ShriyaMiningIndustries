export interface Config {
  apiBaseUrl: string
  appTitle: string
  environment: 'development' | 'test' | 'production'
  enableSwaggerUI: boolean
  enableLogging: boolean
}

const config: Config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:7071/api',
  appTitle: import.meta.env.VITE_APP_TITLE || 'SMI Invoice Platform',
  environment: (import.meta.env.VITE_ENVIRONMENT || 'development') as any,
  enableSwaggerUI: import.meta.env.VITE_ENVIRONMENT !== 'production',
  enableLogging: import.meta.env.VITE_ENVIRONMENT !== 'production',
}

export const getConfig = (): Config => config

export const updateConfig = (partial: Partial<Config>) => {
  Object.assign(config, partial)
}
