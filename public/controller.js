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
  const acceleration = latestMotion?.accelerationIncludingGravity;
  const accelPower = acceleration
    ? Math.min(1, Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0) / 28)
    : 0;

  state = {
    x: state.x + (clamp(rawX, 0, 1) - state.x) * 0.34,
    y: state.y + (clamp(rawY, 0, 1) - state.y) * 0.34,
    intensity: accelPower,
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
