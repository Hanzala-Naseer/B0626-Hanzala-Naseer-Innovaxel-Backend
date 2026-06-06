/**
 * event.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Jest + Supertest end-to-end tests for Event endpoints.
 *
 * Derived entirely from the ACTUAL codebase:
 *   src/routes/eventRoutes.js
 *   src/controllers/eventController.js
 *   src/services/eventService.js
 *   src/validations/eventValidation.js
 *   src/middlewares/errorHandler.js
 *   prisma/schema.prisma
 *
 * Routes under test:
 *   POST /events
 *   GET  /events
 *
 * IMPORTANT IMPLEMENTATION NOTES (observed from source):
 *
 * 1. eventController.createEvent calls next(error) for ALL errors, including
 *    business errors from the service. The errorHandler reads err.statusCode
 *    and responds with { message }.
 *
 * 2. eventService.createEvent throws errors with statusCode set:
 *    - Duplicate name      → statusCode 409, message "Event name already exists"
 *    - totalSeats <= 0     → statusCode 400, message "Total seats must be greater than 0"
 *    - date in past        → statusCode 400, message "Event date must be in the future"
 *    These are SERVICE-layer checks that run AFTER validation; in normal flow they
 *    are redundant (validation blocks them first), but the service path is live code.
 *
 * 3. Validation errors are thrown with statusCode 400 and routed through errorHandler.
 *    All event endpoint responses carry { message }.
 *
 * 4. GET /events always returns 200. Each event in the array has:
 *    { id, name, totalSeats, eventDate, totalRegistrations, availableSeats }
 *
 * 5. ?upcoming=true filters by eventDate > now (string equality "true" required).
 *    ?sort=desc sorts descending; anything else (including absence) sorts ascending.
 *
 * 6. "2027-13-01" passes the YYYY-MM-DD regex but creates an Invalid Date.
 *    The validation's `date <= today` comparison with NaN evaluates to false,
 *    so the invalid date slips past validation and Prisma throws a 500.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const request = require("supertest");
const app = require("../app");
const prisma = require("../config/prisma");

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a YYYY-MM-DD date string that is `daysFromNow` days in the future.
 * The default of 30 is well clear of "today" boundary issues.
 */
const futureDateStr = (daysFromNow = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

/**
 * Returns a YYYY-MM-DD date string that is `daysAgo` days in the past.
 */
const pastDateStr = (daysAgo = 1) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};

/**
 * Returns today's date as a YYYY-MM-DD string.
 * The validation sets today to midnight, so this date is <= today → rejected.
 */
const todayDateStr = () => new Date().toISOString().split("T")[0];

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Registration rows first due to FK constraint.
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});

// =============================================================================
// POST /events
// =============================================================================

