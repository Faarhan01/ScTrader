# Backend Controllers Plan

## Purpose
This document outlines the plan for implementing a structured controller layer in the backend to separate route handling logic from business logic, improving maintainability, testability, and adherence to separation of concerns, based on the current codebase architecture observed in apiRoutes.ts and mt5Routes.ts.

## Proposed Structure
Create a new directory: `backend/controllers/` containing the following files:

1. `apiController.ts` - Handles all `/api/*` endpoints (state, commands, risk, kill-switch, MCP, etc.)
2. `mt5Controller.ts` - Handles MT5-related endpoints (`/sync`, `/tick`, `/result`, health checks, etc.)
3. `mcpController.ts` - Handles MCP-specific endpoints if they grow in complexity
4. `authController.ts` - Handles authentication-related endpoints (login, logout, refresh, etc.) if added
5. `healthController.ts` - Handles health check and monitoring endpoints

## Implementation Details

### apiController.ts
- Move all handler functions from `apiRoutes.ts` into this controller
- Each method corresponds to a route:
  - `getState` -> GET /state (line 9-12 in apiRoutes.ts)
  - `enqueueCommand` -> POST /commands (line 14-42 in apiRoutes.ts)
  - `updateRiskGuard` -> POST /risk (line 44-58 in apiRoutes.ts)
  - `triggerKillSwitch` -> POST /kill-switch (line 60-74 in apiRoutes.ts)
  - `handleMcpSse` -> GET /mcp/sse (line 76-94 in apiRoutes.ts)
  - `handleMcpMessages` -> POST /mcp/messages (line 96-118 in apiRoutes.ts)
- Controllers receive dependencies via constructor (tradeStore, mcpServer, websocketServer, etc.)
- Keep controllers thin: extract business logic to services when possible
- Use DTOs (Data Transfer Objects) for input validation and output formatting
- Implement proper error handling and validation delegation to middleware/services
- Add JSDoc documentation for all public methods
- Follow existing code style and conventions
- Handle asynchronous operations properly with try/catch blocks
- Return appropriate HTTP status codes
- Validate request parameters before processing
- Sanitize output to prevent XSS and other injection attacks

### mt5Controller.ts
- Move all handler functions from `mt5Routes.ts` into this controller
- Methods:
  - `healthCheck` -> GET /health, /handshake, etc. (line 9-22 in mt5Routes.ts)
  - `handleEASync` -> POST /sync (line 24-69 in mt5Routes.ts)
  - `handleExecutionResult` -> POST /result (line 71-83 in mt5Routes.ts)
  - `handleLiveTick` -> POST /tick (line 85-97 in mt5Routes.ts)
- Dependencies: tradeStore, websocketServer
- Consider extracting EA-specific logic to a service if it grows
- Implement proper separation of concerns between MT5 protocol handling and business logic
- Add validation for incoming MT5 payloads
- Handle edge cases and error conditions from MT5 EA communication
- Log MT5-specific events for monitoring and debugging
- Validate EASyncPayload structure according to types/mt5.js
- Handle malformed or incomplete MT5 sync data
- Validate execution result data before processing
- Validate tick data before updating tradeStore
- Implement proper error responses for invalid MT5 communications
- Log MT5 connection status changes
- Handle MT5 disconnection scenarios gracefully

### mcpController.ts
- For MCP-specific logic that doesn't fit in apiController
- Methods for handling different MCP tool types, sessions, etc.
- Dependencies: mcpServer
- Implement MCP protocol handling according to specification
- Handle session management and lifecycle
- Coordinate with authController if authentication is required for MCP
- Implement proper error handling for MCP-specific error conditions
- Add support for MCP notifications and resource updates if needed
- Handle MCP JSON-RPC 2.0 protocol compliance
- Manage MCP session lifecycle (creation, renewal, expiration)
- Implement MCP capability negotiation
- Handle MCP resource subscriptions and unsubscriptions
- Implement MCP logging and diagnostics if needed
- Coordinate with authentication system for secured MCP endpoints
- Handle batch MCP requests efficiently
- Implement proper error responses for MCP protocol violations
- Support MCP transport mechanisms (SSE, WebSocket, HTTP)

### authController.ts (future)
- If authentication is added:
  - `login` -> POST /auth/login
  - `logout` -> POST /auth/logout
  - `refreshToken` -> POST /auth/refresh
  - `getProfile` -> GET /auth/profile
- Implement secure authentication flows
- Handle token generation, validation, and refresh
- Implement password hashing and secure storage
- Add account lockout and security monitoring
- Support multi-factor authentication if required
- Integrate with existing user/role management systems
- Implement secure password reset functionality
- Handle email verification for account registration
- Implement account locking after suspicious activity
- Support social login integrations (Google, GitHub, etc.)
- Implement session management and tracking
- Provide secure logout functionality
- Handle token blacklisting and revocation
- Implement rate limiting on authentication endpoints
- Audit authentication events for security monitoring
- Support password policy enforcement
- Implement account verification workflows

