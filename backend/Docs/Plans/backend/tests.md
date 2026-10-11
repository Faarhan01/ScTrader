# Backend Testing Plan

## Purpose
This document outlines the plan for implementing a comprehensive testing strategy in the backend to ensure code quality, prevent regressions, and maintain reliability as the application grows, based on the current codebase structure and testing needs.

## Proposed Structure
Create a new directory: `backend/tests/` containing the following structure:

```
tests/
├── unit/
│   ├── services/
│   ├── controllers/
│   ├── utils/
│   ├── lib/
│   ├── middleware/
│   └── ...
├── integration/
│   ├── api/
│   ├── mt5/
│   ├── websocket/
│   └── ...
├── e2e/
│   ├── user-flows/
│   └── ...
├── fixtures/
│   ├── symbols.json
│   ├── account-data.json
│   └── ...
├── helpers/
│   ├── test-server.ts
│   ├── test-db.ts
│   ├── mock-mt5.ts
│   ├── auth-helper.ts
│   ├── wait-for.ts
│   ├── assert-helper.ts
│   └── test-containers.ts
└── config/
    ├── jest.config.ts
    └── ...
```

## Implementation Details

### Unit Tests
- Location: `tests/unit/`
- Focus: Individual functions, methods, and classes in isolation
- Framework: Jest or Vitest (recommended for speed and features)
- Test file naming: `[name].test.ts` or `[name].spec.ts`
- Coverage goals:
  - Services: 90%+
  - Utils: 95%+
  - Lib: 90%+
  - Controllers: 85%+ (thin controllers)
  - Middleware: 90%+
- Key principles:
  - Test public interfaces only
  - Mock dependencies heavily
  - Test edge cases and error conditions
  - Use test doubles (spies, stubs, mocks)
  - Keep tests fast and isolated
  - Arrange-Act-Assert pattern
  - Descriptive test names

### Integration Tests
- Location: `tests/integration/`
- Focus: Interactions between components, API endpoints, external systems
- Framework: Same as unit tests (Jest/Vitest) with supertest for HTTP
- Test file naming: `[resource].integration.test.ts`
- Coverage goals:
  - API endpoints: 80%+ of routes
  - Critical integrations: 90%+
  - WebSocket connections: 80%+
  - Database interactions: 85%+
- Key principles:
  - Test against test database (not production)
  - Use test doubles for external services when possible
  - Test happy paths and error conditions
  - Clean up test data between tests
  - Use transactions for database tests when possible
  - Test authentication and authorization
  - Validate response schemas and status codes

### End-to-End (E2E) Tests
- Location: `tests/e2e/`
- Focus: Critical user flows from start to finish
- Framework: Playwright or Cypress (recommended for reliability)
- Test file naming: `[user-flow].e2e.test.ts`
- Focus areas:
  - User authentication flow
  - Trading workflow (place order, monitor, close)
  - Configuration changes
  - Report generation and download
  - Error handling and recovery
  - Performance benchmarks
- Key principles:
  - Test in staging-like environment
  - Use realistic data
  - Test cross-browser compatibility (if web UI)
  - Test mobile responsiveness (if applicable)
  - Test network conditions (slow, offline)
  - Keep test suite reasonably fast (<10 minutes for critical path)
  - Use data cleanup between tests

### Fixtures
- Location: `tests/fixtures/`
- Focus: Reusable test data
- Types:
  - JSON files with sample data (symbols, accounts, positions)
  - CSV files for data import/export testing
  - Image files for upload testing
  - Mock API responses
  - Database seed files for testing
- Guidelines:
  - Keep fixtures small and focused
  - Avoid sensitive data
  - Version control friendly (text-based)
  - Document what each fixture contains
  - Consider using factories/generators for dynamic data

### Test Helpers
- Location: `tests/helpers/`
- Focus: Reusable testing utilities
- Examples:
  - `test-server.ts` - Sets up a test instance of the server
  - `test-db.ts` - Manages test database lifecycle
  - `mock-mt5.ts` - Mocks MT5 API responses
  - `auth-helper.ts` - Handles authentication in tests
  - `wait-for.ts` - Utilities for waiting for conditions
  - `assert-helper.ts` - Custom assertions
  - `test-containers.ts` - Docker-based test containers for dependencies
- Guidelines:
  - Keep helpers focused and reusable
  - Document usage
  - Make helpers configurable
  - Avoid test-specific logic in helpers

### Test Configuration
- Location: `tests/config/` or root
- Files:
  - `jest.config.ts` - Jest configuration
  - `playwright.config.ts` - Playwright configuration (if using Playwright)
  - `.mocharc.json` - Mocha configuration (if using Mocha)
  - `test.env` - Test environment variables
