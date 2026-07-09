/* ═══════════════════════════════════════════════════════════
   PHONE SLICE — contrôleur (téléphone)
   Streame l'orientation du téléphone vers l'écran de jeu.
   ═══════════════════════════════════════════════════════════ */

(() => {
  const stepCode = document.getElementById("step-code");
  const stepPerm = document.getElementById("step-perm");
  const stepBlade = document.getElementById("step-blade");
  const codeInput = document.getElementById("code-input");
  const joinBtn = document.getElementById("join-btn");
  const joinStatus = document.getElementById("join-status");
  const permBtn = document.getElementById("perm-btn");
  const permStatus = document.getElementById("perm-status");
  const bladeStatus = document.getElementById("blade-status");
  const bladeVisual = document.getElementById("blade-visual");
  const recenterBtn = document.getElementById("recenter-btn");

  let conn = null;

  if (location.protocol === "file:") {
    joinStatus.textContent = "Ouvre cette page depuis l'URL du site, pas depuis le fichier ZIP.";
    joinBtn.disabled = true;
    return;
  }

  if (typeof Peer === "undefined") {
    joinStatus.textContent = "Impossible de charger PeerJS. Vérifie ta connexion internet.";
    joinBtn.disabled = true;
    return;
  }

  if (!window.isSecureContext) {
    joinStatus.textContent = "Le téléphone doit ouvrir une URL HTTPS pour accéder aux capteurs.";
  }

  // Code pré-rempli si on arrive par QR code
  const params = new URLSearchParams(location.search);
  if (params.get("room")) {
    codeInput.value = params.get("room").toUpperCase();
  }

  joinBtn.addEventListener("click", join);
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") join();
  });

  function join() {
    if (!window.isSecureContext) {
      joinStatus.textContent = "Le téléphone doit ouvrir une URL HTTPS. Déploie sur Netlify ou utilise un tunnel HTTPS.";
      return;
    }

    const code = codeInput.value.trim().toUpperCase();
    if (code.length !== 4) {
      joinStatus.textContent = "Le code fait 4 caractères.";
      return;
    }
    joinStatus.textContent = "Connexion au dojo…";
    joinBtn.disabled = true;

    const peer = new Peer({ debug: 1 });
    peer.on("open", () => {
      conn = peer.connect("pslice-" + code, { reliable: false });
      conn.on("open", () => {
        stepCode.classList.add("hidden");
        stepPerm.classList.remove("hidden");
      });
      conn.on("error", fail);
      conn.on("close", () => {
        bladeStatus.textContent = "● déconnecté — recharge la page";
      });
      conn.on("data", (msg) => {
        if (!msg || !navigator.vibrate) return;
        if (msg.t === "sliced") navigator.vibrate(30);
        if (msg.t === "boom") navigator.vibrate([80, 40, 120]);
      });
      setTimeout(() => {
        if (!conn.open) fail();
      }, 8000);
    });
    peer.on("error", fail);

    function fail(err) {
      if (conn && conn.open) return;
      joinStatus.textContent = err && err.type
        ? "Connexion impossible : " + err.type
        : "Dojo introuvable. Vérifie le code.";
      joinBtn.disabled = false;
    }
  }

  // ── Permission capteurs (iOS 13+ exige un geste utilisateur) ──
  permBtn.addEventListener("click", async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") {
          permStatus.textContent = "Permission refusée. Autorise « Mouvement et orientation » dans Réglages > Safari.";
          return;
        }
      }
      startStreaming();
    } catch (e) {
      permStatus.textContent = "Erreur capteurs : " + e.message;
    }
  });

  function startStreaming() {
    stepPerm.classList.add("hidden");
    stepBlade.classList.remove("hidden");

    let lastSend = 0;
    window.addEventListener("deviceorientation", (e) => {
      if (!conn || !conn.open) return;
      if (e.alpha === null) {
        bladeStatus.textContent = "● capteurs indisponibles sur ce navigateur";
        return;
      }
      const now = performance.now();
      if (now - lastSend < 16) return; // ~60 Hz max
      lastSend = now;
      conn.send({ t: "o", a: e.alpha, b: e.beta, g: e.gamma });
      bladeVisual.style.transform =
        "rotate(" + (-e.gamma || 0) + "deg)";
    });

    // Petit garde-fou : empêcher l'écran de scroller pendant qu'on tranche
    document.body.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  }

  recenterBtn.addEventListener("click", () => {
    if (conn && conn.open) {
      conn.send({ t: "c" });
      bladeStatus.textContent = "● lame recentrée";
      setTimeout(() => (bladeStatus.textContent = "● connecté"), 1200);
    }
  });
})();
