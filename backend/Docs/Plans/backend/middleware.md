# Backend Middleware Plan

## Purpose
This document outlines the plan for implementing a structured middleware layer in the backend to handle cross-cutting concerns such as logging, validation, authentication, error handling, and more, based on the current codebase architecture observed in server.ts and route files.

## Proposed Structure
Create a new directory: `backend/middleware/` containing the following files:

1. logger.ts - Request/response logging middleware
2. validator.ts - Input validation middleware (using Joi or express-validator)
3. auth.ts - Authentication and authorization middleware
4. errorHandler.ts - Centralized error handling middleware
5. rateLimiter.ts - Rate limiting to prevent abuse
6. cors.ts - CORS configuration (extracted from server.ts)
7. compression.ts - Response compression middleware (if needed)
8. helmet.ts - Security headers middleware (if needed)

## Implementation Details

### logger.ts
- Log incoming requests (method, URL, IP, user-agent, timestamp) - similar to how we could enhance the current inline CORS middleware in server.ts
- Log outgoing responses (status code, response time, response size)
- Use a logging library like winston or pino for structured logging
- Include request ID for tracing (using uuid or similar) to correlate logs across services
- Support different log levels (error, warn, info, debug)
- Optionally log to multiple transports (console, file, external service)
- Implement log rotation and retention policies
- Mask sensitive data in logs (authorization headers, passwords, etc.)
- Extract user agent and other headers for analytics
- Log request body size for monitoring payload trends
- Include response time metrics for performance monitoring

### validator.ts
- Define validation schemas for each endpoint using Joi or express-validator
- Middleware that validates req.body, req.params, req.query
- Return 400 Bad Request with detailed error messages on validation failure
- Reusable validation functions for common patterns (e.g., symbol validation, volume validation, price validation) - like those needed in apiRoutes.ts for /commands endpoint
- Support custom validation rules (e.g., validating against dynamic data from database)
- Provide clear error messages that help clients fix issues
- Allow skipping validation for certain endpoints or in certain environments
- Log validation failures for monitoring and debugging
- Validate MT5-specific fields like symbol format, lot size steps, price precision
- Validate command structures in /commands endpoint (action, symbol, volume, etc.)
- Validate risk guard updates in /risk endpoint
- Validate MCP message structures

### auth.ts
- Implement JWT-based authentication for protected endpoints
- Middleware to verify tokens and attach user info to req.user
- Support both JWT and API key authentication methods
- Role-based access control (RBAC) for different user types (admin, trader, viewer, system)
- Support permission-based access control in addition to roles
- Include token expiration and refresh token handling
- Secure password hashing for local authentication (using bcrypt or argon2)
- Implement account lockout after failed attempts
- Support OAuth2/OpenID Connect integration if needed
- Log authentication events (success/failure) for security monitoring
- Extract token from Authorization header
- Validate token signature and expiration
- Attach decoded user info to request object
- Handle token refresh flows
- Implement refresh token rotation for security
- Support blacklisting of compromised tokens
- Integrate with existing user/role system if needed

### errorHandler.ts
- Centralized error handling middleware to catch async errors
- Format error responses consistently (status code, error message, error code, timestamp)
- Differentiate between operational errors (validation, not found) and programmer errors
- Log errors appropriately (stack trace for 500 errors, just message for 4xx errors)
- Handle specific error types (e.g., ValidationError, NotFoundError, UnauthorizedError, DatabaseError)
- Provide error IDs for tracking and support
- Optionally integrate with error tracking services (Sentry, Datadig, etc.)
- Include environment-specific error details (more details in development, less in production)
- Prevent leaking stack traces or sensitive information in production responses
- Handle errors that occur in middleware after the response has started
- Wrap async route handlers to catch unhandled promise rejections
- Provide meaningful error messages without exposing internal details
- Log errors with context (request ID, user ID, endpoint, etc.)
- Implement error categorization for better monitoring
- Support custom error classes for domain-specific errors

