# Hun Sen Turi Secondary School — Management System (Backend)

The REST API for the Hun Sen Turi Secondary School Management System, a lower secondary school
(junior high) in Cambodia serving **Grade 7, Grade 8 and Grade 9**.

```text
School      Hun Sen Turi Secondary School
Type        Lower secondary school (junior high), Cambodia
Grades      Grade 7 · Grade 8 · Grade 9
Curriculum  Cambodian lower secondary (MoEYS)
Exit exam   Grade 9 National Examination (Diplôme)
```

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| Language | TypeScript (strict) |
| Database | PostgreSQL 14+ via `pg`, raw parameterized SQL — no ORM |
| Auth | bcrypt, jsonwebtoken (access + rotating refresh tokens) |
| Validation | Zod |
| Security | helmet, cors, express-rate-limit |
| Testing | Vitest |

## Getting started

```bash
createdb hun_sen_turi
cp .env.example .env       # then set DATABASE_URL, JWT_SECRET and JWT_REFRESH_SECRET
npm install
npm run migrate
npm run seed
npm run dev
```

The API starts on `http://localhost:3000` under `/api/v1`, with a health probe at `/health`.

The seed creates one super administrator. **Change the password after the first sign-in.**

```text
username: superadmin
password: ChangeMe123!
```

`npm run seed:demo` optionally adds a sample school — teachers, students and guardians — on top.
It is deliberately separate from `npm run seed` so a real deployment never gets those accounts.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the API in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | Show applied and pending migrations |
| `npm run migrate:down` | Roll back the last applied migration |
| `npm run seed` | Seed roles, permissions, curriculum and the super admin |
| `npm run seed:demo` | Add optional demo teachers, students and guardians |
| `npm run typecheck` | Type-check the source and the tests |
| `npm test` | Run the test suite |

## Architecture

Every module follows the same chain, and business logic never lives in a controller:

```text
Route → Controller → Validation → Service → Repository → PostgreSQL
```

- **Route** — endpoint definitions and permission gates
- **Controller** — request, response and HTTP status only
- **Service** — business rules, transactions, domain authorization
- **Repository** — SQL and database access only

```text
src/
├── config/        env validation, permission and role catalogue
├── database/      connection, migrations/, seeds/
├── middleware/    auth · role · validation · error · rate limit
├── modules/       25 domain modules
├── schemas/       shared Zod primitives
├── types/
└── utils/         response envelope, errors, pagination, SQL helpers
```

## Non-negotiable rules

- **Student history first.** `enrollments` is the student↔class relationship, never a static
  `students.class_id`. A student's Grade 7 → Grade 9 record must survive every class change.
- **Academic year isolation.** Classes, enrolments, schedules, assessments, grades and report cards
  all carry an academic year.
- **Backend authorization is mandatory.** A hidden button in React is not security.
- **Teacher scope is the class–subject pair.** The Physics teacher of 8A may enter Physics marks
  for 8A and nothing else. Enforced in the service layer.
- **Students read only their own record**, resolved from the token (`/students/me/...`), never from
  a path id. Homework submission is the only write a student may perform.
- **A published national examination result is immutable.** A correction is an amendment that keeps
  the superseded value and is audit-logged; national results never enter the weighted term average.
- **Soft delete** students, teachers, parents, classes and subjects rather than destroying them.
- **Transactions** for multi-step dependent writes.
- **Server-side pagination, search and filtering** for every large dataset.
- **Never expose** `password_hash`, private tokens, or internal database errors.

## API conventions

Base path `/api/v1`.

```text
/auth  /users  /roles
/academic-years  /grade-levels  /rooms  /subjects  /classes
/teachers  /students  /parents  /enrollments
/schedules  /attendance
/assessments  /exams  /national-exams  /grades  /report-cards  /assignments  /behaviors
/announcements  /notifications  /dashboard  /audit-logs
```

Success:

```json
{ "success": true, "message": "Student created successfully", "data": {} }
```

Error:

```json
{ "success": false, "message": "Student not found", "error": { "code": "STUDENT_NOT_FOUND" } }
```

Paginated:

```json
{ "success": true, "data": [], "pagination": { "page": 1, "limit": 20, "total": 120, "totalPages": 6 } }
```

## Testing

```bash
npm test
```

The unit tests cover pure logic — pagination and SQL building, the JWT and password helpers, the
shared Zod primitives, role and permission checks, weighted grade calculation, schedule conflict
classification, the attendance rate and the national examination pass rate — and need nothing but
Node.

The API tests drive real HTTP requests against a real PostgreSQL database. They skip themselves,
printing why, when no migrated and seeded database answers at `DATABASE_URL`, so `npm test` stays
green on a machine without PostgreSQL.

## Environment

`.env.example` is the template. **Never commit `.env`** — it holds `DATABASE_URL`, `JWT_SECRET`,
`JWT_REFRESH_SECRET` and the seed password. Generate long random values for both JWT secrets before
deploying anywhere real.
