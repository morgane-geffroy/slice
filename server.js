const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const root = path.join(__dirname, "public");
const sessions = new Map();

function createSession() {
  const id = crypto.randomBytes(3).toString("hex").toUpperCase();
  sessions.set(id, {
    input: { x: 0.5, y: 0.5, dx: 0, dy: 0, intensity: 0, mode: "idle", at: Date.now() },
    clients: new Set(),
    sockets: new Set(),
  });
  return id;
}

function getSession(id) {
  if (!id || !sessions.has(id)) {
    return null;
  }
  return sessions.get(id);
}

function sendSse(client, event, payload) {
  client.write(`event: ${event}\n`);
  client.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(id, event, payload) {
  const session = getSession(id);
  if (!session) return;
  for (const client of session.clients) {
    sendSse(client, event, payload);
  }
  const message = JSON.stringify({ event, payload });
  for (const socket of session.sockets) {
    sendWs(socket, message);
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/new") {
    const sessionId = createSession();
    res.writeHead(302, { Location: `/?session=${sessionId}` });
    res.end();
    return;
  }

  if (url.pathname === "/events") {
    const sessionId = url.searchParams.get("session");
    const session = getSession(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end("Unknown session");
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    session.clients.add(res);
    sendSse(res, "input", session.input);
    req.on("close", () => session.clients.delete(res));
    return;
  }

  if (url.pathname === "/input" && req.method === "POST") {
    const body = await readJson(req).catch(() => null);
    if (!body) {
      res.writeHead(400);
      res.end("Bad JSON");
      return;
    }

    const session = getSession(body.session);
    if (!session) {
      res.writeHead(404);
      res.end("Unknown session");
      return;
    }

    updateInput(body.session, body);

    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/api/session") {
    const sessionId = url.searchParams.get("session");
    const session = getSession(sessionId);
    res.writeHead(session ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: Boolean(session), session: sessionId }));
    return;
  }

  if (url.pathname === "/api/input") {
    const sessionId = url.searchParams.get("session");
    const session = getSession(sessionId);
    res.writeHead(session ? 200 : 404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(session?.input || { ok: false }));
    return;
  }

  if (url.pathname === "/api/urls") {
    const sessionId = url.searchParams.get("session") || "";
    const origins = localOrigins(port);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      session: sessionId,
      game: origins.map((origin) => `${origin}/?session=${encodeURIComponent(sessionId)}`),
      controller: origins.map((origin) => `${origin}/controller.html?session=${encodeURIComponent(sessionId)}`),
    }));
    return;
  }

  let filePath = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  serveFile(res, filePath);
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const sessionId = url.searchParams.get("session");
  const session = getSession(sessionId);
  const key = req.headers["sec-websocket-key"];
  if (!session || !key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "",
    "",
  ].join("\r\n"));

  socket.sessionId = sessionId;
  session.sockets.add(socket);
  sendWs(socket, JSON.stringify({ event: "input", payload: session.input }));
  socket.on("data", (buffer) => {
    for (const message of readWsMessages(buffer)) {
      let payload;
      try {
        payload = JSON.parse(message);
      } catch (error) {
        continue;
      }
      updateInput(sessionId, payload);
    }
  });
  socket.on("close", () => session.sockets.delete(socket));
  socket.on("error", () => session.sockets.delete(socket));
});

function updateInput(sessionId, body) {
  const session = getSession(sessionId);
  if (!session) return;
  const input = {
    x: clamp(Number(body.x), 0, 1, 0.5),
    y: clamp(Number(body.y), 0, 1, 0.5),
    dx: clamp(Number(body.dx), -1, 1, 0),
    dy: clamp(Number(body.dy), -1, 1, 0),
    intensity: clamp(Number(body.intensity), 0, 1, 0),
    mode: String(body.mode || "motion").slice(0, 20),
    at: Date.now(),
  };
  session.input = input;
  broadcast(sessionId, "input", input);
}

function sendWs(socket, message) {
  if (socket.destroyed) return;
  const payload = Buffer.from(message);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    return;
  }
  socket.write(Buffer.concat([header, payload]));
}

function readWsMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 6 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = Boolean(buffer[offset + 1] & 0x80);
    let length = buffer[offset + 1] & 0x7f;
    offset += 2;
    if (length === 126) {
      if (offset + 2 > buffer.length) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      break;
    }
    if (!masked || offset + 4 + length > buffer.length) break;
    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = buffer.subarray(offset, offset + length);
    offset += length;
    if (opcode === 8) break;
    if (opcode !== 1) continue;
    const decoded = Buffer.alloc(payload.length);
    for (let index = 0; index < payload.length; index += 1) {
      decoded[index] = payload[index] ^ mask[index % 4];
    }
    messages.push(decoded.toString("utf8"));
  }
  return messages;
}

function clamp(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function localAddresses(port) {
  return localOrigins(port).map((origin) => `${origin}/new`);
}

function localOrigins(port) {
  const urls = [`http://localhost:${port}`];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
      if (entry.family === "IPv6" && !entry.internal && !entry.address.startsWith("fe80:")) {
        urls.push(`http://[${entry.address}]:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

const port = Number(process.env.PORT || 4177);
server.listen(port, "0.0.0.0", () => {
  console.log("Fruit Saber prototype");
  for (const url of localAddresses(port)) {
    console.log(`  ${url}`);
  }
});
