# Backend Configuration Plan

## Purpose
This document outlines the plan for implementing a structured configuration management system in the backend to handle environment-specific settings, provide validation, defaults, and improve deployment flexibility, based on the current use of dotenv and process.env in server.ts.

## Proposed Structure
Create a new directory: `backend/config/` containing the following files:

1. `index.ts` - Main configuration export (loads and validates environment variables)
2. `schemas.ts` - Validation schemas for different configuration sections
3. `default.ts` - Default configuration values
4. `types.ts` - TypeScript interfaces for configuration objects
5. `loaders.ts` - Custom configuration loaders (for files, databases, etc.)
6. `validators.ts` - Custom validation functions

## Implementation Details

### types.ts
- Define TypeScript interfaces for the entire configuration structure:
  ```typescript
  interface ServerConfig {
    port: number;
    mt5Port: number;
    host: string;
    isProd: boolean;
  }
  
  interface DatabaseConfig {
    type: 'sqlite' | 'postgresql' | 'mysql';
    filename?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    pool?: {
      min: number;
      max: number;
    };
  }
  
  interface LoggingConfig {
    level: 'error' | 'warn' | 'info' | 'debug';
    format: 'json' | 'text';
    file?: string;
    maxSize: string;
    maxFiles: number;
  }
  
  interface SecurityConfig {
    corsOrigin: string | string[];
    rateLimit: {
      windowMs: number;
      max: number;
    };
    helmet: boolean;
  }
  
  interface MT5Config {
    syncIntervalMs: number;
    maxHistoryBars: number;
    maxTicksInMemory: number;
  }
  
  interface DaemonConfig {
    pollIntervalMs: number;
    restartDelayBaseMs: number;
    restartDelayMaxMs: number;
    eventBufferMaxLines: number;
  }
  
  interface Config {
    server: ServerConfig;
    database: DatabaseConfig;
    logging: LoggingConfig;
    security: SecurityConfig;
    mt5: MT5Config;
    daemon: DaemonConfig;
    [key: string]: any; // For extensibility
  }
  ```

### default.ts
- Export default configuration values:
  ```typescript
  export const defaultConfig: Config = {
    server: {
      port: 3000,
      mt5Port: 7777,
      host: '0.0.0.0',
      isProd: process.env.NODE_ENV === 'production'
    },
    database: {
      type: 'sqlite',
      filename: 'data/cotrade.db'
    },
    logging: {
      level: 'info',
      format: 'json',
      file: 'logs/cotrade.log',
      maxSize: '10m',
      maxFiles: 5
    },
    security: {
      corsOrigin: '*',
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100
      },
      helmet: true
    },
    mt5: {
      syncIntervalMs: 500,
      maxHistoryBars: 1000,
      maxTicksInMemory: 5000
    },
    daemon: {
      pollIntervalMs: 250,
      restartDelayBaseMs: 1000,
      restartDelayMaxMs: 30000,
      eventBufferMaxLines: 10000
    }
  };
  ```

