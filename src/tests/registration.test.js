"use strict";

const request = require("supertest");
const app = require("../app");
const prisma = require("../config/prisma");


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
    throw new Error(`createTestEvent failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
};

beforeEach(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});


describe("POST /registrations", () => {

  it("registers a user successfully and returns 201 with registration object", async () => {
    
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
    const event = await createTestEvent("Timestamp Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });

    expect(res.status).toBe(201);
    expect(new Date(res.body.registeredAt)).toBeInstanceOf(Date);
    expect(isNaN(new Date(res.body.registeredAt).getTime())).toBe(false);
  });

  it("trims leading/trailing whitespace from userName", async () => {
    const event = await createTestEvent("Trim Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "  Alice  ", eventId: event.id });

    expect(res.status).toBe(201);
    expect(res.body.userName).toBe("Alice");
  });

  it("accepts eventId sent as a numeric string (coerced to integer)", async () => {
    const event = await createTestEvent("String EventId Event", 5);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Charlie", eventId: String(event.id) });

    expect(res.status).toBe(201);
    expect(res.body.eventId).toBe(event.id);
  });

  it("decrements availableSeats by 1 on the event after registration", async () => {
    const event = await createTestEvent("Decrement Event", 5);

    await request(app)
      .post("/registrations")
      .send({ userName: "Dave", eventId: event.id });

    const eventsRes = await request(app).get("/events");
    const updated = eventsRes.body.find((e) => e.id === event.id);

    expect(updated.availableSeats).toBe(4);
  });

  it("allows multiple different users to register for the same event", async () => {
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
    const event1 = await createTestEvent("Event Alpha", 5);
    const event2 = await createTestEvent("Event Beta", 5);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event1.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event2.id });

    expect(res.status).toBe(201);
  });

  it("allows registering the last available seat", async () => {
    const event = await createTestEvent("Last Seat Event", 1);

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "LastUser", eventId: event.id });

    expect(res.status).toBe(201);
  });


  it("returns 400 with error 'userName is required' when userName is absent", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is absent", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is null", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'eventId is required' when eventId is empty string", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId is required");
  });

  it("returns 400 with error 'userName is required' when userName is empty string", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 with error 'userName is required' when userName is whitespace only", async () => {
    const event = await createTestEvent();

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "   ", eventId: event.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  it("returns 400 when both userName and eventId are absent", async () => {
    const res = await request(app).post("/registrations").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("userName is required");
  });

  
  it("returns 400 with error 'eventId must be a positive integer' when eventId is a non-numeric string", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "abc" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is a float", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is 0", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' when eventId is negative", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });

  it("returns 400 with error 'eventId must be a positive integer' for a float string", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: "3.7" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("eventId must be a positive integer");
  });


  it("returns 404 with error 'Event not found' when event does not exist", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: 99999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event not found");
  });

  it("returns 404 even when eventId is valid integer but no matching event", async () => {
    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event not found");
  });


  it("returns 409 with error 'User already registered for this event' on duplicate", async () => {
    const event = await createTestEvent("Dupe Event", 10);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("User already registered for this event");
  });

  it("returns 409 on duplicate even after whitespace trimming of userName", async () => {
    const event = await createTestEvent("Trim Dupe Event", 10);

    await request(app).post("/registrations").send({ userName: "Alice", eventId: event.id });

    const res = await request(app)
      .post("/registrations")
      .send({ userName: "  Alice  ", eventId: event.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("User already registered for this event");
  });

  
  it("returns 409 with error 'Event is full' when all seats are taken", async () => {
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


describe("DELETE /registrations/:id", () => {

  it("cancels a registration and returns 200 with success message", async () => {
    
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
    const event = await createTestEvent("DB Remove Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);

    const found = await prisma.registration.findUnique({
      where: { id: registrationId },
    });
    expect(found).toBeNull();
  });

  it("increments availableSeats on the event after cancellation", async () => {
    const event = await createTestEvent("Seat Restore Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Carol", eventId: event.id });
    const registrationId = regRes.body.id;

    const before = await prisma.event.findUnique({ where: { id: event.id } });
    expect(before.availableSeats).toBe(4);

    await request(app).delete(`/registrations/${registrationId}`);

    const after = await prisma.event.findUnique({ where: { id: event.id } });
    expect(after.availableSeats).toBe(5);
  });

  it("allows re-registration after cancellation (seat is freed)", async () => {
    const event = await createTestEvent("Re-Register Event", 1);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;

    await request(app).delete(`/registrations/${registrationId}`);
    const reReg = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });

    expect(reReg.status).toBe(201);
  });

  it("allows a new user to claim the freed seat after cancellation", async () => {
    const event = await createTestEvent("Freed Seat Event", 1);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Alice", eventId: event.id });
    const registrationId = regRes.body.id;
    const full = await request(app)
      .post("/registrations")
      .send({ userName: "Bob", eventId: event.id });
    expect(full.status).toBe(409);

    await request(app).delete(`/registrations/${registrationId}`);
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


  it("returns 404 with error 'Registration not found' for a non-existent registration", async () => {
    const res = await request(app).delete("/registrations/99999");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });

  it("returns 404 when trying to cancel an already-cancelled registration", async () => {
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
    const event = await createTestEvent("ID Miss Event", 5);
    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Eve", eventId: event.id });
    const nonExistentId = regRes.body.id + 1000;

    const res = await request(app).delete(`/registrations/${nonExistentId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });


  it("returns a non-200 response for a non-numeric registrationId param", async () => {
    const res = await request(app).delete("/registrations/abc");

    expect(res.status).not.toBe(200);
  });

  it("returns a non-200 response for a float registrationId param", async () => {
    const res = await request(app).delete("/registrations/1.5");

    expect(res.status).not.toBe(200);
  });

  it("returns a non-200 response for a negative registrationId param", async () => {
    const res = await request(app).delete("/registrations/-1");

    expect(res.status).toBe(404);
  });


  it("reflects correct availableSeats via GET /events after cancellation", async () => {
    const event = await createTestEvent("Availability Check Event", 5);

    const regs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await request(app)
        .post("/registrations")
        .send({ userName: `Attendee${i}`, eventId: event.id });
      regs.push(r.body);
    }

    let eventsRes = await request(app).get("/events");
    let found = eventsRes.body.find((e) => e.id === event.id);
    expect(found.availableSeats).toBe(2);
    expect(found.totalRegistrations).toBe(3);

    await request(app).delete(`/registrations/${regs[0].id}`);

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

    for (const reg of regs) {
      const c = await request(app).delete(`/registrations/${reg.id}`);
      expect(c.status).toBe(200);
    }

    const eventsRes = await request(app).get("/events");
    const found = eventsRes.body.find((e) => e.id === event.id);

    expect(found.availableSeats).toBe(3);
    expect(found.totalRegistrations).toBe(0);
  },10000);


  it("returns 404 after cascade deletion of parent event removes registration", async () => {
   
    const event = await createTestEvent("Cascade Event", 5);

    const regRes = await request(app)
      .post("/registrations")
      .send({ userName: "Frank", eventId: event.id });
    const registrationId = regRes.body.id;

    await prisma.event.delete({ where: { id: event.id } });

    const res = await request(app).delete(`/registrations/${registrationId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Registration not found");
  });
});