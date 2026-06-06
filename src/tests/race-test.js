import http from 'k6/http';

export const options = {
  vus: 20,
  duration: '3s',
};

export default function () {
  const url = 'http://localhost:3000/registrations';

  const payload = JSON.stringify({
    userName: 'Ali',
    eventId: 2
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  http.post(url, payload, params);
}