- Guidelines:
  - Extend base configuration where possible
  - Keep configuration DRY
  - Document any test-specific settings
  - Ensure consistency across test types

## Implementation Guidelines
1. Write tests before or alongside new code (TDD or concurrent)
2. Test behavior, not implementation
3. Make tests deterministic and repeatable
4. Keep tests independent (no shared state between tests)
5. Use meaningful test names that describe the expected behavior
6. Group related tests with describe blocks
7. Use beforeEach/afterEach for setup/teardown
8. Test both positive and negative cases
9. Test edge cases and boundary conditions
10. Test error handling and exception paths
11. Avoid testing private methods directly (test through public interface)
12. Use test doubles appropriately (don't over-mock)
13. Keep test setup minimal and focused
14. Make tests fast - slow tests discourage running them
15. Aim for meaningful coverage, not just high percentage
16. Test async code properly (await promises, use done callback)
17. Use snapshot testing cautiously (for stable outputs)
18. Implement proper test isolation (clean database, clear mocks)
19. Consider using test categories/tags for different test types
20. Regularly review and refactor tests as code evolves

## Integration Plan

### Stage 1: Foundation
#### Stage 1.1: Test Environment Setup
1. Create the tests directory structure:
   - Create `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/fixtures/`, `tests/helpers/`, `tests/config/`
2. Choose and configure testing framework (Jest or Vitest recommended):
   - Initialize Jest/Vitest in the project
   - Configure test environment, test matchers, coverage reporting
   - Set up test setup and teardown files
3. Set up test environment:
   - Create test database instance (separate from development/production)
   - Configure test environment variables
   - Set up any required test services or mocks
   - Prepare test data loading mechanisms

#### Stage 1.2: Initial Test Writing
1. Write tests for new code as it's developed:
   - Start with new utils, services, and lib components as they are implemented
   - Write unit tests for each new function, class, and module
   - Focus on testing individual units in isolation
2. Write tests for controllers and middleware:
   - Test controller methods in isolation
   - Test middleware functions independently
   - Test error handling and edge cases
   - Validate input/output transformations

### Stage 2: Early Testing
#### Stage 2.1: Service and Library Testing
1. Write comprehensive tests for services:
   - Test tradeStore methods (getState, enqueueCommand, updateRiskGuard, etc.)
   - Test mcpServer methods (tool execution, JSON-RPC handling)
   - Test websocketServer methods (connection handling, broadcasting)
   - Test indicatorEngine and strategyEngine methods
2. Write comprehensive tests for lib components:
   - Test utility functions (format, math, string, validation, etc.)
   - Test library abstractions (if any exist)
   - Test edge cases and error conditions
3. Write tests for new utils as they are implemented:
   - Test format.ts functions (formatPrice, formatLotSize, etc.)
   - Test math.ts functions (calculatePipValue, calculateMarginRequired, etc.)
   - Test string.ts functions (capitalize, slugify, etc.)
   - Test validation.ts functions (validateSymbol, validateLotSize, etc.)
   - Test date.ts functions (toUnixTimestamp, fromUnixTimestamp, etc.)
   - Test async.ts functions (retry, timeout, debounce, etc.)
   - Test object.ts and array.ts functions
   - Test cache.ts and id.ts functions

#### Stage 2.2: Controller and Middleware Testing
1. Write tests for controllers:
   - Test apiController methods (getState, enqueueCommand, updateRiskGuard, etc.)
   - Test mt5Controller methods (healthCheck, handleEASync, etc.)
   - Test error handling and validation
   - Test dependency injection and service interaction
2. Write tests for middleware:
   - Test logger middleware (request/response logging)
   - Test validator middleware (input validation)
   - Test auth middleware (token validation, user attachment)
   - Test errorHandler middleware (error formatting, status codes)
   - Test rateLimiter middleware (rate limiting logic)
   - Test cors middleware (CORS headers, preflight handling)
   - Test compression and helmet middleware if implemented

### Stage 3: Integration and Expansion
#### Stage 3.1: Integration Test Implementation
1. Implement integration tests for critical API endpoints:
   - Test /state endpoint (getState functionality)
   - Test /commands endpoint (command enqueuing, validation)
   - Test /risk endpoint (risk guard updates)
   - Test /kill-switch endpoint (kill switch toggling)
   - Test MCP endpoints (/mcp/sse, /mcp/messages)
   - Test MT5 endpoints (/sync, /tick, /result, /health, etc.)
2. Set up E2E testing framework if needed:
   - Choose between Playwright or Cypress
   - Configure test environment, browser options, test runners
   - Set up test data loading and cleanup mechanisms
   - Configure reporting and video/trace capture if needed
3. Write tests for existing critical functionality:
   - Test core trading workflows
   - Test MT5 EA synchronization process
   - Test WebSocket real-time updates
   - Test MCP tool execution
   - Test risk guard functionality
   - Test daemon worker thread functionality

#### Stage 3.2: Test Helper Development
1. Develop test helpers:
   - Create test-server.ts for setting up test server instances
   - Create test-db.ts for managing test database lifecycle
   - Create mock-mt5.ts for mocking MT5 API responses
   - Create auth-helper.ts for handling authentication in tests
   - Create wait-for.ts for waiting for conditions in tests
   - Create assert-helper.ts for custom assertions
   - Create test-containers.ts for Docker-based test containers
2. Make helpers focused, reusable, and configurable
3. Document usage and best practices for each helper

### Stage 4: Reporting and Optimization
#### Stage 4.1: Coverage Reporting and CI Integration
1. Add test coverage reporting:
   - Configure Jest/Vitest to generate coverage reports
   - Set up coverage thresholds and enforcement
   - Integrate with CI/CD pipelines for coverage gates
   - Report coverage in HTML, JSON, or LCOV formats
2. Implement continuous integration to run tests on every push:
   - Configure GitHub Actions, GitLab CI, or other CI system
   - Set up test execution on pull requests and pushes
   - Configure test caching and parallelization where appropriate
   - Set up notifications for test failures
3. Establish team testing conventions and code review practices:
   - Define testing standards and guidelines
   - Establish code review checklists for testing
   - Set up testing documentation and onboarding materials
   - Establish testing culture and expectations

#### Stage 4.2: Test Effectiveness and Optimization
1. Review test effectiveness and adjust strategy:
   - Analyze test coverage reports
   - Identify undertested areas and gaps
   - Review test failure patterns and flakiness
   - Assess test maintenance overhead
2. Achieve target coverage goals and maintain:
   - Aim for meaningful coverage (not just percentage)
   - Focus on critical paths and complex logic
   - Maintain test quality and reliability
   - Regularly review and refactor tests as code evolves
3. Monitor test performance and flakiness:
   - Track test execution times
   - Identify and fix slow tests
   - Address flaky tests and improve reliability
   - Optimize test setup and teardown procedures

## Benefits
- Early detection of bugs and regressions
- Confidence to refactor and modify code
- Documentation of expected behavior
- Improved code design (testability drives better architecture)
- Faster debugging when issues arise
- Reduced production incidents
- Better team collaboration and knowledge sharing
- Compliance with quality standards
- Increased customer satisfaction
- Reduced cost of fixing bugs over time

## Dependencies
- Testing framework: Jest or Vitest (recommended)
- Assertion library: Built-in to Jest/Vitest or Chai
- Mocking library: Built-in to Jest/Vitest or Sinon.js
- HTTP testing: Supertest
- Test doubles: Built-in mocking capabilities
- Coverage reporting: Built-in to Jest/Vitest or Istanbul
- E2E testing: Playwright or Cypress (if needed)
- Test data factories: Factory.js or similar
- Database testing: Testcontainers or similar
- Code coverage: Istanbul (jscoverage) or built-in
- CI integration: GitHub Actions, GitLab CI, etc.

## Timeline (Stage-Based)
- **Stage 1: Foundation**
  - **Stage 1.1: Test Environment Setup** - Create tests directory structure, choose/configure testing framework, set up test environment
  - **Stage 1.2: Initial Test Writing** - Write tests for new code as it's developed (utils, services, lib); write tests for controllers and middleware
- **Stage 2: Early Testing**
  - **Stage 2.1: Service and Library Testing** - Write comprehensive tests for services and lib components; test new utils as implemented
  - **Stage 2.2: Controller and Middleware Testing** - Write tests for controllers; write tests for middleware
- **Stage 3: Integration and Expansion**
  - **Stage 3.1: Integration Test Implementation** - Implement integration tests for critical API endpoints; set up E2E testing framework if needed; write tests for existing critical functionality
  - **Stage 3.2: Test Helper Development** - Develop test helpers (test-server, test-db, mock-mt5, auth-helper, wait-for, assert-helper, test-containers)
- **Stage 4: Reporting and Optimization**
  - **Stage 4.1: Coverage Reporting and CI Integration** - Add coverage reporting, implement CI, establish team testing conventions
  - **Stage 4.2: Test Effectiveness and Optimization** - Review test effectiveness, achieve target coverage goals, monitor test performance and flakiness