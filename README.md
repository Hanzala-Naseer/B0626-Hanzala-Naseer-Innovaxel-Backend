Event Registration System API

A backend API for creating events and handling user registrations.
Built as part of the Innovaxel Summer Internship 2026.

It supports seat limits, prevents duplicate registrations, and handles race conditions using transactions.

Tech Stack
Node.js
Express.js
Prisma ORM
PostgreSQL / SQLite
Jest + Supertest
Getting Started
1. Clone the repo
gh repo clone Hanzala-Naseer/B0626-Hanzala-Naseer-Innovaxel-Backend
cd B0626-Hanzala-Naseer-Innovaxel-Backend
2. Install dependencies
npm install
3. Setup database

Run Prisma migrations:

npx prisma migrate dev

If needed, generate client:

npx prisma generate
4. Start the server
npm run dev   # development (nodemon)
npm start     # production

Server runs on:

http://localhost:3000
Environment Variables

Create a .env file:

DATABASE_URL=postgresql://user:password@localhost:5432/yourdb
PORT=3000

For testing, create .env.test:

DATABASE_URL=postgresql://user:password@localhost:5432/yourdb_test
NODE_ENV=test

Tests automatically use .env.test when NODE_ENV=test.

API Endpoints
Events
Method	Endpoint	Description
GET	/events	Get all events
POST	/events	Create event
GET	/events?upcoming=true	Get upcoming events
GET	/events?sort=desc	Sort events by date

Create Event

{
  "name": "Tech Meetup",
  "totalSeats": 50,
  "eventDate": "2026-09-01T18:00:00Z"
}
Registrations
Method	Endpoint	Description
POST	/registrations	Register user
DELETE	/registrations/:id	Cancel registration

Register User

{
  "userName": "hanzala",
  "eventId": 1
}
Features
Create and view events
Register users for events
Cancel registrations
Prevent duplicate registrations
Prevent overbooking (seat limit protection)
Event filtering (upcoming events)
Sorting by date
Input validation using Zod
Race condition handling using Prisma transactions
How Seat Logic Works

When an event is created, availableSeats = totalSeats.

When someone registers:

It checks if seats are available
Decreases seat count by 1
Blocks request if event is full

If multiple requests hit at the same time, only one succeeds due to transaction handling.

When a registration is cancelled, the seat is added back safely inside a transaction.

Running Tests

Make sure .env.test is set up with a separate database.

Then run:

npm test

Tests use Jest + Supertest.

The project also includes concurrency tests to make sure overbooking doesn’t happen.

Notes
Prisma is used for DB handling
Tests run sequentially using --runInBand
Project is structured for learning + internship submission, not production scale