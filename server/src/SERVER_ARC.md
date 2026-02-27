1. Purpose

The server is responsible for:

authenticating users

serving problem data

executing user code safely inside containers

validating outputs against test cases

storing progress and results

It is a stateless API layer that orchestrates services and infrastructure.
All heavy logic lives in services, not routes or controllers.

2. High-Level Architecture
Client → Routes → Controllers → Services → Infrastructure
                                      ↓
                               Database / Docker / Cache

Layer responsibilities:

Layer	Responsibility
Routes	HTTP mapping only
Controllers	request parsing + response formatting
Services	business logic
Types	shared contracts
Infra	external systems
3. Folder Structure
server/
 ├── src/
 │   ├── routes/
 │   ├── controllers/
 │   ├── services/
 │   ├── types/
 │   ├── middleware/
 │   ├── utils/
 │   ├── config/
 │   └── index.ts
 │
 ├── dist/          (compiled output)
 ├── package.json
 └── tsconfig.json
4. Folder Responsibilities
/routes

Defines API endpoints.

Rules:

no logic

no database calls

no docker calls

Each file exports an Express router.

Example:

POST /execute → execution.controller.run()
GET /problems → problem.controller.list()
/controllers

Controllers translate HTTP ↔ service calls.

Responsibilities:

parse body / params

validate shape

call services

return JSON

Controllers must never contain business logic.

/services

Core system logic lives here.

Services are pure modules responsible for:

execution

validation

container management

problem retrieval

They may call:

database

docker

filesystem

They must NOT:

reference Express

access request objects

/types

Defines all shared data contracts.

Examples:

ExecutionRequest
ExecutionResult
Problem
User
TestCase

All layers import from here to stay consistent.

/middleware

Reusable Express middleware.

Examples:

auth

rate limit

logging

error handler

/utils

Pure helper functions.

Examples:

string normalization

output diffing

timeout wrappers

Must be deterministic and side-effect free.

/config

Environment + system configuration.

Examples:

docker image names

execution limits

db connection

secrets

No logic — only configuration objects.

5. Core Services
ContainerService

Handles sandbox environments.

Responsibilities:

create container

execute command

capture stdout/stderr

enforce limits

destroy container

ExecutionService

Runs user code.

Flow:

input → container → run command → capture output → return result

Never validates correctness.

ValidationService

Checks correctness.

Compares:

expected output
vs
actual output

Returns structured verdict.

ProblemService

Provides problem data.

Responsibilities:

fetch problems

fetch test cases

hide private tests

pagination

6. Execution Dataflow

When user presses Run Code

Client
  ↓
POST /execute
  ↓
ExecutionController
  ↓
ExecutionService
  ↓
ContainerService
  ↓
Docker container runs script
  ↓
Output captured
  ↓
ValidationService
  ↓
Controller returns result JSON
7. API Response Standard

All responses must follow:

{
  success: boolean,
  data?: T,
  error?: string
}

Never return raw values.
Never leak stack traces.

8. Design Constraints (Strict)

These rules must never be violated:

Routes are thin.

Controllers are translators.

Services hold logic.

Types define contracts.

No cross-layer shortcuts.

9. Execution Security Model

User code must:

run in isolated container

have CPU limit

have memory limit

have timeout

have no network access

have read-only filesystem except working dir

Containers must be destroyed after execution.

10. Extensibility Philosophy

The system must allow:

adding new problem types

adding new languages

adding new validators

WITHOUT modifying existing logic.

This is achieved via:

service modularity

typed contracts

dependency injection

11. Mental Model for Contributors / LLM Agents

When adding a feature, ask:

Which layer should own this responsibility?

If it touches:

Concern	Layer
HTTP	Controller
Routing	Routes
Logic	Service
Data shape	Types
External system	Service
12. Example Request Trace (Concrete)

User runs:

grep foo file.txt

Internal flow:

execution.routes.ts
 → execution.controller.ts
 → execution.service.ts
 → container.service.ts
 → docker run alpine sh -c "grep foo file.txt"
 → stdout returned
 → validation.service.ts
 → JSON response
13. Non-Goals

Server will NOT:

render UI

store editor state

execute code directly on host

trust client validation

14. Summary Definition

This server is an execution orchestration API.
It exists to safely run code, evaluate it, and return structured results.

Everything else is secondary.