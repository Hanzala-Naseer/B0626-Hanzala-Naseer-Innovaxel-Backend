# Event Registration System API

Backend API developed as part of the Innovaxel Summer Internship Program 2026 assessment.

The application allows users to create events, register attendees, manage registrations, and handle real-world constraints such as limited seat availability, duplicate registrations, and concurrent registration requests.

## Tech Stack

* Node.js
* Express.js
* Prisma ORM
* PostgreSQL (Neon Database)
* Jest
* Supertest
* k6

---

## Features

### Event Management

* Create events with unique names
* Validate future event dates
* Configure total seat capacity
* View all events
* Retrieve a specific event by ID
* Filter upcoming events
* Sort events by date

### Registration Management

* Register users for events
* Prevent duplicate registrations
* Prevent registrations when an event is full
* Cancel registrations
* Automatically restore seats after cancellation

### Concurrency Handling

* Prevent overbooking during simultaneous registration requests
* Handle race conditions using Prisma transactions
* Maintain accurate seat counts under concurrent load

---

## Project Structure

```text
src
├── controllers
├── routes
├── services
├── validations
├── middleware
├── tests
└── app.js

prisma
├── schema.prisma
└── migrations
```

The project follows a layered architecture where:

* Routes define API endpoints
* Controllers handle HTTP requests and responses
* Services contain business logic
* Validations enforce input rules
* Prisma manages database operations

---

## Installation

### Clone Repository

```bash
git clone <repository-url>
cd B0626-Hanzala-Naseer-Innovaxel-Backend
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file:

```env
DATABASE_URL=your_database_connection_string
PORT=3000
```

Create a separate `.env.test` file for testing:

```env
DATABASE_URL=your_test_database_connection_string
NODE_ENV=test
```

### Run Database Migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### Start Server

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

Server runs on:

```text
http://localhost:3000
```

---

## API Endpoints

### Events

| Method | Endpoint                | Description                    |
| ------ | ----------------------- | ------------------------------ |
| POST   | `/events`               | Create a new event             |
| GET    | `/events`               | Retrieve all events            |
| GET    | `/events/:id`           | Retrieve event by ID           |
| GET    | `/events?upcoming=true` | Retrieve upcoming events       |
| GET    | `/events?sort=asc`      | Sort events by date ascending  |
| GET    | `/events?sort=desc`     | Sort events by date descending |

### Create Event Example

```json
{
  "name": "Tech Meetup 2027",
  "totalSeats": 50,
  "eventDate": "2027-09-01T18:00:00Z"
}
```

---

### Registrations

| Method | Endpoint             | Description                  |
| ------ | -------------------- | ---------------------------- |
| POST   | `/registrations`     | Register a user for an event |
| DELETE | `/registrations/:id` | Cancel a registration        |

### Register User Example

```json
{
  "userName": "Hanzala",
  "eventId": 1
}
```

---

## Validation Rules

### Event Creation

* Event name is required
* Event name must be unique
* Event name cannot contain only numbers
* Total seats must be greater than zero
* Total seats must be a positive integer
* Event date must be a valid future date

### Registration

* User name is required
* Event ID is required
* User cannot register twice for the same event
* Registration is rejected when event capacity is reached

---

## Seat Management Logic

When an event is created:

```text
availableSeats = totalSeats
```

When a user registers:

```text
availableSeats = availableSeats - 1
```

When a registration is cancelled:

```text
availableSeats = availableSeats + 1
```

All seat updates are performed inside database transactions to ensure consistency and prevent race-condition issues.

---

## Testing

### Automated Testing

The project includes:

* Unit tests
* Integration tests
* Validation tests
* Registration workflow tests
* Concurrency tests

Test Results:

```text
98/98 Tests Passed
```

Run tests:

```bash
npm test
```

---

### Postman Collection

A complete Postman collection is included for manual API testing:

```text
/postman
```

The collection covers:

* Event creation
* Event retrieval
* Validation scenarios
* Registration workflows
* Cancellation workflows
* Edge cases

---

### k6 Load & Concurrency Testing

k6 scripts are included to verify:

* Duplicate registration protection
* Last-seat race conditions
* Capacity enforcement under concurrent load

Run:

```bash
k6 run src/tests/race-test.js
```

Latest Results:

```text
✓ 100% Checks Passed
✓ No Overbooking
✓ No Duplicate Registrations
✓ No Server Errors
```

---

## Design Decisions

### Why Prisma?

Prisma provides:

* Type-safe database access
* Simplified query building
* Transaction support
* Better maintainability

### Why PostgreSQL?

PostgreSQL offers:

* Reliable transactional consistency
* Strong concurrency support
* Excellent integration with Prisma

### Why Transactions?

Transactions ensure that:

* Seat counts remain accurate
* Overbooking cannot occur
* Concurrent requests are handled safely

---

## Author

**Hanzala Naseer**

Innovaxel Summer Internship Program 2026 Backend Assessment Submission