### schemas.ts
- Use a validation library like Joi or zod to validate the configuration:
  ```typescript
  import * as Joi from 'joi';
  
  export const configSchema = Joi.object({
    server: Joi.object({
      port: Joi.number().port().required(),
      mt5Port: Joi.number().port().required(),
      host: Joi.string().hostname().required(),
      isProd: Joi.boolean()
    }),
    database: Joi.object({
      type: Joi.string().valid('sqlite', 'postgresql', 'mysql').required(),
      filename: Joi.string().when('type', { is: 'sqlite', then: Joi.required() }),
      host: Joi.string().hostname().when('type', { is: not('sqlite'), then: Joi.required() }),
      port: Joi.number().port().when('type', { is: not('sqlite'), then: Joi.required() }),
      username: Joi.string().when('type', { is: not('sqlite'), then: Joi.required() }),
      password: Joi.string().when('type', { is: not('sqlite'), then: Joi.required() }),
      database: Joi.string().when('type', { is: not('sqlite'), then: Joi.required() }),
      pool: Joi.object({
        min: Joi.number().min(1).default(2),
        max: Joi.number().min(1).default(10)
      })
    }),
    logging: Joi.object({
      level: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
      format: Joi.string().valid('json', 'text').required(),
      file: Joi.string().when('format', { is: 'json', then: Joi.required() }),
      maxSize: Joi.string().pattern(/^\d+[kmg]?b$/i).required(),
      maxFiles: Joi.number().integer().min(1).required()
    }),
    security: Joi.object({
      corsOrigin: Joi.alternatives().try(
        Joi.string().uri(),
        Joi.string().allow('*'),
        Joi.array().items(Joi.string().uri()).min(1)
      ).required(),
      rateLimit: Joi.object({
        windowMs: Joi.number().integer().min(1).required(),
        max: Joi.number().integer().min(1).required()
      }).required(),
      helmet: Joi.boolean()
    }),
    mt5: Joi.object({
      syncIntervalMs: Joi.number().integer().min(1).required(),
      maxHistoryBars: Joi.number().integer().min(1).required(),
      maxTicksInMemory: Joi.number().integer().min(1).required()
    }),
    daemon: Joi.object({
      pollIntervalMs: Joi.number().integer().min(1).required(),
      restartDelayBaseMs: Joi.number().integer().min(1).required(),
      restartDelayMaxMs: Joi.number().integer().min(1).required(),
      eventBufferMaxLines: Joi.number().integer().min(1).required()
    })
  });
  ```

### index.ts
- Main configuration loading and export:
  ```typescript
  import { defaultConfig } from './default';
  import { configSchema } from './schemas';
  import * as Joi from 'joi';
  
  // Load environment variables
  const envConfig = {
    server: {
      port: parseInt(process.env.PORT || '') || undefined,
      mt5Port: parseInt(process.env.MT5_PORT || '') || undefined,
      host: process.env.HOST || undefined,
      isProd: process.env.NODE_ENV === 'production'
    },
    database: {
      type: process.env.DATABASE_TYPE || undefined,
      filename: process.env.DATABASE_FILENAME || undefined,
      host: process.env.DATABASE_HOST || undefined,
      port: parseInt(process.env.DATABASE_PORT || '') || undefined,
      username: process.env.DATABASE_USERNAME || undefined,
      password: process.env.DATABASE_PASSWORD || undefined,
      database: process.env.DATABASE_NAME || undefined,
      pool: process.env.DATABASE_POOL_MIN && process.env.DATABASE_POOL_MAX ? {
        min: parseInt(process.env.DATABASE_POOL_MIN || ''),
        max: parseInt(process.env.DATABASE_POOL_MAX || '')
      } : undefined
    },
    logging: {
      level: process.env.LOG_LEVEL || undefined,
      format: process.env.LOG_FORMAT || undefined,
      file: process.env.LOG_FILE || undefined,
      maxSize: process.env.LOG_MAX_SIZE || undefined,
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '') || undefined
    },
    security: {
      corsOrigin: process.env.CORS_ORIGIN || undefined,
      rateLimit: process.env.RATE_LIMIT_WINDOW_MS && process.env.RATE_LIMIT_MAX_REQUESTS ? {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || ''),
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '')
      } : undefined,
      helmet: process.env.HELMET_ENABLED === 'true' || undefined
    },
    mt5: {
      syncIntervalMs: parseInt(process.env.MT5_SYNC_INTERVAL_MS || '') || undefined,
      maxHistoryBars: parseInt(process.env.MT5_MAX_HISTORY_BARS || '') || undefined,
      maxTicksInMemory: parseInt(process.env.MT5_MAX_TICKS_IN_MEMORY || '') || undefined
    },
    daemon: {
      pollIntervalMs: parseInt(process.env.DAEMON_POLL_INTERVAL_MS || '') || undefined,
      restartDelayBaseMs: parseInt(process.env.DAEMON_RESTART_DELAY_BASE_MS || '') || undefined,
      restartDelayMaxMs: parseInt(process.env.DAEMON_RESTART_DELAY_MAX_MS || '') || undefined,
      eventBufferMaxLines: parseInt(process.env.DAEMON_EVENT_BUFFER_MAX_LINES || '') || undefined
    }
  };
  
  // Merge with defaults
  const mergedConfig = { ...defaultConfig, ...envConfig };
  
  // Validate
  const { error, value } = configSchema.validate(mergedConfig, { abortEarly: false });
  
  if (error) {
    throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
  }
  
  export const config = value;
  ```

