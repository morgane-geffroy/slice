const store = globalThis.__sliceInputStore || new Map();
globalThis.__sliceInputStore = store;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return response(204, "");
  }

  if (event.httpMethod === "GET") {
    const session = event.queryStringParameters?.session;
    const input = store.get(session) || {
      x: 0.5,
      y: 0.5,
      intensity: 0,
      mode: "waiting",
      at: 0,
    };
    return response(200, JSON.stringify(input));
  }

  if (event.httpMethod !== "POST") {
    return response(405, "Method not allowed");
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return response(400, "Bad JSON");
  }

  if (!payload.session) {
    return response(400, "Missing session");
  }

  const input = {
    x: clamp(Number(payload.x), 0, 1, 0.5),
    y: clamp(Number(payload.y), 0, 1, 0.5),
    intensity: clamp(Number(payload.intensity), 0, 1, 0),
    mode: String(payload.mode || "motion").slice(0, 20),
    at: Date.now(),
  };
  store.set(String(payload.session), input);

  return response(204, "");
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Cache-Control": "no-store",
    },
    body,
  };
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