### healthController.ts
- Health check endpoints:
  - `getHealth` -> GET /health (detailed)
  - `getReadiness` -> GET /ready
  - `getLiveness` -> GET /live
  - `getMetrics` -> GET /metrics (if using Prometheus)
- Dependencies: tradeStore, database connection checker, external service checkers
- Implement comprehensive health checks covering:
  - Application health (startup, initialization status)
  - Readiness (database connectivity, external service availability)
  - Liveness (basic application responsiveness)
  - Metrics collection (if using Prometheus or similar)
- Implement caching for expensive health check operations where appropriate
- Add support for custom health check plugins
- Provide structured output for health check responses
- Check database connection and query performance
- Verify external service availability (if applicable)
- Check memory usage and garbage collection statistics
- Monitor CPU usage and load averages
- Check disk space availability
- Verify WebSocket server connections
- Validate tradeStore initialization status
- Check daemon worker thread status
- Monitor MQTT or other message broker connections if used
- Provide detailed health information including version, uptime, etc.
- Implement health check caching to reduce overhead
- Support liveness and readiness probes for Kubernetes
- Provide Prometheus metrics endpoint if configured
- Include dependency version information in health checks
- Add custom application-specific health indicators

## Integration Plan

### Stage 1: Core Controller Implementation
#### Stage 1.1: Project Setup and API Controller
1. Create the controllers directory: `mkdir -p backend/controllers`
2. Implement apiController.ts by moving all logic from apiRoutes.ts:
   - Extract getState handler (lines 9-12)
   - Extract enqueueCommand handler (lines 14-42)
   - Extract updateRiskGuard handler (lines 44-58)
   - Extract triggerKillSwitch handler (lines 60-74)
   - Extract handleMcpSse handler (lines 76-94)
   - Extract handleMcpMessages handler (lines 96-118)
3. Establish controller constructor dependency injection pattern:
   - Inject tradeStore, mcpServer, websocketServer dependencies
   - Use TypeScript interfaces for dependency contracts
4. Ensure controllers are thin and delegate business logic to services where appropriate:
   - Keep controllers focused on request/response handling
   - Delegate complex logic to tradeStore, mcpServer, etc.
5. Write unit tests for apiController.ts:
   - Test getState returns proper state structure
   - Test enqueueCommand validates input and enqueues properly
   - Test updateRiskGuard updates risk guard configuration
   - Test triggerKillSwitch toggles kill switch properly
   - Test MCP SSE handler sets up streaming connection
   - Test MCP messages handler processes JSON-RPC requests
6. Review and refine based on feedback

#### Stage 1.2: MT5 Controller Implementation
1. Implement mt5Controller.ts by moving all logic from mt5Routes.ts:
   - Extract healthCheck handler (lines 9-22)
   - Extract handleEASync handler (lines 24-69)
   - Extract handleExecutionResult handler (lines 71-83)
   - Extract handleLiveTick handler (lines 85-97)
2. Establish controller constructor dependency injection:
   - Inject tradeStore and websocketServer dependencies
3. Consider extracting EA-specific logic to a service if it grows:
   - Create mt5Service.ts for complex MT5 protocol handling
   - Keep controller focused on HTTP request/response
4. Implement proper separation of concerns between MT5 protocol handling and business logic:
   - Controller handles HTTP specifics
   - Service handles MT5 protocol nuances
5. Add validation for incoming MT5 payloads:
   - Validate EASyncPayload structure
   - Validate tick data format
   - Validate execution result structure
6. Handle edge cases and error conditions from MT5 EA communication:
   - Handle malformed JSON from MT5 EA
   - Handle missing required fields
   - Handle invalid data types
   - Handle out-of-range values
7. Log MT5-specific events for monitoring and debugging:
   - Log successful MT5 sync operations
   - Log MT5 connection/disconnection events
   - Log MT5 data validation errors
8. Write unit tests for mt5Controller.ts:
   - Test healthCheck returns proper response
   - Test handleEASync processes valid payloads correctly
   - Test handleExecutionResult handles valid results
   - Test handleLiveTick updates tradeStore properly
   - Test error handling for invalid inputs
9. Review and refine based on feedback

### Stage 2: Route Updates and Additional Controllers
#### Stage 2.1: Route Updates
1. Update route files (`apiRoutes.ts` and `mt5Routes.ts`) to:
   - Import the controller instances
   - Define routes that call controller methods
   - Keep route files focused on routing, middleware, and request/response handling