### rateLimiter.ts
- Implement token bucket or fixed window rate limiting
- Configurable limits per endpoint, IP address, user ID, or API key
- Return 429 Too Many Requests when limit is exceeded
- Include headers with rate limit info (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)
- Support different strategies: fixed window, sliding window, leaky bucket
- Allow whitelisting certain IPs or users from rate limiting
- Provide configurable response when limit is exceeded (JSON, HTML, etc.)
- Support distributed rate limiting using Redis for multi-instance deployments
- Log rate limiting events for monitoring and alerting
- Include burst capacity for handling traffic spikes
- Apply different limits to different endpoint types (e.g., stricter limits on trading endpoints)
- Implement sliding window for more accurate rate limiting
- Add rate limiting exemptions for health checks or internal services
- Provide real-time metrics on rate limiting effectiveness
- Implement adaptive rate limiting based on system load

### cors.ts
- Extract the current CORS middleware from server.ts (lines 24-34)
- Make it configurable via environment variables (allowed origins, methods, headers)
- Handle preflight OPTIONS requests properly
- Support dynamic origin validation (e.g., allowing subdomains)
- Configure credentials handling (cookies, authorization headers)
- Set appropriate max-age for preflight request caching
- Log CORS violations for security monitoring
- Support different CORS policies for different environments
- Allow excluding certain paths from CORS enforcement
- Support configurable CORS origins (not just *)
- Handle credentials correctly for cookie-based auth
- Expose appropriate headers for frontend consumption
- Handle complex CORS preflight requests
- Cache preflight results for performance
- Handle credentials in CORS responses correctly

### compression.ts
- Implement gzip/deflate compression for HTTP responses
- Configure compression thresholds (minimum response size)
- Set compression level for balance between speed and compression ratio
- Exclude already compressed content (images, videos, etc.)
- Add Vary: Accept-Encoding header
- Support both gzip and deflate algorithms
- Configure memory usage for compression
- Log compression ratios for monitoring
- Support broker compression algorithm if available
- Implement conditional compression based on client capabilities

### helmet.ts
- Implement security-related HTTP headers
- Set X-Frame-Options to prevent clickjacking
- Set X-Content-Type-Options to prevent MIME sniffing
- Implement HSTS for HTTPS enforcement
- Disable X-Powered-By header
- Set Referrer-Policy for privacy control
- Implement Content Security Policy (CSP) if needed
- Set Expect-CT for certificate transparency
- Configure Permissions Policy for feature control
- Implement Hide-Powered-By middleware
- Set DNS Prefetch Control
- Implement IE XSS Protection
- Set Download Options for IE
- Implement Strict Transport Security for SSL/TLS

## Integration Plan

### Stage 1: Foundation
#### Stage 1.1: Project Setup and Core Logging
1. Create the middleware directory: `mkdir -p backend/middleware`
2. Initialize logger.ts with basic Winston/Pino configuration
3. Implement request logging middleware that captures:
   - Method, URL, IP address, user agent
   - Request headers (excluding sensitive ones)
   - Timestamp
4. Implement response logging middleware that captures:
   - Status code
   - Response time
   - Response size
   - Timestamp
5. Add request ID generation using uuid package
6. Write unit tests for logger middleware
7. Verify logging output format and content

#### Stage 1.2: Validation Framework
1. Implement validator.ts with Joi validation middleware
2. Create reusable validation schemas for:
   - Symbol validation (alphanumeric with possible dots/hyphens)
   - Lot size validation (positive number with step validation)
   - Price validation (positive number with precision)
   - Volume/amount validation (positive number)
   - Timeframe validation (MT5 timeframes)
   - Order type validation (buy/sell, limit/stop)
3. Implement validation error formatting middleware
4. Write unit tests for validation functions
5. Test validation error responses

#### Stage 1.3: Error Handling Foundation
1. Implement errorHandler.ts with basic error catching
2. Create error formatting middleware that:
   - Catches synchronous and asynchronous errors
   - Formats error responses consistently
   - Includes error code, message, and timestamp
   - Excludes stack traces in production
3. Create base error classes:
   - ValidationError
   - NotFoundError
   - UnauthorizedError
   - ConflictError
   - DatabaseError
