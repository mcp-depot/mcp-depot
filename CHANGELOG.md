# Changelog

All notable changes to MCP Depot will be documented in this file.

## [1.0.1] - 2026-05-07

### Added
- OAuth support for Google and GitHub login
- Tags feature for Skills and Integrations with filtering
- Admin User Management UI with CRUD operations

### Fixed
- SQLite compatibility - all PostgreSQL-specific syntax replaced with cross-database alternatives
- Triple header on Tools page
- Various CSS class fixes for Personas modal
- OAuth buttons hidden when not configured

### Changed
- Improved logging with structured pino logger throughout

## [1.0.0] - 2026-04-15

### Added
- Initial release
- MCP server implementation with SSE transport
- Integration management (REST, GraphQL, OAuth, etc.)
- Built-in tools for external MCP servers
- Skills and Personas management
- Prompt library
- Audit logging

### Features
- Support for SQLite and PostgreSQL databases
- Rate limiting for integrations
- Secret management via Infisical
- Tool call tracking and analytics