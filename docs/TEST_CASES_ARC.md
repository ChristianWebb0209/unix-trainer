# Test Case Execution System Design Document

## 1. Purpose

This document defines the architecture, data model, execution pipeline, and validation logic for handling test cases in the UNIX Trainer platform. The system must securely and reliably verify whether a user’s Bash/Unix/AWK command satisfies problem requirements.

---

## 2. Goals

* Allow infinite valid solutions (not single-answer matching)
* Safely execute untrusted user commands
* Provide deterministic grading
* Support hidden + visible tests
* Allow adding new problems without schema migrations
* Scale to many concurrent users

---

## 3. Non-Goals

* Persistent containers per user (phase 1)
* Distributed execution cluster (future)
* AI evaluation of answers

---

## 4. High-Level Architecture

```
Client Editor
     ↓
API Server
     ↓
Execution Service
     ↓
Sandbox Container
     ↓
Result Parser
     ↓
Response → Client
```

---

## 5. Problem Data Model

### Problem Object

```ts
interface Problem {
  id: string
  title: string
  description: string
  difficulty: "easy" | "medium" | "hard"
  starterCommand?: string
  tests: TestCase[]
  limits: ExecutionLimits
}
```

### Test Case

```ts
interface TestCase {
  id: string
  files?: Record<string,string>
  stdin?: string
  expectedStdout?: string
  expectedFiles?: Record<string,string>
  hidden?: boolean
}
```
