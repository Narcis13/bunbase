---
phase: 10-user-authentication
plan: 01
subsystem: auth
tags: [types, validation, schema, collection]

dependency-graph:
  requires: []
  provides:
    - User and auth token types (User, UserWithHash, UserTokenPayload, RefreshTokenPayload)
    - Password validation function with configurable rules
    - Auth collection type with system fields (email, password_hash, verified)
    - CollectionType, CollectionRules types
  affects:
    - 10-02 (JWT tokens use UserTokenPayload/RefreshTokenPayload)
    - 10-03 (Registration uses auth collections and password validation)
    - 10-04 (Login uses auth collections)

tech-stack:
  added:
    - jose (JWTPayload type for token interfaces)
  patterns:
    - Collection type differentiation (base vs auth)
    - System fields auto-generated for auth collections
    - Configurable password validation rules

key-files:
  created:
    - src/types/auth.ts
    - src/auth/validation.ts
    - src/auth/validation.test.ts
  modified:
    - src/types/collection.ts
    - src/core/database.ts
    - src/core/schema.ts
    - src/core/migrations.ts

decisions:
  - id: AUTH-01-1
    choice: Auth collections use type field ('base' | 'auth') rather than separate table
    reason: Simpler schema, leverages existing collection infrastructure
  - id: AUTH-01-2
    choice: Password requires 8+ chars, at least 1 letter, at least 1 number
    reason: Balance between security and usability; configurable minLength
  - id: AUTH-01-3
    choice: Auth system fields (email, password_hash, verified) auto-added to table
    reason: Ensures consistency, prevents users from missing required fields

metrics:
  duration: 4m
  completed: 2026-01-27
---

# Phase 10 Plan 01: Auth Types and Collection Schema Summary

Auth collection foundation with types, password validation, and schema support for user authentication.

## What Was Built

### 1. Auth Types (`src/types/auth.ts`)

- **User**: Safe user object (id, email, verified, timestamps)
- **UserWithHash**: Internal user with password_hash
- **AuthCollectionOptions**: Config for min password length, email verification requirement
- **UserTokenPayload**: JWT payload for 15-min access tokens
- **RefreshTokenPayload**: JWT payload for 7-day refresh tokens with tokenId for revocation

### 2. Password Validation (`src/auth/validation.ts`)

- **validatePassword(password, minLength?)**: Validates password meets requirements
- **PasswordValidationError**: Custom error class for validation failures
- Rules: min 8 chars (configurable), at least one letter, at least one number

### 3. Collection Type Extensions (`src/types/collection.ts`)

- **CollectionType**: `'base' | 'auth'`
- **CollectionRules**: Access control rules (listRule, viewRule, createRule, updateRule, deleteRule)
- **AUTH_SYSTEM_FIELDS**: Constant array `['email', 'password_hash', 'verified']`
- Extended **Collection** interface with type, options, rules fields

### 4. Schema Support (`src/core/schema.ts`, `src/core/migrations.ts`)

- **createCollection** now accepts options: `{ type?, authOptions?, rules? }`
- Auth collections automatically get system fields in SQL table
- Field conflict detection prevents defining email/password_hash/verified on auth collections
- **isAuthCollection(name)**: Helper to check if collection is auth type
- **createTableSQL/migrateTable**: Support auth collection type for correct schema

### 5. Database Schema (`src/core/database.ts`)

- **_collections** table updated with: type, options, rules columns

## Task Execution

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Auth types and password validation | 918a112 | src/types/auth.ts, src/auth/validation.ts, src/auth/validation.test.ts |
| 2 | Extend collection types for auth | bfd4712 | src/types/collection.ts, src/core/database.ts |
| 3 | Update schema for auth collections | 2d0ef3f | src/core/schema.ts, src/core/migrations.ts |

## Verification Results

- All 234 tests pass (including 7 new password validation tests)
- Auth collection creates with system fields (email UNIQUE NOT NULL, password_hash NOT NULL, verified DEFAULT 0)
- Field conflict detection works (cannot define email/password_hash/verified on auth collection)
- isAuthCollection helper correctly identifies auth collections
- Types compile without errors

## Requirements Satisfied

- **AUTH-01**: Auth collection type exists with system fields
- **AUTH-09**: Password validation enforces 8+ chars, letter, number

## Deviations from Plan

None - plan executed exactly as written.

## Next Plan Readiness

**10-02 (JWT Infrastructure)** can proceed:
- UserTokenPayload and RefreshTokenPayload types are available
- Auth collection type is defined for user storage
- No blockers identified
