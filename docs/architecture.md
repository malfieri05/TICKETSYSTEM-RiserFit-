# Architecture Rules

## System Type
- Single-tenant internal ticketing system
- Modular monolith
- Built for one company, not multi-tenant SaaS

## Core Stack
- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Database: PostgreSQL
- Queue: Redis + BullMQ
- File storage: S3-compatible storage
- Real-time updates: SSE
- Error monitoring: Sentry

## Core Rules
- NestJS backend owns business logic
- PostgreSQL is the source of truth
- No permission logic in frontend only
- No microservices
- No Kubernetes
- No Kafka/event bus
- No random platform changes mid-build

## Core System Concepts
- RBAC + scope-based visibility
- Schema-driven ticket creation
- Department inbox/feed routing
- Template-driven subtask workflow engine
- Event-driven notifications
- Audit logging for important actions