4. Write unit tests for error handling
5. Test error response formats

### Stage 2: Security & Traffic Management
#### Stage 2.1: Authentication System
1. Implement auth.ts with JWT-based authentication
2. Create token verification middleware that:
   - Extracts token from Authorization header
   - Verifies token signature and expiration
   - Attaches user info to request
   - Handles token refresh flow
3. Implement password hashing utilities using bcrypt/argon2
4. Create login/logout endpoints if needed
5. Implement role-based access control (RBAC)
6. Support permission-based access control
7. Add account lockout after failed attempts
8. Write unit tests for authentication
9. Test token validation and refresh flows

#### Stage 2.2: Rate Limiting and Security Headers
1. Implement rateLimiter.ts with:
   - Token bucket or sliding window algorithm
   - Per-endpoint and per-IP rate limiting
   - Configurable limits and burst capacity
   - Redis-backed distributed rate limiting option
   - Whitelisting capabilities
2. Implement helmet.ts for security headers:
   - X-Frame-Options, X-Content-Type-Options
   - HSTS, X-Powered-By removal
   - Referrer-Policy, Expect-CT
3. Implement cors.ts by extracting and enhancing existing server.ts middleware:
   - Make origins configurable via env vars
   - Add proper preflight handling
   - Add credentials support
   - Add logging for violations
4. Write unit tests for security components
5. Conduct security review of implementations

#### Stage 2.3: Compression and Performance
1. Implement compression.ts with:
   - Gzip/deflate compression
   - Size thresholds
   - Content-type exclusions
   - Performance monitoring
2. Add response time metrics to logger
3. Implement basic caching headers where appropriate
4. Write unit tests for compression
5. Test compression ratios and performance impact

### Stage 3: Integration & Testing
#### Stage 3.1: Middleware Integration
1. Update server.ts to use new middleware in correct order:
   - cors.ts
   - helmet.ts (if added)
   - compression.ts (if added)
   - express.json and express.urlencoded
   - logger.ts
   - validator.ts
   - auth.ts
   - routes (apiRouter, mt5Router)
   - errorHandler.ts
   - rateLimiter.ts (global or per-route)
2. Remove inline CORS middleware from server.ts (lines 24-34)
3. Verify middleware execution order is correct
4. Test that all existing functionality still works
5. Conduct integration testing of middleware stack

#### Stage 3.2: Route-Specific Validation
1. Update apiRoutes.ts to use validator middleware:
   - Add symbol validation to /commands endpoint
   - Add volume validation to trading commands
   - Add price validation to SL/TP parameters
   - Add timeframe validation to history requests
   - Add order type validation
2. Update mt5Routes.ts if needed for validation
3. Implement endpoint-specific validation schemas
4. Test validation error responses
5. Verify valid requests still process correctly

#### Stage 3.3: Monitoring and Observability
1. Enhance logger.ts with:
   - Request ID correlation
   - Performance metrics (response times)
   - Error rate tracking
   - Traffic analytics
2. Add security event logging to auth.ts
3. Add rate limiting events to rateLimiter.ts
4. Add CORS violation logging to cors.ts
5. Write integration tests for monitoring
6. Verify log output contains all necessary information

### Stage 4: Refinement & Documentation
#### Stage 4.1: Feedback and Refinement
1. Gather feedback from implementation and testing
2. Refine middleware components based on real-world usage
3. Enhance error handling and logging capabilities
4. Add advanced features like request ID correlation across services
5. Implement custom validation rules specific to the application domain
6. Optimize performance where needed

#### Stage 4.2: Documentation and Guidelines
1. Write comprehensive documentation and usage examples
2. Create contributor guidelines for adding new middleware
3. Document configuration options and environment variables
4. Create troubleshooting guides for common issues
5. Document performance characteristics and benchmarks
6. Create migration guide for existing code

#### Stage 4.3: Final Review and Approval
1. Conduct final review of all middleware components
2. Run full test suite including unit, integration, and performance tests
3. Verify security through penetration testing or review
4. Check compliance with operational requirements
5. Obtain final approval for implementation