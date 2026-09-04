# Diamond Rent Car — System Context

## Project Purpose

Diamond Rent Car is a management system for the Diamond Rent Car office.

## Source of Truth

- The Diamond HTML Demo is the source of truth for frontend behavior and user flows.
- Do not invent features or workflows that are not present in the Demo unless explicitly requested.
- If the Demo is ambiguous or conflicts with documentation, document the conflict instead of guessing.

## Backend Foundation

- The system does not use a new backend built from scratch.
- The approved backend is the existing Fastify Backend Template at `APP/backend`.
- Preserve its current architecture.
- Reuse the existing Authentication, Authorization, Roles, and Permissions; do not rebuild them.

## Frontend

- The approved frontend is at `APP/frontend`.
- It will be built to match the Demo.

## Working Method

Page
→ Backend
→ Frontend
→ Testing
→ Documentation
→ Next Page

Each Demo page is handled independently and completed end-to-end before moving to the next page.

## Documentation Rule

Every new Flow or Feature that is defined or implemented must receive concise documentation under `DOCU`, so a new Session can understand what has been built.

- Documentation must be proportional to the size of the idea.
- Do not create documentation for its own sake.
- No documentation file may exceed 500 lines.
- Split large topics into smaller linked files.

## Current Stage

The project is currently in the stage of:

- Stabilizing the Workspace.
- Understanding the Demo.
- Understanding the Backend Template.
- Diamond page implementation has not started yet.

This context does not document database details or APIs.