### loaders.ts
- Custom loaders for different sources:
  - `loadFromFile(path: string): Promise<Config>` - Load from JSON/YML file
  - `loadFromSecrets(secrets: Record<string, string>): Config` - Load from secret manager
  - `loadFromArgs(args: string[]): Partial<Config>` - Load from command line arguments

### validators.ts
- Custom validation functions:
  - `validatePort(port: number): { valid: boolean; error?: string }`
  - `validateDatabaseUrl(url: string): { valid: boolean; error?: string }`
  - `validateLoggingLevel(level: string): { valid: boolean; error?: string }`

## Implementation Guidelines
1. Keep configuration loading synchronous at startup (fail fast)
2. Provide clear error messages for invalid configuration
3. Support environment variable overrides for all settings
4. Use TypeScript interfaces for strong typing throughout the application
5. Avoid hardcoding values - everything should be configurable
6. Support different environments (development, staging, production) via env vars or files
7. Never commit actual secrets to version control - use .env.example
8. Make configuration immutable after loading (use Object.freeze or similar)
9. Provide a way to reload configuration without restarting (if needed for certain scenarios)
10. Log configuration loading (at appropriate level) for debugging
11. Mask sensitive values in logs (passwords, secrets, etc.)
12. Support configuration from multiple sources with clear precedence order
13. Provide helpful error messages that guide users to fix configuration issues
14. Validate not just the presence but also the correctness of values (ranges, formats, etc.)
15. Consider using configuration schemas that can generate documentation
16. Make the configuration system extensible for future needs
17. Handle type conversion properly (string to number, string to boolean, etc.)
18. Provide default values for optional configuration sections
19. Support array and object configuration values from environment variables (using JSON parsing)
20. Consider encrypting sensitive configuration values if needed

## Integration Plan

### Stage 1: Foundation
#### Stage 1.1: Type Definitions and Defaults
1. Create the config directory: `mkdir -p backend/config`
2. Implement types.ts with comprehensive TypeScript interfaces:
   - Define ServerConfig, DatabaseConfig, LoggingConfig, SecurityConfig
   - Define MT5Config, DaemonConfig, and the main Config interface
   - Include proper JSDoc documentation for each interface
3. Implement default.ts with sensible default values:
   - Set defaults matching current .env usage or hardcoded values
   - Include all configuration sections with appropriate defaults
   - Make sure defaults align with current server.ts behavior
4. Write unit tests for types.ts and default.ts:
   - Test that all interfaces are properly defined
   - Test that default values are correctly structured
   - Test type safety of the configuration object
5. Review and refine based on feedback

#### Stage 1.2: Schema Validation and Loading Logic
1. Implement schemas.ts with Joi validation schemas for all configuration sections:
   - Create validation rules matching the types.ts interfaces
   - Add proper validation for each field type
   - Include required fields and default values where appropriate
   - Add custom validation for complex fields if needed
2. Implement index.ts with configuration loading, merging, and validation logic:
   - Load environment variables into envConfig structure
   - Merge with defaultConfig using object spreading
   - Validate merged config against configSchema
   - Handle validation errors with clear error messages
   - Export the validated config object
3. Write unit tests for the configuration system (types, defaults, schemas, loading):
   - Test configuration loading from environment variables
   - Test merging with defaults
   - Test validation of valid configurations
   - Test validation error reporting for invalid configurations
   - Test that the exported config is immutable
4. Review and refine based on feedback

