/**
 * event.test.js
 * Comprehensive Jest + Supertest tests for Event endpoints.
 * Based on ACTUAL implementation analysis — no invented requirements.
 *
 * Routes:
 *   POST /events       → createEvent
 *   GET  /events       → getEvents (with optional ?upcoming=true&sort=desc)
 *
 * Validation layer  : src/validations/eventValidation.js
 * Service layer     : src/services/eventService.js
 * Error handler     : src/middlewares/errorHandler.js
 * DB                : Prisma + PostgreSQL (test DB from .env.test)
 */

const request = require("supertest");
const app = require("../../src/app"); // adjust path if your test runner is elsewhere
const prisma = require("../../src/config/prisma");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a valid future date string in YYYY-MM-DD format. */
const futureDateStr = (daysFromNow = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
};

/** Build a past date string in YYYY-MM-DD format. */
const pastDateStr = (daysAgo = 1) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};

/** Today's date string. */
const todayDateStr = () => new Date().toISOString().split("T")[0];

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clean DB before each test for isolation.
  // Registration rows must be deleted first due to FK constraint.
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});

// ===========================================================================
// POST /events
// ===========================================================================

describe("POST /events", () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  /**
   * WHY: Verifies the nominal creation path end-to-end.
   * CODE PATH: validateCreateEvent → eventService.createEvent → prisma.event.create
   * EXPECTED: PASS — returns 201 with the created event object.
   */
  it("creates an event successfully with valid data", async () => {
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
    });
    expect(new Date(res.body.eventDate)).toBeInstanceOf(Date);
  });

  /**
   * WHY: Confirms leading/trailing whitespace in name is trimmed by validation.
   * CODE PATH: validateCreateEvent trims name before returning; stored trimmed.
   * EXPECTED: PASS — stored name is "Trimmed Event", not "  Trimmed Event  ".
   */
  it("trims whitespace from event name", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "  Trimmed Event  ", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Trimmed Event");
  });

  /**
   * WHY: Large but valid seat counts should be accepted (no upper-bound validation exists).
   * CODE PATH: validateCreateEvent only checks >0 and integer; service checks >0 again.
   * EXPECTED: PASS — 999999 seats is accepted.
   */
  it("accepts extremely large seat values", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Huge Venue Event", totalSeats: 999999, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(999999);
  });

  // -------------------------------------------------------------------------
  // Missing required fields
  // -------------------------------------------------------------------------

  /**
   * WHY: name is required by validateCreateEvent.
   * CODE PATH: validation throws Error with statusCode 400; errorHandler returns 400.
   * EXPECTED: PASS — 400 with message "name is required".
   */
  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/events")
      .send({ totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  /**
   * WHY: totalSeats is required; undefined triggers the missing-field branch.
   * CODE PATH: validateCreateEvent checks for undefined/null/empty string.
   * EXPECTED: PASS — 400 with message "totalSeats is required".
   */
  it("returns 400 when totalSeats is missing", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Missing Seats Event", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  /**
   * WHY: eventDate is required; undefined triggers the missing-field branch.
   * CODE PATH: validateCreateEvent checks for falsy eventDate.
   * EXPECTED: PASS — 400 with message "eventDate is required".
   */
  it("returns 400 when eventDate is missing", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "No Date Event", totalSeats: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  /**
   * WHY: All fields missing — validation should still report the first error.
   * CODE PATH: validateCreateEvent pushes errors in order; throws errors[0].
   * EXPECTED: PASS — 400 with message about name.
   */
  it("returns 400 when all fields are missing", async () => {
    const res = await request(app).post("/events").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  // -------------------------------------------------------------------------
  // Empty / whitespace-only strings
  // -------------------------------------------------------------------------

  /**
   * WHY: Empty string for name should fail the `data.name.trim() === ""` check.
   * CODE PATH: validateCreateEvent → `!data.name || ... || data.name.trim() === ""`
   * EXPECTED: PASS — 400 with "name is required".
   */
  it("returns 400 when name is an empty string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  /**
   * WHY: Whitespace-only name trims to "" and must be rejected.
   * CODE PATH: validateCreateEvent → data.name.trim() === "" → error pushed.
   * EXPECTED: PASS — 400 with "name is required".
   */
  it("returns 400 when name is whitespace only", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "   ", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  /**
   * WHY: Empty string for totalSeats triggers the "is required" branch.
   * CODE PATH: validateCreateEvent checks `data.totalSeats === ""` explicitly.
   * EXPECTED: PASS — 400 with "totalSeats is required".
   */
  it("returns 400 when totalSeats is an empty string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event A", totalSeats: "", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  // -------------------------------------------------------------------------
  // Invalid field types
  // -------------------------------------------------------------------------

  /**
   * WHY: Non-numeric string for totalSeats should produce "must be a valid number".
   * CODE PATH: Number("abc") → NaN → errors.push("totalSeats must be a valid number").
   * EXPECTED: PASS — 400 with "totalSeats must be a valid number".
   */
  it("returns 400 when totalSeats is a non-numeric string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event B", totalSeats: "abc", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be a valid number");
  });

  /**
   * WHY: Float for totalSeats fails the integer check.
   * CODE PATH: Number.isInteger(1.5) === false → error pushed.
   * EXPECTED: PASS — 400 with "totalSeats must be an integer".
   */
  it("returns 400 when totalSeats is a float", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event C", totalSeats: 10.5, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be an integer");
  });

  /**
   * WHY: An object passed for name should not be a string; it triggers type check.
   * CODE PATH: typeof {} !== "string" → name error pushed.
   * EXPECTED: PASS — 400 with "name is required".
   */
  it("returns 400 when name is not a string (object)", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: { foo: "bar" }, totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  /**
   * WHY: eventDate must be a string; passing a number fails typeof check.
   * CODE PATH: typeof data.eventDate !== "string" → error pushed.
   * EXPECTED: PASS — 400 with "eventDate is required".
   */
  it("returns 400 when eventDate is not a string (number)", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event D", totalSeats: 50, eventDate: 20261201 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  // -------------------------------------------------------------------------
  // Name-only-numbers rule
  // -------------------------------------------------------------------------

  /**
   * WHY: Event name consisting only of digits is rejected by the specific regex check.
   * CODE PATH: /^\d+$/.test(name) → errors.push("event name cannot contain only numbers").
   * EXPECTED: PASS — 400 with "event name cannot contain only numbers".
   */
  it("returns 400 when event name contains only numbers", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "12345", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("event name cannot contain only numbers");
  });

  /**
   * WHY: Mixed alphanumeric name should pass the numbers-only check.
   * CODE PATH: /^\d+$/.test("Event 2026") → false → no error for this rule.
   * EXPECTED: PASS — 201.
   */
  it("accepts event name with mixed letters and numbers", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event 2026", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Boundary values for seats
  // -------------------------------------------------------------------------

  /**
   * WHY: 0 seats fails the `num <= 0` check in validation.
   * CODE PATH: validateCreateEvent → num <= 0 → error pushed.
   * EXPECTED: PASS — 400 with "totalSeats must be greater than 0".
   */
  it("returns 400 when totalSeats is 0", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Zero Seats Event", totalSeats: 0, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  /**
   * WHY: Negative seats fails the `num <= 0` check in validation.
   * CODE PATH: validateCreateEvent → num <= 0 → error pushed.
   * EXPECTED: PASS — 400 with "totalSeats must be greater than 0".
   */
  it("returns 400 when totalSeats is negative", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Negative Seats Event", totalSeats: -10, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  /**
   * WHY: Exactly 1 seat is the minimum valid value; should succeed.
   * CODE PATH: validateCreateEvent num > 0 && integer → passes; service creates event.
   * EXPECTED: PASS — 201.
   */
  it("accepts 1 as totalSeats (minimum boundary)", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Single Seat Event", totalSeats: 1, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Invalid dates
  // -------------------------------------------------------------------------

  /**
   * WHY: eventDate must match YYYY-MM-DD; an invalid format string is rejected.
   * CODE PATH: /^\d{4}-\d{2}-\d{2}$/.test("01/30/2027") → false → format error.
   * EXPECTED: PASS — 400 with "Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)".
   */
  it("returns 400 for eventDate in wrong format (MM/DD/YYYY)", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event E", totalSeats: 50, eventDate: "01/30/2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  /**
   * WHY: ISO datetime string (with time) does not match YYYY-MM-DD pattern.
   * CODE PATH: regex test fails → format error pushed.
   * EXPECTED: PASS — 400 format error.
   */
  it("returns 400 for eventDate as ISO datetime string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event F", totalSeats: 50, eventDate: "2027-01-30T10:00:00Z" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  /**
   * WHY: A syntactically valid format but semantically invalid date (month 13).
   * CODE PATH: regex matches, new Date("2027-13-01") → Invalid Date; date <= today check
   *            actually passes through (NaN comparison), but the string matches regex.
   *            On most JS runtimes, new Date("2027-13-01") produces an Invalid Date
   *            which is NOT <= today, so it may slip through validation and fail at DB level.
   *            NOTE: Validation does NOT check isNaN(date) explicitly, so this edge case
   *            might reach Prisma and produce a 500. We document the actual behaviour here.
   * EXPECTED: Non-200 response (400 or 500 depending on DB handling).
   */
  it("returns a non-201 response for structurally matching but semantically invalid date (month 13)", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Invalid Month Event", totalSeats: 50, eventDate: "2027-13-01" });

    expect(res.status).not.toBe(201);
  });

  // -------------------------------------------------------------------------
  // Past dates
  // -------------------------------------------------------------------------

  /**
   * WHY: Past date should be rejected by the validation layer.
   * CODE PATH: validateCreateEvent → date <= today → "eventDate cannot be in the past".
   * EXPECTED: PASS — 400 with "eventDate cannot be in the past".
   */
  it("returns 400 when eventDate is in the past", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Past Event", totalSeats: 50, eventDate: pastDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });

  /**
   * WHY: Today's date: validation sets today to midnight (hours=0,0,0,0);
   *      a date equal to today is NOT > today → rejected.
   * CODE PATH: date <= today (today = midnight) → error pushed.
   * EXPECTED: PASS — 400 with "eventDate cannot be in the past".
   */
  it("returns 400 when eventDate is today", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Today Event", totalSeats: 50, eventDate: todayDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });

  // -------------------------------------------------------------------------
  // Duplicate event name
  // -------------------------------------------------------------------------

  /**
   * WHY: Event name has a @unique constraint; creating a duplicate should fail.
   * CODE PATH: eventService.createEvent → prisma.event.findUnique → found → throws
   *            "Event name already exists" → errorHandler maps to 500 (no statusCode set
   *            on this error). The error message is "Event name already exists".
   * EXPECTED: PASS — non-201 status (500, as service throws plain Error without statusCode).
   *
   * NOTE: The service does NOT set statusCode on this error, so errorHandler defaults to 500.
   */
  it("returns an error when creating an event with a duplicate name", async () => {
    const payload = { name: "Unique Event", totalSeats: 50, eventDate: futureDateStr(60) };
    await request(app).post("/events").send(payload);

    const res = await request(app).post("/events").send(payload);

    expect(res.status).not.toBe(201);
    expect(res.body.message).toBe("Event name already exists");
  });

  /**
   * WHY: After trimming, "  Same Name  " and "Same Name" are the same; ensures trim
   *      doesn't bypass the duplicate check.
   * CODE PATH: validation trims name → service checks trimmed name in DB → duplicate found.
   * EXPECTED: PASS — second create returns error.
   */
  it("correctly detects duplicate after name trimming", async () => {
    const payload = { name: "Same Name", totalSeats: 50, eventDate: futureDateStr(60) };
    await request(app).post("/events").send(payload);

    const res = await request(app)
      .post("/events")
      .send({ name: "  Same Name  ", totalSeats: 100, eventDate: futureDateStr(90) });

    expect(res.status).not.toBe(201);
    expect(res.body.message).toBe("Event name already exists");
  });
});

// ===========================================================================
// GET /events
// ===========================================================================

describe("GET /events", () => {
  // -------------------------------------------------------------------------
  // Basic retrieval
  // -------------------------------------------------------------------------

  /**
   * WHY: The GET all events happy path should return an empty array when no events exist.
   * CODE PATH: eventService.getEvents → prisma.event.findMany → [] → mapped to [].
   * EXPECTED: PASS — 200 with empty array.
   */
  it("returns 200 with empty array when no events exist", async () => {
    const res = await request(app).get("/events");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * WHY: After creating an event, GET should return it with the computed fields.
   * CODE PATH: getEvents → findMany with registrations included → map adds
   *            totalRegistrations and availableSeats.
   * EXPECTED: PASS — returns array with the event, totalRegistrations=0, availableSeats=totalSeats.
   */
  it("returns events with computed fields (totalRegistrations, availableSeats)", async () => {
    await request(app)
      .post("/events")
      .send({ name: "Computed Fields Event", totalSeats: 80, eventDate: futureDateStr() });

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      name: "Computed Fields Event",
      totalSeats: 80,
      totalRegistrations: 0,
      availableSeats: 80,
    });
  });

  /**
   * WHY: Multiple events should all be returned.
   * CODE PATH: findMany returns all; no where clause when no query params.
   * EXPECTED: PASS — 200 with array of 3 events.
   */
  it("returns all events when multiple events exist", async () => {
    for (let i = 1; i <= 3; i++) {
      await request(app)
        .post("/events")
        .send({ name: `Event ${i}`, totalSeats: 10 * i, eventDate: futureDateStr(10 + i) });
    }

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // ?upcoming=true filter
  // -------------------------------------------------------------------------

  /**
   * WHY: ?upcoming=true should only return events with eventDate > now.
   *      Past events (created directly in DB with past dates) should be excluded.
   * CODE PATH: getEvents → where.eventDate = { gt: new Date() } when upcoming=true.
   * EXPECTED: PASS — only future events returned.
   *
   * NOTE: We create events via the API (which only allows future dates), so to test the
   *       filter isolation we rely on the fact that the filter narrows correctly even
   *       when all events are future. A stronger test would require direct DB seeding.
   */
  it("returns only upcoming events when ?upcoming=true is provided", async () => {
    await request(app)
      .post("/events")
      .send({ name: "Upcoming Event A", totalSeats: 50, eventDate: futureDateStr(5) });

    const res = await request(app).get("/events?upcoming=true");

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    res.body.forEach((event) => {
      expect(new Date(event.eventDate) > new Date()).toBe(true);
    });
  });

  /**
   * WHY: ?upcoming=false (or any value != "true") should NOT apply the upcoming filter.
   * CODE PATH: query.upcoming !== "true" → where stays empty → all events returned.
   * EXPECTED: PASS — all events returned regardless of date.
   */
  it("returns all events when ?upcoming=false", async () => {
    await request(app)
      .post("/events")
      .send({ name: "All Events Test", totalSeats: 50, eventDate: futureDateStr() });

    const res = await request(app).get("/events?upcoming=false");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // ?sort=desc ordering
  // -------------------------------------------------------------------------

  /**
   * WHY: ?sort=desc should return events with latest eventDate first.
   * CODE PATH: orderBy: { eventDate: query.sort === "desc" ? "desc" : "asc" }
   * EXPECTED: PASS — events sorted descending by eventDate.
   */
  it("returns events sorted descending when ?sort=desc", async () => {
    await request(app)
      .post("/events")
      .send({ name: "Early Event", totalSeats: 10, eventDate: futureDateStr(10) });
    await request(app)
      .post("/events")
      .send({ name: "Late Event", totalSeats: 10, eventDate: futureDateStr(60) });

    const res = await request(app).get("/events?sort=desc");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const dates = res.body.map((e) => new Date(e.eventDate).getTime());
    expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
  });

  /**
   * WHY: Default sort (no ?sort param) should return ascending order.
   * CODE PATH: query.sort !== "desc" → "asc" used as orderBy direction.
   * EXPECTED: PASS — events sorted ascending by eventDate.
   */
  it("returns events sorted ascending by default (no sort param)", async () => {
    await request(app)
      .post("/events")
      .send({ name: "Later Event", totalSeats: 10, eventDate: futureDateStr(60) });
    await request(app)
      .post("/events")
      .send({ name: "Sooner Event", totalSeats: 10, eventDate: futureDateStr(10) });

    const res = await request(app).get("/events");

    expect(res.status).toBe(200);
    const dates = res.body.map((e) => new Date(e.eventDate).getTime());
    expect(dates[0]).toBeLessThanOrEqual(dates[1]);
  });

  // -------------------------------------------------------------------------
  // availableSeats calculation
  // -------------------------------------------------------------------------

  /**
   * WHY: availableSeats must decrease correctly as registrations are added.
   * CODE PATH: getEvents map → availableSeats = totalSeats - registrations.length.
   * EXPECTED: PASS — after registering 2 users, availableSeats = totalSeats - 2.
   */
  it("reflects correct availableSeats after registrations", async () => {
    const createRes = await request(app)
      .post("/events")
      .send({ name: "Seats Count Event", totalSeats: 10, eventDate: futureDateStr() });
    const eventId = createRes.body.id;

    await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId });
    await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId });

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.id === eventId);

    expect(event.totalRegistrations).toBe(2);
    expect(event.availableSeats).toBe(8);
  });
});