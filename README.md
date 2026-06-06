# Event Registration System API

This is a backend API I built for the Innovaxel Summer Internship 2026. The task was to create a system where you can create events, register users for them, and handle edge cases like full events and duplicate registrations.

I used Node.js, Express, and Prisma ORM with PostgreSQL. One of the main things I learned while building this was how to handle race conditions — where two users try to grab the last seat at the same time. I ended up using Prisma transactions to deal with that.

**Stack:** Node.js · Express.js · Prisma ORM · PostgreSQL · Jest + Supertest

---

## Getting Started

**1. Clone the repo**

```bash
gh repo clone Hanzala-Naseer/B0626-Hanzala-Naseer-Innovaxel-Backend
cd B0626-Hanzala-Naseer-Innovaxel-Backend
```

**2. Install dependencies**

```bash
npm install
```

**3. Set up the database**

```bash
npx prisma migrate dev
```

If the client isn't generated automatically:

```bash
npx prisma generate
```

**4. Start the server**

```bash
npm run dev   # uses nodemon, restarts on changes
npm start     # plain node
```

Runs on `http://localhost:3000`

---

## Environment Variables

Create a `.env` in the root:

```
DATABASE_URL=postgresql://user:password@localhost:5432/yourdb
PORT=3000
```

For tests I used a separate database so the test data doesn't mix with real data. Create `.env.test`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/yourdb_test
NODE_ENV=test
```

The app loads `.env.test` automatically when `NODE_ENV=test`.

---

## API Endpoints

### Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/events` | Get all events |
| `POST` | `/events` | Create an event |
| `GET` | `/events?upcoming=true` | Only future events |
| `GET` | `/events?sort=desc` | Sort by date (descending) |

**Creating an event:**

```json
{
  "name": "Tech Meetup",
  "totalSeats": 50,
  "eventDate": "2026-09-01T18:00:00Z"
}
```

### Registrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/registrations` | Register a user |
| `DELETE` | `/registrations/:id` | Cancel a registration |

**Registering a user:**

```json
{
  "userName": "hanzala",
  "eventId": 1
}
```

---

## Features

- Create and view events
- Register users for events
- Cancel registrations
- Blocks duplicate registrations (same user can't register twice for the same event)
- Blocks registration if the event is already full
- Filter for upcoming events only
- Sort events by date
- Race condition handling using Prisma transactions

---

## How I Handled Seat Logic

When an event is created, `availableSeats` starts equal to `totalSeats`.

When someone registers, the API only decrements `availableSeats` if it's still above 0. If two requests hit at the exact same time, only one will get through — the other gets a 409. This was the trickiest part to get right.

When a registration is cancelled, the seat gets added back inside a transaction so the count stays accurate.

---

## Running Tests

Make sure `.env.test` points to a separate test database, then:

```bash
npm test
```

I wrote tests using Jest and Supertest. They run sequentially (`--runInBand` in `package.json`) because parallel DB tests kept interfering with each other.

There's also a concurrency test in `src/tests/race-test.js` that sends multiple requests at the same time to make sure overbooking actually doesn't happen.

---

## Notes

- This project was built for learning and as an internship submission — not meant for production