### Stage 2: Enhancement and Loaders
#### Stage 2.1: Schema Enhancement
1. Enhance schemas.ts with more detailed validation rules and custom validators:
   - Add more specific validation for MT5-related fields
   - Add validation for port ranges and host formats
   - Enhance logging configuration validation
   - Improve security configuration validation
   - Add validation for daemon configuration fields
2. Write additional unit tests for enhanced schemas
3. Review and refine based on feedback

#### Stage 2.2: Loader Implementation
1. Implement loaders.ts with file-based and secret-based configuration loaders:
   - loadFromFile: Load configuration from JSON or YML files
   - loadFromSecrets: Load configuration from secret managers or vaults
   - loadFromArgs: Load configuration from command line arguments
2. Implement proper error handling in loaders
3. Support different file formats (JSON, YML, etc.)
4. Add caching and performance optimizations where appropriate
5. Write unit tests for loaders and validators
6. Begin planning for code integration
7. Review and refine based on feedback

#### Stage 2.3: Validator Implementation
1. Implement validators.ts with custom validation functions:
   - validatePort for port number validation
   - validateDatabaseUrl for database connection string validation
   - validateLoggingLevel for logging level validation
   - Add other domain-specific validators as needed
2. Write unit tests for custom validators
3. Review and refine based on feedback

### Stage 3: Integration and Migration
#### Stage 3.1: Configuration System Integration
1. Update existing code to use the new config system instead of direct process.env access:
   - In server.ts:
     - Replace `process.env.PORT` with `config.server.port`
     - Replace `Number(process.env.PORT) || 3000` with `config.server.port`
     - Replace `process.env.MT5_PORT` with `config.server.mt5Port`
     - Replace `process.env.HOST` with `config.server.host`
     - Replace `process.env.NODE_ENV === 'production'` with `config.server.isProd`
   - Similar replacements for:
     - Database configuration (if used elsewhere)
     - Logging configuration
     - Security configuration
     - MT5 configuration
     - Daemon configuration
2. Update any custom configuration loading logic to use the new system:
   - Replace any remaining direct process.env accesses
   - Ensure all configuration flows through the new system
3. Add .env.example file showing required environment variables with examples:
   - Include all configuration sections
   - Provide realistic example values
   - Add comments explaining each variable
4. Update documentation and README to reflect the new configuration approach:
   - Document how to set environment variables
   - Explain the configuration structure
   - Provide examples for different environments
5. Conduct integration testing to ensure all configuration works correctly:
   - Test application startup with various environment variable combinations
   - Test that default values are used when env vars are not set
   - Test that validation works correctly for invalid values
   - Test that the application behaves correctly with valid configuration
6. Verify that the application starts correctly with various configuration combinations
7. Review and refine based on feedback

#### Stage 3.2: Performance and Security Verification
1. Measure configuration loading overhead to ensure it's acceptable
2. Verify that sensitive values are not logged in error messages
3. Check that configuration immutability is maintained
4. Validate that error messages are helpful and actionable
5. Test configuration reload capability if implemented
6. Review and refine based on feedback

### Stage 4: Refinement, Testing, and Documentation
#### Stage 4.1: Feedback Incorporation and Refinement
1. Gather feedback from implementation and testing
2. Refine configuration system based on real-world usage
3. Enhance error messages and validation feedback
4. Add advanced features like configuration reloading (if needed)
5. Implement configuration schema documentation generation (if using Joi/Zod)
6. Add support for configuration profiles (dev, staging, prod) if beneficial
7. Optimize performance where needed

#### Stage 4.2: Documentation and Guidelines
1. Write comprehensive documentation and usage examples
2. Create contributor guidelines for adding new configuration sections
3. Document configuration options and environment variables
4. Create troubleshooting guides for common configuration issues
5. Document performance characteristics and benchmarks
6. Create migration guide for existing process.env-based configuration

#### Stage 4.3: Final Review and Approval
1. Conduct final review of all configuration system components
2. Run full test suite including unit, integration, and performance tests
3. Verify security through penetration testing or review
4. Check compliance with operational requirements
5. Obtain final approval for implementation