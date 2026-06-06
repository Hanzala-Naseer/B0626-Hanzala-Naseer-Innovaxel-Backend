import http from "k6/http";
import { check } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const params = {
  headers: {
    "Content-Type": "application/json",
  },
};

export const options = {
  scenarios: {
    duplicate_registration: {
      executor: "per-vu-iterations",
      vus: 20,
      iterations: 1,
      exec: "duplicateRegistration",
    },

    last_seat_race: {
      executor: "per-vu-iterations",
      vus: 20,
      iterations: 1,
      exec: "lastSeatRace",
      startTime: "3s",
    },

    capacity_test: {
      executor: "per-vu-iterations",
      vus: 20,
      iterations: 1,
      exec: "capacityTest",
      startTime: "6s",
    },
  },
};

export function setup() {
  const timestamp = Date.now();

  // Create Duplicate Registration event
  const duplicateEvent = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      name: `Duplicate-${timestamp}`,
      totalSeats: 100,
      eventDate: "2027-07-01",
    }),
    params
  );

  // Create Last Seat event
  const lastSeatEvent = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      name: `LastSeat-${timestamp}`,
      totalSeats: 5,
      eventDate: "2027-07-01",
    }),
    params
  );

  // Create Capacity event
  const capacityEvent = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      name: `Capacity-${timestamp}`,
      totalSeats: 5,
      eventDate: "2027-07-01",
    }),
    params
  );

  check(duplicateEvent, {
    "duplicate event created": (r) => r.status === 201,
  });

  check(lastSeatEvent, {
    "last seat event created": (r) => r.status === 201,
  });

  check(capacityEvent, {
    "capacity event created": (r) => r.status === 201,
  });

  const duplicateEventId = duplicateEvent.json("id");
  const lastSeatEventId = lastSeatEvent.json("id");
  const capacityEventId = capacityEvent.json("id");

  // Pre-fill Last Seat event with 4 registrations
  for (let i = 1; i <= 4; i++) {
    http.post(
      `${BASE_URL}/registrations`,
      JSON.stringify({
        userName: `prefill-${i}`,
        eventId: lastSeatEventId,
      }),
      params
    );
  }

  console.log(`
====================================
Created Events
Duplicate Event: ${duplicateEventId}
Last Seat Event: ${lastSeatEventId}
Capacity Event: ${capacityEventId}
====================================
`);

  return {
    duplicateEventId,
    lastSeatEventId,
    capacityEventId,
  };
}

export function duplicateRegistration(data) {
  const res = http.post(
    `${BASE_URL}/registrations`,
    JSON.stringify({
      userName: "same-user",
      eventId: data.duplicateEventId,
    }),
    params
  );

  check(res, {
    "duplicate: 201 or 409": (r) =>
      r.status === 201 || r.status === 409,
    "duplicate: no 500": (r) =>
      r.status !== 500,
  });

  console.log(
    `[Duplicate] status=${res.status} body=${res.body}`
  );
}

export function lastSeatRace(data) {
  const res = http.post(
    `${BASE_URL}/registrations`,
    JSON.stringify({
      userName: `seat-user-${__VU}`,
      eventId: data.lastSeatEventId,
    }),
    params
  );

  check(res, {
    "last-seat: 201 or 409": (r) =>
      r.status === 201 || r.status === 409,
    "last-seat: no 500": (r) =>
      r.status !== 500,
  });

  console.log(
    `[LastSeat] status=${res.status} body=${res.body}`
  );
}

export function capacityTest(data) {
  const res = http.post(
    `${BASE_URL}/registrations`,
    JSON.stringify({
      userName: `capacity-user-${__VU}`,
      eventId: data.capacityEventId,
    }),
    params
  );

  check(res, {
    "capacity: 201 or 409": (r) =>
      r.status === 201 || r.status === 409,
    "capacity: no 500": (r) =>
      r.status !== 500,
  });

  console.log(
    `[Capacity] status=${res.status} body=${res.body}`
  );
}