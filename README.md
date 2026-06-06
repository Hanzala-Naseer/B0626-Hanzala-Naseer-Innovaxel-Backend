# Event Registration System API

This is a backend API for managing events and user registrations.  
It was built as a take-home assignment using Node.js, Express, Prisma, and PostgreSQL.

The main idea is simple: create events, let users register, and handle seat limits properly.

---

## Setup

```bash
git clone https://github.com/Hanzala-Naseer/B0626-Hanzala-Naseer-Innovaxel-Backend.git
cd B0626-Hanzala-Naseer-Innovaxel-Backend
npm install

Run Prisma migration:

npx prisma migrate dev

Start server:

npm run dev
Environment Variables

Create a .env file:

DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
PORT=3000

For tests, create .env.test:

DATABASE_URL="postgresql://user:password@localhost:5432/testdb"
NODE_ENV=test
API Endpoints
Events
POST /events → create event
GET /events → get all events
GET /events?upcoming=true → upcoming events only
GET /events?sort=asc|desc → sort by date
Registrations
POST /registrations → register user for event
DELETE /registrations/:id → cancel registration
Features
Create events with seat limits
Register users for events
Cancel registrations
Prevent duplicate registrations
Prevent overbooking
Filter upcoming events
Sort events by date
Input validation using Zod
Race condition handling using transactions
Seat Handling

When an event is created, availableSeats = totalSeats.

On registration:

Seat is reduced by 1 if available
If two requests come at the same time, only one succeeds because of transaction handling
If no seats are left, request fails with 409

On cancellation:

Seat is added back safely using transaction
Tests

Run tests:

npm test

Tests use Jest + Supertest.
All main flows like registration, cancellation, and overbooking are covered.