describe("POST /events", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // HAPPY PATH
  // ───────────────────────────────────────────────────────────────────────────

  it("creates an event successfully with valid data and returns 201", async () => {
    // CODE PATH: validateCreateEvent passes → eventService.createEvent →
    //            prisma.event.create → controller res.status(201).json(event)
    const payload = {
      name: "Tech Summit 2026",
      totalSeats: 100,
      eventDate: futureDateStr(),
    };

    const res = await request(app).post("/events").send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      name: "Tech Summit 2026",
      totalSeats: 100,
      availableSeats: 100, // service sets availableSeats = totalSeats on create
    });
    expect(new Date(res.body.eventDate)).toBeInstanceOf(Date);
  });

  it("sets availableSeats equal to totalSeats on creation", async () => {
    // SERVICE: prisma.event.create({ data: { ..., availableSeats: totalSeats } })
    const res = await request(app).post("/events").send({
      name: "Seat Check Event",
      totalSeats: 42,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.availableSeats).toBe(42);
    expect(res.body.totalSeats).toBe(42);
  });

  it("trims leading/trailing whitespace from event name", async () => {
    // VALIDATION: data.name.trim() is used; stored name is "Trimmed Event"
    const res = await request(app).post("/events").send({
      name: "  Trimmed Event  ",
      totalSeats: 50,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Trimmed Event");
  });

  it("accepts totalSeats provided as a numeric string (coerced to number)", async () => {
    // VALIDATION: Number(data.totalSeats) — "50" becomes 50
    const res = await request(app).post("/events").send({
      name: "Coerced Seats Event",
      totalSeats: "50",
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(50);
  });

  it("accepts an extremely large valid seat count", async () => {
    // No upper-bound validation exists; any positive integer is accepted.
    const res = await request(app).post("/events").send({
      name: "Stadium Event",
      totalSeats: 999999,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(999999);
  });

  it("accepts exactly 1 seat (minimum valid boundary)", async () => {
    // VALIDATION: num > 0 && integer → passes
    const res = await request(app).post("/events").send({
      name: "Single Seat Event",
      totalSeats: 1,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(1);
  });

  it("accepts an event name with mixed letters and numbers", async () => {
    // VALIDATION: /^\\d+$/ only rejects ALL-digit names; "Event 2026" has letters too.
    const res = await request(app).post("/events").send({
      name: "Event 2026",
      totalSeats: 50,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
  });

  it("accepts a future date exactly 1 day from now", async () => {
    // VALIDATION: date > today (midnight); 1 day ahead is strictly after midnight today.
    const res = await request(app).post("/events").send({
      name: "Tomorrow Event",
      totalSeats: 10,
      eventDate: futureDateStr(1),
    });

    expect(res.status).toBe(201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MISSING REQUIRED FIELDS
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with 'name is required' when name is absent", async () => {
    // VALIDATION: errors[0] = "name is required"; statusCode=400; errorHandler → {message}
    const res = await request(app)
      .post("/events")
      .send({ totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is absent", async () => {
    // VALIDATION: data.totalSeats === undefined → errors[0] = "totalSeats is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "No Seats Event", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is absent", async () => {
    // VALIDATION: !data.eventDate → errors[0] = "eventDate is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "No Date Event", totalSeats: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  it("returns 400 about name when ALL fields are missing", async () => {
    // VALIDATION: errors are pushed in order; errors[0] is the name error.
    const res = await request(app).post("/events").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // EMPTY / WHITESPACE-ONLY VALUES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 when name is an empty string", async () => {
    // VALIDATION: !data.name (empty string is falsy) → "name is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 when name is whitespace only", async () => {
    // VALIDATION: data.name.trim() === "" → "name is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "   ", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is an empty string", async () => {
    // VALIDATION: data.totalSeats === "" → "totalSeats is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event A", totalSeats: "", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is null", async () => {
    // VALIDATION: data.totalSeats === null → "totalSeats is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event B", totalSeats: null, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVALID FIELD TYPES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with 'totalSeats must be a valid number' when totalSeats is a non-numeric string", async () => {
    // VALIDATION: Number("abc") → NaN → isNaN → "totalSeats must be a valid number"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event C", totalSeats: "abc", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be a valid number");
  });

  it("returns 400 with 'totalSeats must be an integer' when totalSeats is a float", async () => {
    // VALIDATION: Number.isInteger(10.5) === false → "totalSeats must be an integer"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event D", totalSeats: 10.5, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be an integer");
  });

  it("returns 400 with 'totalSeats must be an integer' when totalSeats is a string float", async () => {
    // VALIDATION: Number("2.5") = 2.5; Number.isInteger(2.5) === false
    const res = await request(app)
      .post("/events")
      .send({ name: "Event E", totalSeats: "2.5", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be an integer");
  });

  it("returns 400 with 'name is required' when name is an object", async () => {
    // VALIDATION: typeof {} !== "string" → "name is required"
    const res = await request(app)
      .post("/events")
      .send({ name: { foo: "bar" }, totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'name is required' when name is a number", async () => {
    // VALIDATION: typeof 123 !== "string" → "name is required"
    const res = await request(app)
      .post("/events")
      .send({ name: 123, totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is a number", async () => {
    // VALIDATION: typeof 20261201 !== "string" → "eventDate is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event F", totalSeats: 50, eventDate: 20261201 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is null", async () => {
    // VALIDATION: !data.eventDate (null is falsy) → "eventDate is required"
    const res = await request(app)
      .post("/events")
      .send({ name: "Event G", totalSeats: 50, eventDate: null });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NUMBER-ONLY EVENT NAME
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with 'event name cannot contain only numbers' for all-digit name", async () => {
    // VALIDATION: /^\\d+$/.test("12345") → true → "event name cannot contain only numbers"
    const res = await request(app)
      .post("/events")
      .send({ name: "12345", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("event name cannot contain only numbers");
  });

  it("returns 400 for a name that is only zeros", async () => {
    // VALIDATION: /^\\d+$/.test("000") → true
    const res = await request(app)
      .post("/events")
      .send({ name: "000", totalSeats: 10, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("event name cannot contain only numbers");
  });

  it("accepts a name that starts with digits but contains letters", async () => {
    // VALIDATION: /^\\d+$/.test("2026Summit") → false → no error for this rule
    const res = await request(app)
      .post("/events")
      .send({ name: "2026Summit", totalSeats: 10, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // BOUNDARY SEAT VALUES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is 0", async () => {
    // VALIDATION: num <= 0 → "totalSeats must be greater than 0"
    const res = await request(app)
      .post("/events")
      .send({ name: "Zero Seats Event", totalSeats: 0, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is negative", async () => {
    // VALIDATION: -10 <= 0 → "totalSeats must be greater than 0"
    const res = await request(app)
      .post("/events")
      .send({ name: "Negative Seats Event", totalSeats: -10, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is -1", async () => {
    // VALIDATION: boundary check — -1 <= 0 → error
    const res = await request(app)
      .post("/events")
      .send({ name: "Minus One Event", totalSeats: -1, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVALID DATE FORMATS
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with format error for eventDate in MM/DD/YYYY format", async () => {
    // VALIDATION: /^\\d{4}-\\d{2}-\\d{2}$/.test("01/30/2027") → false → format error
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format A", totalSeats: 50, eventDate: "01/30/2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate as ISO datetime string", async () => {
    // VALIDATION: "2027-01-30T10:00:00Z" does not match /^\\d{4}-\\d{2}-\\d{2}$/
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format B", totalSeats: 50, eventDate: "2027-01-30T10:00:00Z" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate with only year", async () => {
    // VALIDATION: "2027" does not match /^\\d{4}-\\d{2}-\\d{2}$/
    const res = await request(app)
      .post("/events")
      .send({ name: "Year Only Event", totalSeats: 50, eventDate: "2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate in DD-MM-YYYY format", async () => {
    // VALIDATION: "30-01-2027" → regex matches \\d{2}-\\d{2}-\\d{4}? No: first group needs 4 digits.
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format C", totalSeats: 50, eventDate: "30-01-2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns a non-201 response for structurally valid but semantically invalid date (month 13)", async () => {
    // BUG: "2027-13-01" matches regex but new Date("2027-13-01") → Invalid Date.
    // NaN <= today evaluates false, so no validation error is thrown.
    // Prisma receives an Invalid Date and throws a 500.
    const res = await request(app)
      .post("/events")
      .send({ name: "Invalid Month Event", totalSeats: 50, eventDate: "2027-13-01" });

    expect(res.status).not.toBe(201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // PAST / TODAY DATES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with 'eventDate cannot be in the past' for a past date", async () => {
    // VALIDATION: date <= today (midnight) → "eventDate cannot be in the past"
    const res = await request(app)
      .post("/events")
      .send({ name: "Past Event", totalSeats: 50, eventDate: pastDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });

  it("returns 400 with 'eventDate cannot be in the past' for a date 7 days ago", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Week Ago Event", totalSeats: 50, eventDate: pastDateStr(7) });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });

  it("returns 400 with 'eventDate cannot be in the past' for today's date", async () => {
    // VALIDATION: today is set to midnight; date === today is NOT > today → rejected.
    // "date <= today" evaluates true (equal dates).
    const res = await request(app)
      .post("/events")
      .send({ name: "Today Event", totalSeats: 50, eventDate: todayDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DUPLICATE NAMES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 409 with 'Event name already exists' on duplicate event name", async () => {
    // SERVICE: findUnique finds existing record → throws Error("Event name already exists")
    // with statusCode = 409 → errorHandler returns { message } with 409.
    const payload = { name: "Unique Conference", totalSeats: 50, eventDate: futureDateStr(60) };
    await request(app).post("/events").send(payload);

    const res = await request(app).post("/events").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Event name already exists");
  });

  it("detects duplicate name after whitespace trimming", async () => {
    // VALIDATION trims "  Same Name  " → "Same Name" before service check.
    // SERVICE: findUnique("Same Name") → found → 409.
    await request(app)
      .post("/events")
      .send({ name: "Same Name", totalSeats: 50, eventDate: futureDateStr(60) });

    const res = await request(app)
      .post("/events")
      .send({ name: "  Same Name  ", totalSeats: 100, eventDate: futureDateStr(90) });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Event name already exists");
  });

  it("allows creation of a second event with a different name", async () => {
    // Verify the duplicate check is name-specific, not global.
    await request(app)
      .post("/events")
      .send({ name: "Event One", totalSeats: 10, eventDate: futureDateStr(30) });

    const res = await request(app)
      .post("/events")
      .send({ name: "Event Two", totalSeats: 20, eventDate: futureDateStr(60) });

    expect(res.status).toBe(201);
  });
});

// =============================================================================
// GET /events
// =============================================================================

describe("GET /events", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // BASIC RETRIEVAL
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 200 with an empty array when no events exist", async () => {
    // SERVICE: findMany returns [] → map returns [] → controller res.status(200).json([])
    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("returns 200 with all created events", async () => {
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post("/events")
        .send({ name: `Listing Event ${i}`, totalSeats: 10 * i, eventDate: futureDateStr(i + 10) });
    }

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // COMPUTED FIELDS
  // ───────────────────────────────────────────────────────────────────────────

  it("returns events with the correct computed fields in each object", async () => {
    // SERVICE: map adds totalRegistrations (_count.registrations) and keeps availableSeats.
    // Expected shape: { id, name, totalSeats, eventDate, totalRegistrations, availableSeats }
    await request(app)
      .post("/events")
      .send({ name: "Fields Check Event", totalSeats: 80, eventDate: futureDateStr() });

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const event = res.body[0];
    expect(event).toHaveProperty("id");
    expect(event).toHaveProperty("name", "Fields Check Event");
    expect(event).toHaveProperty("totalSeats", 80);
    expect(event).toHaveProperty("eventDate");
    expect(event).toHaveProperty("totalRegistrations", 0);
    expect(event).toHaveProperty("availableSeats", 80);
  });

  it("returns totalRegistrations=0 and availableSeats=totalSeats for a newly created event", async () => {
    // No registrations yet → _count.registrations === 0; availableSeats === totalSeats.
    await request(app)
      .post("/events")
      .send({ name: "Fresh Event", totalSeats: 25, eventDate: futureDateStr() });

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.name === "Fresh Event");

    expect(event.totalRegistrations).toBe(0);
    expect(event.availableSeats).toBe(25);
  });

  it("correctly reflects availableSeats and totalRegistrations after registrations are added", async () => {
    // After 2 registrations: totalRegistrations=2, availableSeats=totalSeats-2.
    const createRes = await request(app)
      .post("/events")
      .send({ name: "Seats After Reg Event", totalSeats: 10, eventDate: futureDateStr() });
    const eventId = createRes.body.id;

    await request(app).post("/registrations").send({ userName: "Alice", eventId });
    await request(app).post("/registrations").send({ userName: "Bob", eventId });

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.id === eventId);

    expect(event.totalRegistrations).toBe(2);
    expect(event.availableSeats).toBe(8);
  });

  it("does not include internal _count field in the returned event objects", async () => {
    // SERVICE map removes _count; only mapped fields returned.
    await request(app)
      .post("/events")
      .send({ name: "No Count Field Event", totalSeats: 10, eventDate: futureDateStr() });

    const res = await request(app).get("/events");

    expect(res.body[0]).not.toHaveProperty("_count");
    expect(res.body[0]).not.toHaveProperty("registrations");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ?upcoming=true FILTER
  // ───────────────────────────────────────────────────────────────────────────

  it("returns only future events when ?upcoming=true is provided", async () => {
    // SERVICE: where.eventDate = { gt: new Date() } only when query.upcoming === "true"
    // We seed via API (API only allows future dates), verify all returned dates are future.
    await request(app)
      .post("/events")
      .send({ name: "Future Event A", totalSeats: 10, eventDate: futureDateStr(5) });
    await request(app)
      .post("/events")
      .send({ name: "Future Event B", totalSeats: 10, eventDate: futureDateStr(15) });

    const res = await request(app).get("/events?upcoming=true");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    res.body.forEach((event) => {
      expect(new Date(event.eventDate).getTime()).toBeGreaterThan(Date.now());
    });
  });

  it("returns all events when ?upcoming=false (non-'true' string disables filter)", async () => {
    // SERVICE: query.upcoming !== "true" → no where clause added → all events returned.
    await request(app)
      .post("/events")
      .send({ name: "All Events Test A", totalSeats: 10, eventDate: futureDateStr() });

    const res = await request(app).get("/events?upcoming=false");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns all events when ?upcoming param is absent", async () => {
    await request(app)
      .post("/events")
      .send({ name: "No Upcoming Param", totalSeats: 10, eventDate: futureDateStr() });

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns empty array for ?upcoming=true when no future events exist in DB", async () => {
    // DB is clean (beforeEach); no events → []
    const res = await request(app).get("/events?upcoming=true");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SORTING BEHAVIOR
  // ───────────────────────────────────────────────────────────────────────────

  it("returns events sorted ascending by eventDate by default (no sort param)", async () => {
    // SERVICE: orderBy: { eventDate: "asc" } when query.sort !== "desc"
    await request(app)
      .post("/events")
      .send({ name: "Later Event", totalSeats: 10, eventDate: futureDateStr(60) });
    await request(app)
      .post("/events")
      .send({ name: "Sooner Event", totalSeats: 10, eventDate: futureDateStr(10) });

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const timestamps = res.body.map((e) => new Date(e.eventDate).getTime());
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
  });

  it("returns events sorted descending by eventDate when ?sort=desc", async () => {
    // SERVICE: query.sort === "desc" → orderBy: { eventDate: "desc" }
    await request(app)
      .post("/events")
      .send({ name: "Early Event Sort", totalSeats: 10, eventDate: futureDateStr(10) });
    await request(app)
      .post("/events")
      .send({ name: "Late Event Sort", totalSeats: 10, eventDate: futureDateStr(60) });

    const res = await request(app).get("/events?sort=desc");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const timestamps = res.body.map((e) => new Date(e.eventDate).getTime());
    expect(timestamps[0]).toBeGreaterThanOrEqual(timestamps[1]);
  });

  it("returns events sorted ascending when ?sort=asc is explicitly provided", async () => {
    // SERVICE: query.sort !== "desc" → "asc" — "asc" string maps to "asc"
    await request(app)
      .post("/events")
      .send({ name: "Z Event Asc", totalSeats: 10, eventDate: futureDateStr(50) });
    await request(app)
      .post("/events")
      .send({ name: "A Event Asc", totalSeats: 10, eventDate: futureDateStr(15) });

    const res = await request(app).get("/events?sort=asc");

    expect(res.status).toBe(200);
    const timestamps = res.body.map((e) => new Date(e.eventDate).getTime());
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]);
  });

  it("can combine ?upcoming=true with ?sort=desc", async () => {
    await request(app)
      .post("/events")
      .send({ name: "Near Future Event", totalSeats: 5, eventDate: futureDateStr(5) });
    await request(app)
      .post("/events")
      .send({ name: "Far Future Event", totalSeats: 5, eventDate: futureDateStr(100) });

    const res = await request(app).get("/events?upcoming=true&sort=desc");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const timestamps = res.body.map((e) => new Date(e.eventDate).getTime());
    for (let i = 0; i < timestamps.length - 1; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
    }
    res.body.forEach((event) => {
      expect(new Date(event.eventDate).getTime()).toBeGreaterThan(Date.now());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // AVAILABLE SEATS CALCULATION
  // ───────────────────────────────────────────────────────────────────────────

  it("reflects availableSeats correctly after registering all seats (event full)", async () => {
    const createRes = await request(app)
      .post("/events")
      .send({ name: "Full Seats Event", totalSeats: 2, eventDate: futureDateStr() });
    const eventId = createRes.body.id;

    await request(app).post("/registrations").send({ userName: "User1", eventId });
    await request(app).post("/registrations").send({ userName: "User2", eventId });

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.id === eventId);

    expect(event.availableSeats).toBe(0);
    expect(event.totalRegistrations).toBe(2);
  });

  it("reflects availableSeats recovering after a cancellation", async () => {
    const createRes = await request(app)
      .post("/events")
      .send({ name: "Recover Seats Event", totalSeats: 3, eventDate: futureDateStr() });
    const eventId = createRes.body.id;

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.id === eventId);

    // availableSeats restored to full count; totalRegistrations = 0
    expect(event.availableSeats).toBe(3);
    expect(event.totalRegistrations).toBe(0);
  });
});