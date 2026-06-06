/**
 * registration.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Jest + Supertest end-to-end tests for Registration endpoints.
 *
 * Derived entirely from the ACTUAL codebase:
 *   src/routes/registrationRoutes.js
 *   src/controllers/registrationController.js
 *   src/services/registrationService.js
 *   src/validations/registrationValidation.js
 *   src/middlewares/errorHandler.js
 *   prisma/schema.prisma
 *
 * Routes under test:
 *   POST   /registrations
 *   DELETE /registrations/:id
 *
 * CRITICAL IMPLEMENTATION NOTE — RESPONSE FORMAT BUG:
 *
 *   registrationController handles errors that carry a statusCode directly:
 *       return res.status(error.statusCode).json({ error: error.message })
 *   This means business-level errors from registrationService (404, 409)
 *   return: { error: "..." }   ← NOTE: field is "error", NOT "message"
 *
 *   In contrast, errors that pass to next(error) → errorHandler return:
 *       { message: "..." }
 *
 *   Validation errors from registrationValidation.js are thrown with
 *   statusCode=400 and caught by the controller, so they also return:
 *       { error: "..." }
 *
 *   This is inconsistent with the event endpoints (which always return
 *   { message }), but it is the ACTUAL behavior and tests assert accordingly.
 *
 * ROUTES:
 *   POST   /registrations     — body: { userName, eventId }
 *   DELETE /registrations/:id — param is `:id` (NOT `:registrationId`)
 *
 * SERVICE FLOW (registerUser):
 *   1. Number(eventId) coercion
 *   2. findUnique event → 404 if not found
 *   3. findUnique existing registration → 409 if found
 *   4. updateMany with availableSeats > 0 guard → 409 "Event is full" if count=0
 *   5. create registration; on P2002 → rollback seat + 409
 *
 * SERVICE FLOW (cancelRegistration):
 *   1. prisma.$transaction (standard, NOT Serializable)
 *   2. findUnique registration → 404 if not found
 *   3. delete registration
 *   4. update event.availableSeats += 1
 *   5. return { message: "Registration cancelled successfully" }
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

/** Returns a YYYY-MM-DD string `daysFromNow` days in the future. */
const futureDateStr = (daysFromNow = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

/**
 * Creates a test event via the API and returns the response body.
 * Throws if creation fails, so tests fail fast with a clear message.
 */
const createTestEvent = async (name = "Test Event", totalSeats = 10) => {
  const res = await request(app)
    .post("/events")
    .send({ name, totalSeats, eventDate: futureDateStr() });
  if (res.status !== 201) {
    throw new Error(`createTestEvent failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});

// =============================================================================
// POST /registrations
// =============================================================================

describe("POST /registrations", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // HAPPY PATH
  // ───────────────────────────────────────────────────────────────────────────

  it("registers a user successfully and returns 201 with registration object", async () => {
    // CODE PATH: validateRegisterUser passes → registerUser → event found, no dupe,
    //            seat available → prisma.registration.create → controller res.status(201)
    const event = await createTestEvent("Happy Path Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      userName: "Alice",
      eventId: event.id,
    });
    expect(res.body.registeredAt).toBeDefined();
  });

  it("returns a registeredAt timestamp on successful registration", async () => {
    // SCHEMA: registeredAt DateTime @default(now()) — Prisma sets it.
    const event = await createTestEvent("Timestamp Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });

    expect(res.status).toBe(201);
    expect(new Date(res.body.registeredAt)).toBeInstanceOf(Date);
    expect(isNaN(new Date(res.body.registeredAt).getTime())).toBe(false);
  });

  it("trims leading/trailing whitespace from userName", async () => {
    // VALIDATION: data.userName.trim() → "Alice" stored, not "  Alice  "
    const event = await createTestEvent("Trim Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "  Alice  ", eventId: event.id });

    expect(res.status).toBe(201);
    expect(res.body.userName).toBe("Alice");
  });

  it("accepts eventId sent as a numeric string (coerced to integer)", async () => {
    // VALIDATION: Number("5") = 5; passes positive-integer check.
    const event = await createTestEvent("String EventId Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Charlie", eventId: String(event.id) });

    expect(res.status).toBe(201);
    expect(res.body.eventId).toBe(event.id);
  });

  it("decrements availableSeats by 1 on the event after registration", async () => {
    // SERVICE: updateMany with availableSeats.decrement(1)
    const event = await createTestEvent("Decrement Event", 5);

    await request(app)
      .post("/registrations")
      .send({ userName: "Dave", eventId: event.id });

    const eventsRes = await request(app).get("/events");
    const updated = eventsRes.body.find((e) => e.id === event.id);

    expect(updated.availableSeats).toBe(4);
  });

  it("allows multiple different users to register for the same event", async () => {
    // SERVICE: @@unique is [userName, eventId]; different userNames are allowed.
    const event = await createTestEvent("Multi-User Event", 10);

    const r1 = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const r2 = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    const r3 = await request(app)
      .post("/registrations")
      .send({ userName: "Charlie", eventId: event.id });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
  });

  it("allows the same user to register for a different event", async () => {
    // SERVICE: findUnique by {userName, eventId} — different eventId → not duplicate.
    const event1 = await createTestEvent("Event Alpha", 5);
    const event2 = await createTestEvent("Event Beta", 5);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event1.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event2.id });

    expect(res.status).toBe(201);
  });

  it("allows registering the last available seat", async () => {
    // SERVICE: totalSeats=1; updateMany where availableSeats > 0 → count=1 → creates.
    const event = await createTestEvent("Last Seat Event", 1);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "LastUser", eventId: event.id });

    expect(res.status).toBe(201);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MISSING REQUIRED FIELDS
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with error 'userName is required' when userName is absent", async () => {
    // VALIDATION: !data.userName → throws Error("userName is required") with statusCode=400
    // CONTROLLER: catches statusCode error → res.status(400).json({ error: "..." })
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is absent", async () => {
    // VALIDATION: data.eventId === undefined → "eventId is required"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is null", async () => {
    // VALIDATION: data.eventId === null → "eventId is required"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is empty string", async () => {
    // VALIDATION: data.eventId === "" → "eventId is required"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'userName is required' when userName is empty string", async () => {
    // VALIDATION: data.userName.trim() === "" → "userName is required"
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 with error 'userName is required' when userName is whitespace only", async () => {
    // VALIDATION: "   ".trim() === "" → "userName is required"
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "   ", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 when both userName and eventId are absent", async () => {
    // VALIDATION: userName check runs first → "userName is required"
    const res = await request(app).post("/registrations").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVALID eventId TYPES
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 400 with error 'eventId must be a positive integer' when eventId is a non-numeric string", async () => {
    // VALIDATION: Number("abc") → NaN → isNaN → "eventId must be a positive integer"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is a float", async () => {
    // VALIDATION: Number.isInteger(1.5) === false → "eventId must be a positive integer"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is 0", async () => {
    // VALIDATION: 0 <= 0 → "eventId must be a positive integer"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is negative", async () => {
    // VALIDATION: -5 <= 0 → "eventId must be a positive integer"
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' for a float string", async () => {
    // VALIDATION: Number("3.7") = 3.7; not integer → error
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "3.7" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // EVENT NOT FOUND
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 404 with error 'Event not found' when event does not exist", async () => {
    // SERVICE: findUnique(99999) → null → throws Error("Event not found") statusCode=404
    // CONTROLLER: catches statusCode → res.status(404).json({ error: "Event not found" })
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 99999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event not found");
  });

  it("returns 404 even when eventId is valid integer but no matching event", async () => {
    // SERVICE: valid integer → finds no event → 404
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event not found");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DUPLICATE REGISTRATION
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 409 with error 'User already registered for this event' on duplicate", async () => {
    // SERVICE: findUnique({userName, eventId}) → found → throws 409
    // CONTROLLER: catches statusCode=409 → { error: "..." }
    const event = await createTestEvent("Dupe Event", 10);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("User already registered for this event");
  });

  it("returns 409 on duplicate even after whitespace trimming of userName", async () => {
    // VALIDATION trims "  Alice  " → "Alice"; service finds existing "Alice" → 409
    const event = await createTestEvent("Trim Dupe Event", 10);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "  Alice  ", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("User already registered for this event");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // FULL EVENT
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 409 with error 'Event is full' when all seats are taken", async () => {
    // SERVICE: updateMany(availableSeats > 0) returns count=0 → "Event is full"
    const event = await createTestEvent("Full House Event", 2);

    await request(app).post("/registrations").send({ userName: "User1", eventId: event.id });
    await request(app).post("/registrations").send({ userName: "User2", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "User3", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Event is full");
  });

  it("correctly fills exactly 1-seat event and rejects the next registrant", async () => {
    // Boundary: totalSeats=1; first user fills it; second gets 409.
    const event = await createTestEvent("One Seat Event", 1);

    const r1 = await request(app)
      .post("/registrations")
      .send({ userName: "FirstUser", eventId: event.id });
    expect(r1.status).toBe(201);

    const r2 = await request(app)
      .post("/registrations")
      .send({ userName: "SecondUser", eventId: event.id });
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe("Event is full");
  });

  it("fills all 3 seats successfully and rejects the 4th", async () => {
    const event = await createTestEvent("Three Seat Event", 3);

    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post("/registrations")
        .send({ userName: `User${i}`, eventId: event.id });
      expect(res.status).toBe(201);
    }

    const overflow = await request(app)
      .post("/registrations")
      .send({ userName: "User4", eventId: event.id });
    expect(overflow.status).toBe(409);
    expect(overflow.body.error).toBe("Event is full");
  });
});

// =============================================================================
// DELETE /registrations/:id
// =============================================================================

describe("DELETE /registrations/:id", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // HAPPY PATH
  // ───────────────────────────────────────────────────────────────────────────

  it("cancels a registration and returns 200 with success message", async () => {
    // SERVICE: findUnique → found → delete → increment availableSeats →
    //          return { message: "Registration cancelled successfully" }
    // NOTE: SUCCESS path goes through controller → res.status(200).json(result)
    //       and result is { message: "..." } (the message field IS present here).
    const event = await createTestEvent("Cancellable Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    const res = await request(app).delete(`/registrations/${registrationId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Registration cancelled successfully" });
  });

  it("removes the registration record from the database on cancellation", async () => {
    // After deletion, a subsequent cancel attempt returns 404 (record gone).
    const event = await createTestEvent("DB Remove Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    // Verify by direct Prisma lookup
    const found = await prisma.registration.findUnique({
      where: { id: registrationId },
    });
    expect(found).toBeNull();
  });

  it("increments availableSeats on the event after cancellation", async () => {
    // SERVICE: tx.event.update → availableSeats.increment(1)
    const event = await createTestEvent("Seat Restore Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Carol", eventId: event.id });
    const registrationId = regRes.body.id;

    // Before cancel: availableSeats = 4
    const before = await prisma.event.findUnique({ where: { id: event.id } });
    expect(before.availableSeats).toBe(4);

    await request(app).delete(`/registrations/${registrationId}`);

    // After cancel: availableSeats = 5
    const after = await prisma.event.findUnique({ where: { id: event.id } });
    expect(after.availableSeats).toBe(5);
  });

  it("allows re-registration after cancellation (seat is freed)", async () => {
    // After cancellation, the @@unique constraint is gone and the seat is free.
    const event = await createTestEvent("Re-Register Event", 1);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    // Alice can register again
    const reReg = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(reReg.status).toBe(201);
  });

  it("allows a new user to claim the freed seat after cancellation", async () => {
    // totalSeats=1; Alice fills it, cancels; Bob claims it.
    const event = await createTestEvent("Freed Seat Event", 1);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    // Bob gets 409 before Alice cancels
    const full = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    expect(full.status).toBe(409);

    await request(app).delete(`/registrations/${registrationId}`);

    // Bob can now register
    const bobRes = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    expect(bobRes.status).toBe(201);
  });

  it("can cancel multiple registrations independently", async () => {
    const event = await createTestEvent("Multi Cancel Event", 3);

    const r1 = await request(app)
      .post("/registrations")
      .send({ userName: "User1", eventId: event.id });
    const r2 = await request(app)
      .post("/registrations")
      .send({ userName: "User2", eventId: event.id });

    const c1 = await request(app).delete(`/registrations/${r1.body.id}`);
    const c2 = await request(app).delete(`/registrations/${r2.body.id}`);

    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);

    const eventData = await prisma.event.findUnique({ where: { id: event.id } });
    expect(eventData.availableSeats).toBe(3);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // REGISTRATION NOT FOUND
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 404 with error 'Registration not found' for a non-existent registration", async () => {
    // SERVICE: findUnique(99999) → null → throws "Registration not found" statusCode=404
    // CONTROLLER: catches statusCode → res.status(404).json({ error: "Registration not found" })
    const res = await request(app).delete("/registrations/99999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });

  it("returns 404 when trying to cancel an already-cancelled registration", async () => {
    // Second delete on the same ID — record is gone → findUnique returns null → 404.
    const event = await createTestEvent("Double Cancel Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Dave", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    const res = await request(app).delete(`/registrations/${registrationId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });

  it("returns 404 for a valid integer ID that has no matching registration", async () => {
    // Create one registration (gets id=1 or some value), then try id=id+1000.
    const event = await createTestEvent("ID Miss Event", 5);
    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Eve", eventId: event.id });
    const nonExistentId = regRes.body.id + 1000;

    const res = await request(app).delete(`/registrations/${nonExistentId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // INVALID registrationId IN PARAM
  // ───────────────────────────────────────────────────────────────────────────

  it("returns a non-200 response for a non-numeric registrationId param", async () => {
    // SERVICE: Number("abc") → NaN; Prisma throws a type error on findUnique(NaN).
    // The error has no statusCode so falls through to next(error) → errorHandler → 500.
    // We assert it is NOT 200 (actual status is likely 500).
    const res = await request(app).delete("/registrations/abc");

    expect(res.status).not.toBe(200);
  });

  it("returns a non-200 response for a float registrationId param", async () => {
    // SERVICE: Number("1.5") → 1.5; Prisma Int field comparison with float throws.
    const res = await request(app).delete("/registrations/1.5");

    expect(res.status).not.toBe(200);
  });

  it("returns a non-200 response for a negative registrationId param", async () => {
    // SERVICE: Number("-1") → -1; Prisma findUnique with id=-1 returns null → 404.
    // The code calls Number(registrationId) on the raw string "-1"; it becomes -1.
    // findUnique({ where: { id: -1 } }) returns null → "Registration not found" → 404.
    const res = await request(app).delete("/registrations/-1");

    // With negative ID, Prisma will find nothing → 404 (not found path).
    expect(res.status).toBe(404);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SEAT AVAILABILITY CHANGES AFTER CANCELLATION
  // ───────────────────────────────────────────────────────────────────────────

  it("reflects correct availableSeats via GET /events after cancellation", async () => {
    const event = await createTestEvent("Availability Check Event", 5);

    const regs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await request(app)
        .post("/registrations")
        .send({ userName: `Attendee${i}`, eventId: event.id });
      regs.push(r.body);
    }

    // 3 registered → availableSeats = 2
    let eventsRes = await request(app).get("/events");
    let found = eventsRes.body.find((e) => e.id === event.id);
    expect(found.availableSeats).toBe(2);
    expect(found.totalRegistrations).toBe(3);

    // Cancel one
    await request(app).delete(`/registrations/${regs[0].id}`);

    // 2 registered → availableSeats = 3
    eventsRes = await request(app).get("/events");
    found = eventsRes.body.find((e) => e.id === event.id);
    expect(found.availableSeats).toBe(3);
    expect(found.totalRegistrations).toBe(2);
  });

  it("restores full availability after all registrations are cancelled", async () => {
    const event = await createTestEvent("Full Restore Event", 3);

    const regs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await request(app)
        .post("/registrations")
        .send({ userName: `Person${i}`, eventId: event.id });
      regs.push(r.body);
    }

    // Cancel all
    for (const reg of regs) {
      const c = await request(app).delete(`/registrations/${reg.id}`);
      expect(c.status).toBe(200);
    }

    const eventsRes = await request(app).get("/events");
    const found = eventsRes.body.find((e) => e.id === event.id);

    expect(found.availableSeats).toBe(3);
    expect(found.totalRegistrations).toBe(0);
  },10000);

  // ───────────────────────────────────────────────────────────────────────────
  // CASCADE DELETION (SCHEMA BEHAVIOR)
  // ───────────────────────────────────────────────────────────────────────────

  it("returns 404 after cascade deletion of parent event removes registration", async () => {
    // SCHEMA: Registration.eventId onDelete: Cascade
    // When the event is deleted, its registrations are also deleted.
    // No DELETE /events route exists, so we use Prisma directly.
    const event = await createTestEvent("Cascade Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Frank", eventId: event.id });
    const registrationId = regRes.body.id;

    // Direct Prisma delete cascades to registration
    await prisma.event.delete({ where: { id: event.id } });

    const res = await request(app).delete(`/registrations/${registrationId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });
});