const params = new URLSearchParams(location.search);
let session = params.get("session");
if (!session) {
  session = Math.random().toString(16).slice(2, 8).toUpperCase();
  params.set("session", session);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const sessionCode = document.querySelector("#sessionCode");
const phoneUrl = document.querySelector("#phoneUrl");
const controllerLink = document.querySelector("#controllerLink");

sessionCode.textContent = session;
const controllerUrl = `${location.origin}/controller.html?session=${session}`;
phoneUrl.textContent = controllerUrl;
controllerLink.href = controllerUrl;

let width = 0;
let height = 0;
let score = 0;
let input = { x: 0.5, y: 0.5, intensity: 0, mode: "idle", at: 0 };
let blade = { x: 0, y: 0, px: 0, py: 0 };
let fruits = [];
let particles = [];
let trail = [];

function resize() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

addEventListener("resize", resize);
resize();

connectInput();
canvas.addEventListener("pointerdown", usePointer);
canvas.addEventListener("pointermove", usePointer);
canvas.addEventListener("pointerup", () => {
  input = { ...input, intensity: 0, mode: "local", at: Date.now() };
});

function connectInput() {
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    startPollingInput();
    return;
  }

  const source = new EventSource(`/events?session=${encodeURIComponent(session)}`);
  source.addEventListener("input", (event) => {
    input = JSON.parse(event.data);
  });
  source.onerror = () => {
    source.close();
    startPollingInput();
  };
}

function startPollingInput() {
  setInterval(async () => {
    try {
      const response = await fetch(`/api/input?session=${encodeURIComponent(session)}`, { cache: "no-store" });
      if (response.ok) {
        const nextInput = await response.json();
        if (nextInput.at && nextInput.at >= input.at) {
          input = nextInput;
        }
      }
    } catch (error) {
      // Pointer input remains available when there is no backend.
    }
  }, 45);
}

function usePointer(event) {
  if (event.buttons === 0 && event.type !== "pointerdown") return;
  const x = Math.max(0, Math.min(1, event.clientX / width));
  const y = Math.max(0, Math.min(1, event.clientY / height));
  const speed = Math.hypot(x - input.x, y - input.y);
  input = {
    x,
    y,
    intensity: Math.min(1, speed * 12),
    mode: "local",
    at: Date.now(),
  };
}

function spawnFruit() {
  const radius = 28 + Math.random() * 22;
  const x = radius + Math.random() * (width - radius * 2);
  fruits.push({
    x,
    y: height + radius,
    vx: (Math.random() - 0.5) * 2.2,
    vy: -11 - Math.random() * 5,
    radius,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.12,
    color: pick(["#ff5a4f", "#f7c948", "#6fce5f", "#fe8c48", "#b063e8"]),
    sliced: false,
  });
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function updateBlade() {
  const targetX = input.x * width;
  const targetY = input.y * height;
  blade.px = blade.x;
  blade.py = blade.y;
  blade.x += (targetX - blade.x) * 0.42;
  blade.y += (targetY - blade.y) * 0.42;
  const speed = Math.hypot(blade.x - blade.px, blade.y - blade.py);
  const power = Math.min(1, speed / 55 + input.intensity * 0.75);
  trail.push({ x: blade.x, y: blade.y, power, life: 1 });
  if (trail.length > 18) trail.shift();
}

function updateFruits() {
  if (Math.random() < 0.025 && fruits.length < 9) spawnFruit();

  for (const fruit of fruits) {
    fruit.x += fruit.vx;
    fruit.y += fruit.vy;
    fruit.vy += 0.22;
    fruit.rotation += fruit.spin;

    const distance = distanceToSegment(fruit.x, fruit.y, blade.px, blade.py, blade.x, blade.y);
    const bladeSpeed = Math.hypot(blade.x - blade.px, blade.y - blade.py);
    if (!fruit.sliced && distance < fruit.radius + 10 && bladeSpeed > 16) {
      sliceFruit(fruit);
    }
  }

  fruits = fruits.filter((fruit) => fruit.y < height + fruit.radius * 2 && !fruit.sliced);
}

function sliceFruit(fruit) {
  fruit.sliced = true;
  score += 10;
  scoreEl.textContent = score;
  for (let index = 0; index < 26; index += 1) {
    particles.push({
      x: fruit.x,
      y: fruit.y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.9) * 8,
      radius: 2 + Math.random() * 5,
      color: fruit.color,
      life: 1,
    });
  }
}

function updateParticles() {
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.18;
    particle.life -= 0.026;
  }
  particles = particles.filter((particle) => particle.life > 0);
  for (const point of trail) {
    point.life -= 0.075;
  }
  trail = trail.filter((point) => point.life > 0);
}

function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#18351f");
  gradient.addColorStop(0.55, "#11160f");
  gradient.addColorStop(1, "#281a13");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255,255,255,0.035)";
  for (let x = 0; x < width; x += 80) {
    context.fillRect(x, 0, 1, height);
  }
}

function drawFruits() {
  for (const fruit of fruits) {
    context.save();
    context.translate(fruit.x, fruit.y);
    context.rotate(fruit.rotation);
    context.fillStyle = fruit.color;
    context.beginPath();
    context.ellipse(0, 0, fruit.radius * 0.88, fruit.radius, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255,255,255,0.32)";
    context.beginPath();
    context.ellipse(-fruit.radius * 0.28, -fruit.radius * 0.32, fruit.radius * 0.2, fruit.radius * 0.12, -0.6, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    context.globalAlpha = Math.max(0, particle.life);
    context.fillStyle = particle.color;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawBlade() {
  if (trail.length < 2) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (let index = 1; index < trail.length; index += 1) {
    const previous = trail[index - 1];
    const current = trail[index];
    context.globalAlpha = current.life * 0.78;
    context.strokeStyle = current.power > 0.45 ? "#fff7c5" : "#b9f6ff";
    context.lineWidth = 8 + current.power * 18;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(current.x, current.y);
    context.stroke();
  }
  context.restore();
  context.globalAlpha = 1;
}

function drawConnectionHint() {
  if (input.at && Date.now() - input.at < 1200) return;
  context.fillStyle = "rgba(247,241,223,0.62)";
  context.font = "700 18px system-ui";
  context.textAlign = "center";
  context.fillText("Ouvre le lien téléphone ou tranche directement ici", width / 2, height / 2);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function frame() {
  updateBlade();
  updateFruits();
  updateParticles();
  drawBackground();
  drawFruits();
  drawParticles();
  drawBlade();
  drawConnectionHint();
  requestAnimationFrame(frame);
}

frame();
