/**
 * registration.test.js
 * Comprehensive Jest + Supertest tests for Registration endpoints.
 * Based on ACTUAL implementation analysis — no invented requirements.
 *
 * Routes:
 *   POST   /registrations        → registerUser
 *   DELETE /registrations/:id    → cancelRegistration
 *
 * Validation layer  : src/validations/registrationValidation.js
 * Service layer     : src/services/registrationService.js
 * Error handler     : src/middlewares/errorHandler.js
 * DB                : Prisma + PostgreSQL (test DB from .env.test)
 *
 * Key business rules (from implementation):
 *   - userName and eventId are required
 *   - eventId must be a positive integer
 *   - Event must exist (404 if not)
 *   - User cannot register twice for the same event (409)
 *   - Cannot register when count >= totalSeats (409)
 *   - Cancellation deletes the registration; non-existent registrationId → 404
 *   - registerUser runs inside a Serializable transaction for concurrency safety
 */

const request = require("supertest");
const app = require("../../src/app"); // adjust path as needed
const prisma = require("../../src/config/prisma");

// ---------------------------------------------------------------------------
// Helper: Create a valid future event via the API
// ---------------------------------------------------------------------------

const futureDateStr = (daysFromNow = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

const createTestEvent = async (name = "Test Event", totalSeats = 10) => {
  const res = await request(app)
    .post("/events")
    .send({ name, totalSeats, eventDate: futureDateStr() });
  if (res.status !== 201) {
    throw new Error(`createTestEvent failed: ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});

// ===========================================================================
// POST /registrations
// ===========================================================================

describe("POST /registrations", () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  /**
   * WHY: Verifies the nominal registration path end-to-end.
   * CODE PATH: validateRegisterUser → registrationService.registerUser → transaction →
   *            event found, no duplicate, seats available → prisma.registration.create
   * EXPECTED: PASS — 201 with registration object (id, userName, eventId, registeredAt).
   */
  it("registers a user successfully for a valid event with available seats", async () => {
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

  /**
   * WHY: Confirms that leading/trailing whitespace in userName is trimmed by validation.
   * CODE PATH: validateRegisterUser → data.userName.trim(); stored trimmed.
   * EXPECTED: PASS — stored userName is "Alice", not "  Alice  ".
   */
  it("trims whitespace from userName", async () => {
    const event = await createTestEvent("Trim Test Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "  Alice  ", eventId: event.id });

    expect(res.status).toBe(201);
    expect(res.body.userName).toBe("Alice");
  });

  /**
   * WHY: eventId sent as a string digit should be coerced to a number by validation.
   * CODE PATH: validateRegisterUser → Number("5") = 5; passes integer/positive check.
   * EXPECTED: PASS — 201 (string "5" is accepted as eventId).
   */
  it("accepts eventId as a numeric string", async () => {
    const event = await createTestEvent("String ID Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: String(event.id) });

    expect(res.status).toBe(201);
    expect(res.body.eventId).toBe(event.id);
  });

  // -------------------------------------------------------------------------
  // Missing required fields
  // -------------------------------------------------------------------------

  /**
   * WHY: userName is required by validation.
   * CODE PATH: validateRegisterUser → !data.userName → throws 400 "userName is required".
   * EXPECTED: PASS — 400 with "userName is required".
   */
  it("returns 400 when userName is missing", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("userName is required");
  });

  /**
   * WHY: eventId is required by validation.
   * CODE PATH: validateRegisterUser → data.eventId === undefined → throws 400.
   * EXPECTED: PASS — 400 with "eventId is required".
   */
  it("returns 400 when eventId is missing", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId is required");
  });

  /**
   * WHY: Empty string for userName fails the .trim() === "" check.
   * CODE PATH: validateRegisterUser → data.userName.trim() === "" → throws 400.
   * EXPECTED: PASS — 400 with "userName is required".
   */
  it("returns 400 when userName is empty string", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("userName is required");
  });

  /**
   * WHY: Whitespace-only userName trims to "" and must be rejected.
   * CODE PATH: validateRegisterUser → "   ".trim() === "" → throws 400.
   * EXPECTED: PASS — 400 with "userName is required".
   */
  it("returns 400 when userName is whitespace only", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "   ", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("userName is required");
  });

  /**
   * WHY: Null eventId triggers the null check.
   * CODE PATH: validateRegisterUser → data.eventId === null → throws "eventId is required".
   * EXPECTED: PASS — 400 with "eventId is required".
   */
  it("returns 400 when eventId is null", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: null });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId is required");
  });

  /**
   * WHY: Empty string for eventId triggers the "" check.
   * CODE PATH: validateRegisterUser → data.eventId === "" → throws "eventId is required".
   * EXPECTED: PASS — 400 with "eventId is required".
   */
  it("returns 400 when eventId is empty string", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId is required");
  });

  // -------------------------------------------------------------------------
  // Invalid eventId types
  // -------------------------------------------------------------------------

  /**
   * WHY: Non-numeric string for eventId cannot be coerced to a valid integer.
   * CODE PATH: Number("abc") → NaN → isNaN check → throws "eventId must be a positive integer".
   * EXPECTED: PASS — 400 with "eventId must be a positive integer".
   */
  it("returns 400 when eventId is a non-numeric string", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId must be a positive integer");
  });

  /**
   * WHY: Float eventId fails the Number.isInteger check.
   * CODE PATH: Number.isInteger(1.5) === false → throws "eventId must be a positive integer".
   * EXPECTED: PASS — 400 with "eventId must be a positive integer".
   */
  it("returns 400 when eventId is a float", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId must be a positive integer");
  });

  /**
   * WHY: Zero is not a positive integer; fails the > 0 check.
   * CODE PATH: eventId <= 0 → throws "eventId must be a positive integer".
   * EXPECTED: PASS — 400 with "eventId must be a positive integer".
   */
  it("returns 400 when eventId is 0", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 0 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId must be a positive integer");
  });

  /**
   * WHY: Negative eventId fails the > 0 check.
   * CODE PATH: eventId <= 0 → throws "eventId must be a positive integer".
   * EXPECTED: PASS — 400 with "eventId must be a positive integer".
   */
  it("returns 400 when eventId is negative", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: -5 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventId must be a positive integer");
  });

  // -------------------------------------------------------------------------
  // Event not found
  // -------------------------------------------------------------------------

  /**
   * WHY: Registering for a non-existent event should return 404.
   * CODE PATH: service → tx.event.findUnique({ where: { id: 99999 } }) → null →
   *            throws "Event not found" → errorHandler maps to 404.
   * EXPECTED: PASS — 404 with "Event not found".
   */
  it("returns 404 when event does not exist", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 99999 });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Event not found");
  });

  // -------------------------------------------------------------------------
  // Duplicate registration
  // -------------------------------------------------------------------------

  /**
   * WHY: The @@unique([userName, eventId]) constraint and service-level check both
   *      prevent a user from registering twice for the same event.
   * CODE PATH: second call → tx.registration.findUnique({ where: { userName_eventId } })
   *            → found → throws "User already registered for this event" →
   *            errorHandler maps to 409.
   * EXPECTED: PASS — 409 with "User already registered for this event".
   */
  it("returns 409 when user is already registered for the event", async () => {
    const event = await createTestEvent("Dupe Test Event", 10);

    await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("User already registered for this event");
  });

  /**
   * WHY: Different userName for the same event should be allowed (not a duplicate).
   * CODE PATH: findUnique for different userName → null → proceeds to create.
   * EXPECTED: PASS — 201 for Bob even though Alice already registered.
   */
  it("allows different users to register for the same event", async () => {
    const event = await createTestEvent("Multi-User Event", 10);

    await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });

    expect(res.status).toBe(201);
  });

  /**
   * WHY: Same userName can register for a DIFFERENT event (@@unique is composite).
   * CODE PATH: findUnique by { userName, eventId } → not found for new eventId → creates.
   * EXPECTED: PASS — 201.
   */
  it("allows same user to register for a different event", async () => {
    const event1 = await createTestEvent("Event Alpha", 5);
    const event2 = await createTestEvent("Event Beta", 5);

    await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event1.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event2.id });

    expect(res.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Registration when seats are full
  // -------------------------------------------------------------------------

  /**
   * WHY: When count >= totalSeats, the event is full and registration must be rejected.
   * CODE PATH: count = tx.registration.count(...) >= event.totalSeats →
   *            throws "Event is full" → errorHandler maps to 409.
   * EXPECTED: PASS — 409 with "Event is full".
   */
  it("returns 409 when event is full", async () => {
    const event = await createTestEvent("Full House Event", 2);

    await request(app)
      .post("/registrations")
      .send({ userName: "User1", eventId: event.id });
    await request(app)
      .post("/registrations")
      .send({ userName: "User2", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "User3", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Event is full");
  });

  /**
   * WHY: The last available seat should be fillable; the check is count >= totalSeats
   *      so when count = totalSeats - 1, registration should succeed.
   * CODE PATH: count (N-1) < totalSeats (N) → not full → registration created.
   * EXPECTED: PASS — 201 for the last registrant.
   */
  it("allows registration for the last available seat", async () => {
    const event = await createTestEvent("Last Seat Event", 3);

    for (let i = 1; i <= 2; i++) {
      await request(app)
        .post("/registrations")
        .send({ userName: `User${i}`, eventId: event.id });
    }

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "User3", eventId: event.id });

    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// DELETE /registrations/:id
// ===========================================================================

describe("DELETE /registrations/:id", () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  /**
   * WHY: Successful cancellation should delete the record and return a message.
   * CODE PATH: cancelRegistration → findUnique → found → delete → return message.
   * EXPECTED: PASS — 200 with { message: "Registration cancelled successfully" }.
   */
  it("cancels a registration successfully", async () => {
    const event = await createTestEvent("Cancellable Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    const res = await request(app).delete(`/registrations/${registrationId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Registration cancelled successfully" });
  });

  /**
   * WHY: After cancellation, the record must no longer exist in the DB.
   * CODE PATH: delete is called; subsequent findUnique should return null.
   * EXPECTED: PASS — second cancel attempt returns 404.
   */
  it("removes the registration from the database after cancellation", async () => {
    const event = await createTestEvent("DB Removal Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    // Verify deleted by trying to cancel again
    const res = await request(app).delete(`/registrations/${registrationId}`);
    expect(res.status).toBe(404);
  });

  /**
   * WHY: After cancellation, the seat becomes available again for re-registration.
   * CODE PATH: delete frees the seat; new register call for same event by same or different user succeeds.
   * EXPECTED: PASS — re-registration by same user succeeds after cancellation.
   */
  it("allows re-registration after cancellation (seat freed)", async () => {
    const event = await createTestEvent("Re-Register Event", 1);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    // Alice can register again (old record is gone, seat is free)
    const reRegRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(reRegRes.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  /**
   * WHY: Cancelling a registration that doesn't exist should return 404.
   * CODE PATH: cancelRegistration → findUnique → null → throws "Registration not found" →
   *            errorHandler maps to 404.
   * EXPECTED: PASS — 404 with "Registration not found".
   */
  it("returns 404 when cancelling a non-existent registration", async () => {
    const res = await request(app).delete("/registrations/99999");

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Registration not found");
  });

  /**
   * WHY: After already cancelling once, a second delete on the same ID must return 404.
   * CODE PATH: same as above — record deleted, findUnique returns null.
   * EXPECTED: PASS — 404 on second delete.
   */
  it("returns 404 when trying to cancel an already-cancelled registration", async () => {
    const event = await createTestEvent("Double Cancel Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Charlie", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    const res = await request(app).delete(`/registrations/${registrationId}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Registration not found");
  });

  /**
   * WHY: registrationId param is coerced via Number(); a non-numeric string becomes NaN,
   *      then Number(NaN) in findUnique will likely cause a Prisma error or return null.
   *      In practice the service does Number(registrationId) which gives NaN for "abc",
   *      and Prisma's findUnique with NaN as an Int will throw or return null; the error
   *      handler will return a 500 or 404. We only assert it is NOT 200.
   * CODE PATH: cancelRegistration → Number("abc") = NaN → Prisma throws type error → 500.
   * EXPECTED: Non-200 response.
   */
  it("returns a non-200 response for non-numeric registrationId", async () => {
    const res = await request(app).delete("/registrations/abc");
    expect(res.status).not.toBe(200);
  });

  // -------------------------------------------------------------------------
  // Cascading behaviour
  // -------------------------------------------------------------------------

  /**
   * WHY: Deleting an event (onDelete: Cascade) should also delete its registrations.
   *      This validates the schema cascade; after event deletion, the registration no
   *      longer exists and cancellation returns 404.
   * NOTE: There is no DELETE /events endpoint in this API, so we test via direct Prisma.
   * CODE PATH: prisma.event.delete cascades to registration → findUnique returns null.
   * EXPECTED: PASS — 404 when cancelling a registration that was cascade-deleted.
   */
  it("returns 404 after cascade deletion of event removes registrations", async () => {
    const event = await createTestEvent("Cascade Delete Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Dave", eventId: event.id });
    const registrationId = regRes.body.id;

    // Directly delete the event from DB to trigger cascade
    await prisma.event.delete({ where: { id: event.id } });

    const res = await request(app).delete(`/registrations/${registrationId}`);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Concurrent registration edge cases
// ===========================================================================

describe("Concurrent registration (race condition guard)", () => {
  /**
   * WHY: The service uses a Serializable transaction to prevent over-booking.
   *      With totalSeats=1, only ONE of N concurrent requests should succeed.
   * CODE PATH: concurrent prisma.$transaction({ isolationLevel: "Serializable" }) →
   *            only one wins the seat; others throw "Event is full" or serialization error.
   * EXPECTED: PASS — exactly 1 registration exists after N concurrent attempts.
   *
   * NOTE: This test depends on a real PostgreSQL connection. Serializable isolation
   *       means some transactions will be retried or rolled back. The assertion is that
   *       at most 1 registration is ultimately committed.
   */
  it("allows only 1 registration when totalSeats=1 under concurrent load", async () => {
    const event = await createTestEvent("Concurrent Event", 1);

    const attempts = await Promise.allSettled(
      ["U1", "U2", "U3", "U4", "U5"].map((name) =>
        request(app)
          .post("/registrations")
          .send({ userName: name, eventId: event.id })
      )
    );

    const successes = attempts.filter(
      (r) => r.status === "fulfilled" && r.value.status === 201
    );

    // With Serializable isolation, at most 1 should succeed
    expect(successes.length).toBeLessThanOrEqual(1);

    // Also verify DB count directly
    const dbCount = await prisma.registration.count({
      where: { eventId: event.id },
    });
    expect(dbCount).toBeLessThanOrEqual(1);
  });

  /**
   * WHY: With totalSeats=5 and 5 concurrent requests by unique users, all 5 should
   *      eventually succeed (no overbooking, no false negatives).
   * CODE PATH: Serializable transactions serialize the 5 requests; all 5 pass the
   *            count < totalSeats check in their respective transactions.
   * EXPECTED: PASS — all 5 registrations committed (though order is non-deterministic).
   *
   * NOTE: Some may retry due to serialization failures; ultimately all 5 should commit.
   *       This test may be slow or flaky under heavy load; --runInBand reduces parallelism.
   */
  it("registers all unique users when seats exactly match concurrent requests", async () => {
    const event = await createTestEvent("Exact Seats Event", 5);

    const results = await Promise.allSettled(
      ["A", "B", "C", "D", "E"].map((name) =>
        request(app)
          .post("/registrations")
          .send({ userName: name, eventId: event.id })
      )
    );

    const dbCount = await prisma.registration.count({
      where: { eventId: event.id },
    });
    // All 5 should have been committed (Serializable retries on conflict)
    expect(dbCount).toBe(5);
  });
});