
"use strict";

const request = require("supertest");
const app = require("../app");
const prisma = require("../config/prisma");

const futureDateStr = (daysFromNow = 30) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};


const pastDateStr = (daysAgo = 1) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};


const todayDateStr = () => new Date().toISOString().split("T")[0];

beforeEach(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
});

afterAll(async () => {
  await prisma.registration.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.$disconnect();
});


describe("POST /events", () => {

  it("creates an event successfully with valid data and returns 201", async () => {
  
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
      availableSeats: 100, 
    });
    expect(new Date(res.body.eventDate)).toBeInstanceOf(Date);
  });

  it("sets availableSeats equal to totalSeats on creation", async () => {
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
    const res = await request(app).post("/events").send({
      name: "  Trimmed Event  ",
      totalSeats: 50,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Trimmed Event");
  });

  it("accepts totalSeats provided as a numeric string (coerced to number)", async () => {
    const res = await request(app).post("/events").send({
      name: "Coerced Seats Event",
      totalSeats: "50",
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(50);
  });

  it("accepts an extremely large valid seat count", async () => {
    const res = await request(app).post("/events").send({
      name: "Stadium Event",
      totalSeats: 999999,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(999999);
  });

  it("accepts exactly 1 seat (minimum valid boundary)", async () => {
    const res = await request(app).post("/events").send({
      name: "Single Seat Event",
      totalSeats: 1,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
    expect(res.body.totalSeats).toBe(1);
  });

  it("accepts an event name with mixed letters and numbers", async () => {
    const res = await request(app).post("/events").send({
      name: "Event 2026",
      totalSeats: 50,
      eventDate: futureDateStr(),
    });

    expect(res.status).toBe(201);
  });

  it("accepts a future date exactly 1 day from now", async () => {
    const res = await request(app).post("/events").send({
      name: "Tomorrow Event",
      totalSeats: 10,
      eventDate: futureDateStr(1),
    });

    expect(res.status).toBe(201);
  });


  it("returns 400 with 'name is required' when name is absent", async () => {
    const res = await request(app)
      .post("/events")
      .send({ totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is absent", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "No Seats Event", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is absent", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "No Date Event", totalSeats: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  it("returns 400 about name when ALL fields are missing", async () => {
    const res = await request(app).post("/events").send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });


  it("returns 400 when name is an empty string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 when name is whitespace only", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "   ", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is an empty string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event A", totalSeats: "", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  it("returns 400 with 'totalSeats is required' when totalSeats is null", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event B", totalSeats: null, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats is required");
  });

  it("returns 400 with 'totalSeats must be a valid number' when totalSeats is a non-numeric string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event C", totalSeats: "abc", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be a valid number");
  });

  it("returns 400 with 'totalSeats must be an integer' when totalSeats is a float", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event D", totalSeats: 10.5, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be an integer");
  });

  it("returns 400 with 'totalSeats must be an integer' when totalSeats is a string float", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event E", totalSeats: "2.5", eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be an integer");
  });

  it("returns 400 with 'name is required' when name is an object", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: { foo: "bar" }, totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'name is required' when name is a number", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: 123, totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("name is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is a number", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event F", totalSeats: 50, eventDate: 20261201 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });

  it("returns 400 with 'eventDate is required' when eventDate is null", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Event G", totalSeats: 50, eventDate: null });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate is required");
  });


  it("returns 400 with 'event name cannot contain only numbers' for all-digit name", async () => {
    // VALIDATION: /^\\d+$/.test("12345") → true → "event name cannot contain only numbers"
    const res = await request(app)
      .post("/events")
      .send({ name: "12345", totalSeats: 50, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("event name cannot contain only numbers");
  });

  it("returns 400 for a name that is only zeros", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "000", totalSeats: 10, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("event name cannot contain only numbers");
  });

  it("accepts a name that starts with digits but contains letters", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "2026Summit", totalSeats: 10, eventDate: futureDateStr() });

    expect(res.status).toBe(201);
  });


  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is 0", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Zero Seats Event", totalSeats: 0, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is negative", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Negative Seats Event", totalSeats: -10, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });

  it("returns 400 with 'totalSeats must be greater than 0' when totalSeats is -1", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Minus One Event", totalSeats: -1, eventDate: futureDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("totalSeats must be greater than 0");
  });


  it("returns 400 with format error for eventDate in MM/DD/YYYY format", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format A", totalSeats: 50, eventDate: "01/30/2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate as ISO datetime string", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format B", totalSeats: 50, eventDate: "2027-01-30T10:00:00Z" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate with only year", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Year Only Event", totalSeats: 50, eventDate: "2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns 400 with format error for eventDate in DD-MM-YYYY format", async () => {
    const res = await request(app)
      .post("/events")
      .send({ name: "Wrong Format C", totalSeats: 50, eventDate: "30-01-2027" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)");
  });

  it("returns a non-201 response for structurally valid but semantically invalid date (month 13)", async () => {
    
    const res = await request(app)
      .post("/events")
      .send({ name: "Invalid Month Event", totalSeats: 50, eventDate: "2027-13-01" });

    expect(res.status).not.toBe(201);
  });

  it("returns 400 with 'eventDate cannot be in the past' for a past date", async () => {
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
    const res = await request(app)
      .post("/events")
      .send({ name: "Today Event", totalSeats: 50, eventDate: todayDateStr() });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("eventDate cannot be in the past");
  });


  it("returns 409 with 'Event name already exists' on duplicate event name", async () => {
   
    const payload = { name: "Unique Conference", totalSeats: 50, eventDate: futureDateStr(60) };
    await request(app).post("/events").send(payload);

    const res = await request(app).post("/events").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Event name already exists");
  });

  it("detects duplicate name after whitespace trimming", async () => {
 
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
    await request(app)
      .post("/events")
      .send({ name: "Event One", totalSeats: 10, eventDate: futureDateStr(30) });

    const res = await request(app)
      .post("/events")
      .send({ name: "Event Two", totalSeats: 20, eventDate: futureDateStr(60) });

    expect(res.status).toBe(201);
  });
});



describe("GET /events", () => {
  
  it("returns 200 with an empty array when no events exist", async () => {
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


  it("returns events with the correct computed fields in each object", async () => {
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
    await request(app)
      .post("/events")
      .send({ name: "Fresh Event", totalSeats: 25, eventDate: futureDateStr() });

    const res = await request(app).get("/events");
    const event = res.body.find((e) => e.name === "Fresh Event");

    expect(event.totalRegistrations).toBe(0);
    expect(event.availableSeats).toBe(25);
  });

  it("correctly reflects availableSeats and totalRegistrations after registrations are added", async () => {
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
    await request(app)
      .post("/events")
      .send({ name: "No Count Field Event", totalSeats: 10, eventDate: futureDateStr() });

    const res = await request(app).get("/events");

    expect(res.body[0]).not.toHaveProperty("_count");
    expect(res.body[0]).not.toHaveProperty("registrations");
  });


  it("returns only future events when ?upcoming=true is provided", async () => {
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
    const res = await request(app).get("/events?upcoming=true");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });


  it("returns events sorted ascending by eventDate by default (no sort param)", async () => {
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

    expect(event.availableSeats).toBe(3);
    expect(event.totalRegistrations).toBe(0);
  });
});