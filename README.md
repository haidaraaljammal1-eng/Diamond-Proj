# Diamond Rent Car System Workspace

This is the unified workspace for the Diamond Rent Car system.

## APP/backend

Fastify Backend Template + Diamond Backend Modules.

Local database setup (each laptop has its own Postgres): from `APP/backend` run `npm run dev:bootstrap`. See `DOCU/00-system-overview/development-database-bootstrap.md`.

## APP/frontend

Diamond Frontend. This directory is reserved for the future frontend application.

## DOCU

Central documentation and Source of Truth.

Open `DIAMOND-SYSTEM` as the workspace root in VS Code so developers and AI Agents can access the backend, frontend, and documentation in one window.

The implementation workflow is:

`Page -> Backend -> Frontend -> Testing`
