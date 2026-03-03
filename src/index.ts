import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { config } from './config/env'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/logger'
import { rateLimiter } from './middleware/rateLimiter'
import { logger } from './utils/logger'
import { startAgentLoop } from './agent/loop'
import healthRouter from './routes/health'
import agentRouter from './routes/agent'

const app = express()

// Security and parsing middleware
app.use(helmet())
app.use(cors())
app.use(express.json())

// Logging and rate limiting
app.use(requestLogger)
app.use(rateLimiter)

// Routes
app.use('/health', healthRouter)
app.use('/api/agent', agentRouter)

// Global error handler — must always be last
app.use(errorHandler)

// Start server
const server = app.listen(config.port, async () => {
  logger.info(`NeuroWealth backend running on port ${config.port}`)
  logger.info(`Environment: ${config.nodeEnv}`)
  logger.info(`Network: ${config.stellar.network}`)
  
  // Start autonomous agent loop
  try {
    await startAgentLoop()
  } catch (error) {
    logger.error('Failed to start agent loop', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    // Continue server operation even if agent fails to start
  }
})

export default app