2. For apiRoutes.ts:
   - Import apiController instance
   - Replace inline handlers with controller method calls
   - Keep middleware (authentication, validation) in route file
   - Keep routing logic (path definitions) in route file
3. For mt5Routes.ts:
   - Import mt5Controller instance
   - Replace inline handlers with controller method calls
   - Keep middleware and routing logic in route file
4. Ensure all controllers follow the same patterns and conventions:
   - Consistent error handling
   - Consistent response formatting
   - Consistent dependency injection patterns
   - Consistent JSDoc documentation

#### Stage 2.2: Additional Controllers
1. Implement mcpController.ts if MCP-specific logic requires separation:
   - Extract complex MCP logic from apiController if it grows large
   - Handle MCP-specific concerns like session management
   - Implement MCP protocol handling per specification
2. Implement healthController.ts for health check endpoints:
   - Create detailed health check endpoint
   - Create readiness probe endpoint
   - Create liveness probe endpoint
   - Create metrics endpoint if using Prometheus
3. Implement authController.ts if authentication functionality is required:
   - Create login endpoint
   - Create logout endpoint
   - Create token refresh endpoint
   - Create user profile endpoint
4. Ensure all new controllers follow established patterns and conventions:
   - Dependency injection via constructor
   - Thin controllers delegating to services
   - Proper error handling
   - JSDoc documentation
   - Consistent response formatting
5. Write unit tests for newly implemented controllers:
   - Test mcpController session management
   - Test healthController health check responses
   - Test authController authentication flows
   - Test error handling in all controllers
6. Conduct integration testing to ensure routing works correctly:
   - Test that routes properly delegate to controllers
   - Test that middleware still functions correctly
   - Test that error handling works through controller layer
   - Test that response formatting is consistent

### Stage 3: Dependency Injection and Server Integration
#### Stage 3.1: Dependency Injection
1. Ensure controllers are instantiated with required dependencies (dependency injection):
   - Create controller instances in server.ts or dedicated factory
   - Inject tradeStore, mcpServer, websocketServer, etc.
   - Use TypeScript interfaces for loose coupling
2. Update server.ts to instantiate and pass dependencies to controllers if needed:
   - Import controller classes
   - Instantiate with required dependencies
   - Pass instances to route files or use directly
3. Implement a simple dependency injection pattern or service locator if beneficial:
   - Create simple container or factory functions
   - Or use explicit instantiation if simple enough
   - Avoid over-engineering for small to medium applications
4. Verify that all controllers have access to required services:
   - apiController: tradeStore, mcpServer, websocketServer
   - mt5Controller: tradeStore, websocketServer
   - mcpController: mcpServer
   - authController: user service, token service (if implemented)
   - healthController: tradeStore, database, external services
5. Test that dependency injection works correctly and doesn't create circular dependencies:
   - Write tests to verify dependency resolution
   - Check for circular dependency warnings
   - Ensure proper cleanup of resources

#### Stage 3.2: Server Integration and Testing
1. Update server.ts to work with controller-based architecture:
   - Option A: Instantiate controllers and pass to route files
   - Option B: Keep route files but have them delegate to controllers
   - Option C: Have route files import and instantiate controllers directly
2. Conduct integration testing to ensure routing works correctly:
   - Test all API endpoints return correct responses
   - Test all MT5 endpoints return correct responses
   - Test error handling through controller layer
   - Test that middleware (authentication, validation) still works
   - Test that CORS headers are still applied correctly
3. Performance test controller overhead to ensure acceptability:
   - Benchmark request processing time with vs without controllers
   - Ensure controller abstraction doesn't add significant overhead
   - Test memory usage patterns
   - Verify garbage collection behavior
4. Write integration tests covering the full request lifecycle through controllers:
   - Test HTTP request -> middleware -> controller -> service -> response
   - Test error paths through the full lifecycle
   - Test validation failures at controller level
   - Test authentication failures at controller level

### Stage 4: Refinement, Testing, and Documentation
#### Stage 4.1: Feedback and Refinement
1. Gather feedback from implementation and testing
2. Refine controller implementations based on real-world usage
3. Enhance error handling, validation, and logging in controllers
4. Add advanced features like request/response transformation where needed
5. Implement custom DTOs for complex request/response schemas
6. Optimize performance where needed

#### Stage 4.2: Documentation and Guidelines
1. Write comprehensive documentation and usage examples for each controller
2. Create contributor guidelines for adding new controllers
3. Document dependency injection patterns and conventions
4. Create troubleshooting guides for common controller issues
5. Document performance characteristics and benchmarks
6. Create migration guide for existing route-based controllers

#### Stage 4.3: Final Review and Approval
1. Conduct final review of all controller components
2. Run full test suite including unit, integration, and performance tests
3. Verify security through penetration testing or review
4. Check compliance with operational requirements
5. Obtain final approval for implementation