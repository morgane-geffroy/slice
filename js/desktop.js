/* ═══════════════════════════════════════════════════════════
   PHONE SLICE — écran de jeu (hôte)
   Le téléphone streame son orientation via WebRTC (PeerJS).
   L'écran la transforme en pointeur-lame et fait voler des fruits.
   ═══════════════════════════════════════════════════════════ */

(() => {
  // ── Appariement ───────────────────────────────────────────
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans caractères ambigus
  const roomCode = Array.from({ length: 4 }, () =>
    ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  ).join("");
  const peerId = "pslice-" + roomCode;

  const lobby = document.getElementById("lobby");
  const canvas = document.getElementById("game");
  const hud = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const comboEl = document.getElementById("combo");
  const connEl = document.getElementById("conn");
  const statusEl = document.getElementById("lobby-status");
  const qrEl = document.getElementById("qrcode");
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(location.hostname);

  document.getElementById("room-code").textContent = roomCode;

  const controllerUrl = new URL("controller.html", location.href);
  const controllerUrlEl = document.getElementById("controller-url");
  const controllerHref = controllerUrl.href + "?room=" + roomCode;
  controllerUrlEl.textContent = controllerUrl.host
    ? controllerUrl.host + controllerUrl.pathname
    : "controller.html";

  if (isLocalHost) {
    qrEl.textContent = "local";
    statusEl.textContent = "Test local OK à la souris. Pour le téléphone, déploie sur Netlify afin d'avoir une URL HTTPS.";
  } else if (typeof QRCode === "undefined") {
    qrEl.textContent = "QR indisponible";
    statusEl.textContent = "Impossible de charger QRCode. Vérifie ta connexion internet.";
  } else {
    new QRCode(qrEl, {
      text: controllerHref,
      width: 168,
      height: 168,
      colorDark: "#0c0f1d",
      colorLight: "#ffffff",
    });
  }

  if (location.protocol === "file:") {
    statusEl.textContent = "Ouvre ce dossier via un serveur web, pas directement depuis le fichier ZIP.";
  }

  if (typeof Peer === "undefined") {
    statusEl.textContent = "Impossible de charger PeerJS. Vérifie ta connexion internet.";
    return;
  }

  let conn = null;
  const peer = new Peer(peerId, { debug: 1 });

  peer.on("open", () => {
    statusEl.textContent = isLocalHost
      ? "Dojo prêt en local. Téléphone : utilise plutôt l'URL Netlify HTTPS."
      : "Dojo prêt. En attente de la lame…";
  });

  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      statusEl.textContent = "Code déjà pris, recharge la page.";
    } else {
      statusEl.textContent = "Erreur réseau : " + err.type;
    }
  });

  peer.on("connection", (c) => {
    conn = c;
    conn.on("data", onControllerData);
    conn.on("open", () => {
      statusEl.textContent = "Lame connectée ⚔️";
      startGame("phone");
    });
    conn.on("close", () => {
      connEl.textContent = "● lame déconnectée";
      connEl.classList.add("off");
    });
  });

  // Mode souris pour tester sans téléphone
  document.getElementById("mouse-mode").addEventListener("click", () => {
    startGame("mouse");
  });

  // ── Pointeur-lame ─────────────────────────────────────────
  // Le téléphone est un pointeur laser : yaw/pitch relatifs → x/y écran.
  const SPAN_X_DEG = 38; // amplitude horizontale couvrant l'écran
  const SPAN_Y_DEG = 32;

  let ref = null;            // orientation de référence (recentrage)
  const target = { x: 0, y: 0 };
  const blade = { x: 0, y: 0, vx: 0, vy: 0, speed: 0 };
  const trail = [];          // traînée [{x, y, t}]

  function wrap180(d) {
    return ((d + 540) % 360) - 180;
  }

  function onControllerData(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.t === "o") {
      if (!ref) ref = { a: msg.a, b: msg.b, g: msg.g };
      const hasGamma = typeof msg.g === "number" && Number.isFinite(msg.g);
      const da = hasGamma
        ? msg.g - ref.g          // inclinaison gauche/droite : beaucoup plus réactive que la boussole
        : wrap180(msg.a - ref.a);
      const db = msg.b - ref.b;          // pitch : haut/bas
      target.x = W / 2 + (da / SPAN_X_DEG) * W;
      target.y = H / 2 - (db / SPAN_Y_DEG) * H;
      target.x = Math.max(24, Math.min(W - 24, target.x));
      target.y = Math.max(24, Math.min(H - 24, target.y));
    } else if (msg.t === "c") {
      ref = null; // le prochain paquet devient le nouveau centre
    }
  }

  // ── État du jeu ───────────────────────────────────────────
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  let running = false;
  let inputMode = "phone";

  let fruits = [];
  let particles = [];
  let splashes = [];
  let score = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let spawnTimer = 0;
  let shake = 0;

  const FRUIT_COLORS = [
    { main: "#7ce07c", dark: "#3da53d", name: "matcha" },
    { main: "#ffb14d", dark: "#d97a12", name: "yuzu" },
    { main: "#ff5c8a", dark: "#c62a58", name: "dragon" },
    { main: "#a8e9ff", dark: "#4aa8d8", name: "glace" },
  ];

  const FOOD_ASSETS = [
    { name: "apple", src: "assets/food/apple.png", half: "assets/food/apple-half.png", color: { main: "#ff5c5c", dark: "#b72535" }, r: 44 },
    { name: "banana", src: "assets/food/banana.png", color: { main: "#ffdf57", dark: "#c58b17" }, r: 48 },
    { name: "lemon", src: "assets/food/lemon.png", half: "assets/food/lemon-half.png", color: { main: "#ffe66b", dark: "#d0a81a" }, r: 42 },
    { name: "orange", src: "assets/food/orange.png", color: { main: "#ff9b3d", dark: "#c95c16" }, r: 44 },
    { name: "pear", src: "assets/food/pear.png", half: "assets/food/pear-half.png", color: { main: "#b9f05f", dark: "#6aa625" }, r: 46 },
    { name: "strawberry", src: "assets/food/strawberry.png", color: { main: "#ff426b", dark: "#a7193c" }, r: 40 },
    { name: "watermelon", src: "assets/food/watermelon.png", color: { main: "#49d16f", dark: "#1d8f45" }, r: 52 },
    { name: "pineapple", src: "assets/food/pineapple.png", color: { main: "#ffd05a", dark: "#a87516" }, r: 54 },
    { name: "cherries", src: "assets/food/cherries.png", color: { main: "#ff3b5c", dark: "#9f1730" }, r: 44 },
    { name: "grapes", src: "assets/food/grapes.png", color: { main: "#9b6dff", dark: "#56329d" }, r: 48 },
    { name: "coconut", src: "assets/food/coconut.png", half: "assets/food/coconut-half.png", color: { main: "#9b6842", dark: "#5a3825" }, r: 45 },
  ].map((asset) => {
    const img = new Image();
    img.src = asset.src;
    const halfImg = asset.half ? new Image() : null;
    if (halfImg) halfImg.src = asset.half;
    return { ...asset, img, halfImg };
  });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);

  function startGame(mode) {
    if (running) return;
    inputMode = mode;
    running = true;
    lobby.classList.add("hidden");
    canvas.classList.remove("hidden");
    hud.classList.remove("hidden");
    connEl.textContent = mode === "mouse" ? "● mode souris" : "● lame connectée";
    resize();
    blade.x = target.x = W / 2;
    blade.y = target.y = H / 2;
    spawnTimer = 0.05;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  window.addEventListener("pointermove", (e) => {
    if (inputMode === "mouse") {
      target.x = e.clientX;
      target.y = e.clientY;
    }
  });

  // ── Entités ───────────────────────────────────────────────
  function spawnWave() {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const isBomb = Math.random() < 0.12;
      const asset = FOOD_ASSETS[Math.floor(Math.random() * FOOD_ASSETS.length)];
      const fromLeft = (i + Math.floor(Math.random() * 2)) % 2 === 0;
      const cornerX = fromLeft ? -70 : W + 70;
      const cornerY = H + 70;
      const targetX = W * (0.34 + Math.random() * 0.32);
      const targetY = H * (0.18 + Math.random() * 0.28);
      const travelFrames = 58 + Math.random() * 18;
      fruits.push({
        x: cornerX + (fromLeft ? -i * 20 : i * 20),
        y: cornerY + i * 14,
        vx: (targetX - cornerX) / travelFrames,
        vy: -17 - Math.random() * 7,
        r: isBomb ? 34 : asset.r * (0.85 + Math.random() * 0.3),
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.11,
        bomb: isBomb,
        asset,
        color: isBomb ? FRUIT_COLORS[2] : asset.color,
        sliced: false,
      });
    }
  }

  function sliceFruit(f, angle) {
    f.sliced = true;
    if (f.bomb) {
      score = Math.max(0, score - 50);
      shake = 18;
      comboCount = 0;
      burst(f.x, f.y, "#ff4438", 26, 7);
      send({ t: "boom" });
    } else {
      comboCount++;
      comboTimer = 0.45;
      const gain = 10 * comboCount;
      score += gain;
      burst(f.x, f.y, f.color.main, 18, 5);
      splashes.push({ x: f.x, y: f.y, r: f.r, color: f.color.dark, a: 0.5 });
      // deux moitiés qui s'écartent
      for (const side of [-1, 1]) {
        particles.push({
          half: true, img: f.asset && f.asset.halfImg, x: f.x, y: f.y,
          vx: f.vx + Math.cos(angle + Math.PI / 2) * side * 3.2,
          vy: f.vy + Math.sin(angle + Math.PI / 2) * side * 3.2,
          r: f.r, rot: f.rot, vrot: side * 0.12,
          angle, color: f.color, life: 1.4, side,
        });
      }
      send({ t: "sliced" });
    }
    updateHud();
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.4 + Math.random()) * power;
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        r: 2 + Math.random() * 4,
        color, life: 0.6 + Math.random() * 0.5,
      });
    }
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  function updateHud() {
    scoreEl.textContent = score;
    comboEl.textContent = comboCount > 1 ? "combo ×" + comboCount : "";
  }

  // ── Collision segment / cercle ────────────────────────────
  function segHitsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    return (cx - px) ** 2 + (cy - py) ** 2 <= r * r;
  }

  // ── Boucle ────────────────────────────────────────────────
  let last = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // lissage du pointeur + vitesse
    const px = blade.x, py = blade.y;
    blade.x += (target.x - blade.x) * 0.78;
    blade.y += (target.y - blade.y) * 0.78;
    blade.vx = blade.x - px;
    blade.vy = blade.y - py;
    blade.speed = Math.hypot(blade.vx, blade.vy);

    trail.push({ x: blade.x, y: blade.y, t: now });
    while (trail.length && now - trail[0].t > 160) trail.shift();

    // spawn
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnWave();
      spawnTimer = 0.55 + Math.random() * 0.45;
    }

    // combo timeout
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { comboCount = 0; updateHud(); }
    }

    // physique fruits + tranchage
    const g = H * 0.00052;
    const fast = blade.speed > 14; // il faut vraiment trancher, pas caresser
    const angle = Math.atan2(blade.vy, blade.vx);

    for (const f of fruits) {
      f.x += f.vx * dt * 60;
      f.y += f.vy * dt * 60;
      f.vy += g * dt * 60;
      f.rot += f.vrot * dt * 60;
      if (!f.sliced && fast && segHitsCircle(px, py, blade.x, blade.y, f.x, f.y, f.r + 6)) {
        sliceFruit(f, angle);
      }
    }
    fruits = fruits.filter((f) => !f.sliced && f.y < H + 120);

    // particules
    for (const p of particles) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += g * dt * 60;
      if (p.vrot) p.rot += p.vrot * dt * 60;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H + 150);
    for (const s of splashes) s.a -= dt * 0.25;
    splashes = splashes.filter((s) => s.a > 0);

    if (shake > 0) shake *= 0.86;

    draw(now);
    requestAnimationFrame(loop);
  }

  // ── Rendu ─────────────────────────────────────────────────
  function draw(now) {
    ctx.save();
    if (shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    // fond
    const bg = ctx.createRadialGradient(W / 2, -H * 0.2, 0, W / 2, H / 2, H * 1.1);
    bg.addColorStop(0, "#141a30");
    bg.addColorStop(1, "#0c0f1d");
    ctx.fillStyle = bg;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    // éclaboussures au sol du décor
    for (const s of splashes) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r * 2.2, s.r * 1.4, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // fruits
    for (const f of fruits) drawFruit(f);

    // particules + moitiés
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life);
      if (p.half) {
        drawHalf(p);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // traînée de lame
    if (trail.length > 2) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const pass of [
        { w: 14, c: "rgba(168,233,255,0.22)" },
        { w: 7, c: "rgba(168,233,255,0.55)" },
        { w: 2.5, c: "#ffffff" },
      ]) {
        ctx.strokeStyle = pass.c;
        ctx.lineWidth = pass.w;
        ctx.beginPath();
        trail.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
      }
    }

    // pointe de lame
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(168,233,255,0.9)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(blade.x, blade.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawFruit(f) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.rot);
    if (f.bomb) {
      ctx.fillStyle = "#22242f";
      ctx.beginPath();
      ctx.arc(0, 0, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ff4438";
      ctx.lineWidth = 3;
      ctx.stroke();
      // mèche
      ctx.strokeStyle = "#ffb14d";
      ctx.beginPath();
      ctx.moveTo(0, -f.r);
      ctx.quadraticCurveTo(8, -f.r - 12, 14, -f.r - 8);
      ctx.stroke();
      ctx.fillStyle = "#ffdf6b";
      ctx.beginPath();
      ctx.arc(14, -f.r - 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawFoodSprite(f.asset && f.asset.img, f.r, f.color);
    }
    ctx.restore();
  }

  function drawHalf(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.img && p.img.complete && p.img.naturalWidth) {
      const size = p.r * 2.05;
      ctx.scale(p.side || 1, 1);
      ctx.drawImage(p.img, -size / 2, -size / 2, size, size);
    } else {
      const grad = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, p.r * 0.1, 0, 0, p.r);
      grad.addColorStop(0, p.color.main);
      grad.addColorStop(1, p.color.dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, p.angle, p.angle + Math.PI);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFoodSprite(img, r, color) {
    if (!img || !img.complete || !img.naturalWidth) {
      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.25, color.main);
      grad.addColorStop(1, color.dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const size = r * 2.35;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 12;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();

    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.3, r * 0.35, r * 0.18, -0.45, 0, Math.PI * 2);
    ctx.fill();
  }
})();
