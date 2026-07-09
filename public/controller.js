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
let baseline = { beta: 0, gamma: 0 };
let latestOrientation = null;
let latestMotion = null;
let motionEnabled = false;
let lastSent = 0;

if (!session) {
  statusEl.textContent = "Session manquante. Ouvre le lien affiché sur l'écran.";
} else {
  statusEl.textContent = `Session ${session}`;
}

motionButton.addEventListener("click", enableMotion);
calibrateButton.addEventListener("click", calibrate);
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

    addEventListener("deviceorientation", (event) => {
      latestOrientation = event;
      motionEnabled = true;
    });
    addEventListener("devicemotion", (event) => {
      latestMotion = event;
    });

    statusEl.textContent = "Capteurs actifs. Calibre en position neutre.";
    setTimeout(calibrate, 250);
  } catch (error) {
    statusEl.textContent = "Capteurs indisponibles. Utilise le pavé tactile.";
  }
}

function calibrate() {
  if (!latestOrientation) {
    baseline = { beta: 0, gamma: 0 };
    statusEl.textContent = "Calibration du pavé prête.";
    return;
  }
  baseline = {
    beta: latestOrientation.beta || 0,
    gamma: latestOrientation.gamma || 0,
  };
  statusEl.textContent = "Calibré.";
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
  const beta = latestOrientation.beta || 0;
  const gamma = latestOrientation.gamma || 0;
  const rawX = 0.5 + (gamma - baseline.gamma) / 70;
  const rawY = 0.5 + (beta - baseline.beta) / 90;
  const nextX = state.x + (clamp(rawX, 0, 1) - state.x) * 0.34;
  const nextY = state.y + (clamp(rawY, 0, 1) - state.y) * 0.34;
  const acceleration = latestMotion?.accelerationIncludingGravity;
  const rotation = latestMotion?.rotationRate;
  const accelMagnitude = acceleration
    ? Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0)
    : 0;
  const rotationGamma = rotation?.gamma || 0;
  const rotationBeta = rotation?.beta || 0;
  const rotationAlpha = rotation?.alpha || 0;
  const rotationPower = Math.min(1, Math.hypot(rotationAlpha, rotationBeta, rotationGamma) / 420);
  const accelPower = Math.min(1, Math.max(0, accelMagnitude - 9.8) / 18);
  const dx = clamp((nextX - state.x) * 5 + rotationGamma / 240, -1, 1);
  const dy = clamp((nextY - state.y) * 5 + rotationBeta / 240, -1, 1);

  state = {
    x: nextX,
    y: nextY,
    dx,
    dy,
    intensity: clamp(Math.hypot(dx, dy) * 0.8 + rotationPower * 0.7 + accelPower * 0.8, 0, 1),
    mode: "motion",
  };
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
  if (now - lastSent < 28) return;
  lastSent = now;

  fetch("/input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session, ...state }),
    keepalive: true,
  }).catch(() => {
    statusEl.textContent = "Connexion perdue.";
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tick() {
  updateMotion();
  renderController();
  send();
  requestAnimationFrame(tick);
}

tick();
