const params = new URLSearchParams(location.search);
const session = params.get("session");
const statusEl = document.querySelector("#status");
const modeEl = document.querySelector("#mode");
const coordsEl = document.querySelector("#coords");
const pad = document.querySelector("#pad");
const dot = document.querySelector("#bladeDot");
const motionButton = document.querySelector("#motionButton");
const calibrateButton = document.querySelector("#calibrateButton");

let state = {
  x: 0.5,
  y: 0.5,
  dx: 0,
  dy: 0,
  intensity: 0,
  mode: "pad",
};
let baseline = { alpha: 0, beta: 0, gamma: 0 };
let latestOrientation = null;
let latestMotion = null;
let motionEnabled = false;
let lastSent = 0;
let socket = null;
let socketReady = false;
let wakeLock = null;
let filtered = {
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  lastAt: performance.now(),
};

if (!session) {
  statusEl.textContent = "Session manquante. Ouvre le lien affiché sur l'écran.";
} else {
  statusEl.textContent = `Session ${session}`;
  connectSocket();
}

motionButton.addEventListener("click", enableMotion);
calibrateButton.addEventListener("click", calibrate);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && motionEnabled) {
    requestWakeLock();
  }
});
pad.addEventListener("pointerdown", usePad);
pad.addEventListener("pointermove", usePad);
pad.addEventListener("pointerup", () => {
  state.intensity = 0;
});

async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && DeviceOrientationEvent.requestPermission) {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        statusEl.textContent = "Capteurs refusés. Utilise le pavé tactile.";
        return;
      }
    }

    if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) {
      await DeviceMotionEvent.requestPermission().catch(() => "denied");
    }

    await requestWakeLock();

    addEventListener("deviceorientation", (event) => {
      latestOrientation = event;
      motionEnabled = true;
    });
    addEventListener("devicemotion", (event) => {
      latestMotion = event;
    });

    statusEl.textContent = "Capteurs actifs. Pointe le centre de l'écran puis calibre.";
    setTimeout(calibrate, 250);
  } catch (error) {
    statusEl.textContent = "Capteurs indisponibles. Utilise le pavé tactile.";
  }
}

function calibrate() {
  if (!latestOrientation) {
    baseline = { alpha: 0, beta: 0, gamma: 0 };
    statusEl.textContent = "Calibration du pavé prête.";
    return;
  }
  baseline = {
    alpha: latestOrientation.alpha || 0,
    beta: latestOrientation.beta || 0,
    gamma: latestOrientation.gamma || 0,
  };
  state = { ...state, x: 0.5, y: 0.5, dx: 0, dy: 0, intensity: 0, mode: "aim" };
  filtered = { x: 0.5, y: 0.5, vx: 0, vy: 0, lastAt: performance.now() };
  statusEl.textContent = "Calibré en mode pointeur.";
}

function usePad(event) {
  if (!event.isPrimary || event.buttons === 0) return;
  const rect = pad.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const dx = x - state.x;
  const dy = y - state.y;
  state = {
    x,
    y,
    dx: clamp(dx * 5, -1, 1),
    dy: clamp(dy * 5, -1, 1),
    intensity: clamp(Math.hypot(dx, dy) * 9, 0, 1),
    mode: "pad",
  };
  renderController();
  send();
}

function updateMotion() {
  if (!motionEnabled || !latestOrientation) return;
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.008, (now - filtered.lastAt) / 1000));
  filtered.lastAt = now;
  const alpha = latestOrientation.alpha || 0;
  const beta = latestOrientation.beta || 0;
  const gamma = latestOrientation.gamma || 0;
  const yaw = shortestAngle(alpha - baseline.alpha);
  const pitch = beta - baseline.beta;
  const roll = gamma - baseline.gamma;
  const rawX = 0.5 + yaw / 42 + roll / 150;
  const rawY = 0.5 + pitch / 38;
  const targetX = clamp(rawX, 0, 1);
  const targetY = clamp(rawY, 0, 1);
  const distance = Math.hypot(targetX - filtered.x, targetY - filtered.y);
  const smoothing = clamp(0.16 + distance * 2.4, 0.18, 0.58);
  const nextX = filtered.x + (targetX - filtered.x) * smoothing;
  const nextY = filtered.y + (targetY - filtered.y) * smoothing;
  const measuredVx = (nextX - filtered.x) / dt;
  const measuredVy = (nextY - filtered.y) / dt;
  filtered.vx += (measuredVx - filtered.vx) * 0.32;
  filtered.vy += (measuredVy - filtered.vy) * 0.32;
  filtered.x = nextX;
  filtered.y = nextY;
  const acceleration = latestMotion?.accelerationIncludingGravity;
  const rotation = latestMotion?.rotationRate;
  const accelMagnitude = acceleration
    ? Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0)
    : 0;
  const rotationGamma = rotation?.gamma || 0;
  const rotationBeta = rotation?.beta || 0;
  const rotationAlpha = rotation?.alpha || 0;
  const rotationPower = Math.min(1, Math.hypot(rotationAlpha, rotationBeta, rotationGamma) / 320);
  const accelPower = Math.min(1, Math.max(0, accelMagnitude - 9.8) / 14);
  const dx = clamp(filtered.vx * 0.18 + rotationAlpha / 260 + rotationGamma / 320, -1, 1);
  const dy = clamp(filtered.vy * 0.18 + rotationBeta / 260, -1, 1);
  const stillness = Math.hypot(filtered.vx, filtered.vy);
  const stableX = stillness < 0.025 ? state.x + (nextX - state.x) * 0.12 : nextX;
  const stableY = stillness < 0.025 ? state.y + (nextY - state.y) * 0.12 : nextY;

  state = {
    x: stableX,
    y: stableY,
    dx,
    dy,
    intensity: clamp(Math.hypot(dx, dy) * 0.95 + rotationPower * 0.85 + accelPower * 0.9, 0, 1),
    mode: "aim",
  };
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (error) {
    wakeLock = null;
  }
}

function connectSocket() {
  if (location.protocol === "https:" && location.hostname.endsWith("netlify.app")) return;
  socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?session=${encodeURIComponent(session)}`);
  socket.addEventListener("open", () => {
    socketReady = true;
    statusEl.textContent = `Session ${session} - direct`;
  });
  socket.addEventListener("close", () => {
    socketReady = false;
    setTimeout(connectSocket, 900);
  });
  socket.addEventListener("error", () => {
    socketReady = false;
    socket.close();
  });
}

function renderController() {
  dot.style.left = `${state.x * 100}%`;
  dot.style.top = `${state.y * 100}%`;
  modeEl.textContent = state.mode;
  coordsEl.textContent = `${state.x.toFixed(2)} / ${state.y.toFixed(2)}`;
}

function send() {
  if (!session) return;
  const now = performance.now();
  if (now - lastSent < (socketReady ? 14 : 28)) return;
  lastSent = now;
  const payload = JSON.stringify({ session, ...state });

  if (socketReady && socket?.readyState === WebSocket.OPEN) {
    socket.send(payload);
    return;
  }

  fetch("/input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    statusEl.textContent = "Connexion perdue.";
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shortestAngle(value) {
  return ((value + 540) % 360) - 180;
}

function tick() {
  updateMotion();
  renderController();
  send();
  requestAnimationFrame(tick);
}

tick();
