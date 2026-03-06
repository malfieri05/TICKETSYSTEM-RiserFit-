# Engineering Standards

## Non-Negotiables
- Keep modules clean and separate
- No giant god files
- No duplicated business logic
- All permissions enforced server-side
- All schema changes through Prisma migrations
- Pagination on list endpoints
- Add indexes for heavy filters
- Use background jobs for expensive tasks
- Write tests for business-critical logic

## Required Tests
- Permissions / scope tests
- Ticket creation validation tests
- Department feed visibility tests
- Subtask dependency tests
- Notification trigger tests

## Definition of Done
A task is only done if:
- Code matches architecture rules
- Server-side permissions are enforced
- Tests pass
- No unrelated refactors were introduced