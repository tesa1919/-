import {
  WORLD,
  FACES,
  MERGE_POINTS,
  FINAL_MERGE_POINTS,
  DROP_LEVELS,
  DROP_WEIGHTS,
  clamp,
} from "./config.js";

const { Engine, Composite, Bodies, Body, Events, Vector } = window.Matter;

const TAU = Math.PI * 2;
const FIXED_STEP = 1000 / 60;

function weightedPick(values, weights) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += weights[i];
    if (r <= acc) return values[i];
  }
  return values[values.length - 1];
}

export class FaceSuikaGame {
  constructor(canvas, images, audio, callbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.images = images;
    this.audio = audio;
    this.callbacks = callbacks;
    this.W = WORLD.width;
    this.H = WORLD.height;
    this.dpr = 1;
    this.running = false;
    this.over = false;
    this.overAt = 0;
    this.paused = false;
    this.aiming = false;
    this.aimX = this.W / 2;
    this.acc = 0;
    this.lastTime = 0;
    this.lastDrop = 0;
    this.shake = 0;
    this.flash = 0;
    this.flashColor = "255,248,220";
    this.timeScale = 1;
    this.slowUntil = 0;
    this.bigMonkUntil = 0;
    this.bigMonkCenter = null;
    this.danger = false;
    this.combo = 1;
    this.lastMergeAt = 0;
    this.lastVoiceAt = 0;
    this.queue = [];
    this.current = 0;
    this.score = 0;
    this.merges = 0;
    this.maxLevel = 0;
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.mergeQueue = [];
    this.debug = false;

    this.setupEngine();
    this.bindInput();
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener("resize", this.onResize);
    this.loop = this.loop.bind(this);
  }

  setupEngine() {
    this.engine = Engine.create();
    this.engine.gravity.y = 1.05;
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 8;
    this.engine.constraintIterations = 3;
    this.world = this.engine.world;
    Events.on(this.engine, "collisionStart", (event) => this.handleCollisions(event));
    Events.on(this.engine, "collisionActive", (event) => this.handleCollisions(event));
  }

  resetWorld() {
    Composite.clear(this.world, false, true);
    const t = WORLD.wallThickness;
    const wallOpts = {
      isStatic: true,
      label: "wall",
      friction: 0.7,
      frictionStatic: 1,
      restitution: 0.02,
      render: { visible: false },
    };
    Composite.add(this.world, [
      Bodies.rectangle(WORLD.left - t / 2, this.H / 2, t, this.H * 2.2, wallOpts),
      Bodies.rectangle(WORLD.right + t / 2, this.H / 2, t, this.H * 2.2, wallOpts),
      Bodies.rectangle(this.W / 2, WORLD.floor + t / 2, this.W + t * 2, t, wallOpts),
      Bodies.rectangle(this.W / 2, -220, this.W + t * 2, 40, wallOpts),
    ]);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  bindInput() {
    const toX = (clientX) => {
      const rect = this.canvas.getBoundingClientRect();
      return ((clientX - rect.left) / Math.max(1, rect.width)) * this.W;
    };
    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.running || this.over || this.paused) return;
        e.preventDefault();
        this.aiming = true;
        this.aimX = toX(e.clientX);
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (this.audio) this.audio.click();
      },
      { passive: false },
    );
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.running || this.over) return;
      if (this.aiming || e.pointerType === "mouse") this.aimX = toX(e.clientX);
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!this.aiming) return;
      this.aiming = false;
      if (!this.running || this.over || this.paused) return;
      this.aimX = toX(e.clientX);
      this.dropAt(this.aimX);
    });
    this.canvas.addEventListener("pointercancel", () => {
      this.aiming = false;
    });
    this.onKey = (e) => {
      if (!this.running || this.over) return;
      if (e.key === "ArrowLeft") {
        this.aimX -= 18;
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        this.aimX += 18;
        e.preventDefault();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        this.dropAt(this.aimX);
      }
    };
    window.addEventListener("keydown", this.onKey);
  }

  start() {
    this.reset();
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.aiming = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  reset() {
    this.resetWorld();
    this.score = 0;
    this.merges = 0;
    this.maxLevel = 0;
    this.combo = 1;
    this.lastMergeAt = 0;
    this.lastVoiceAt = 0;
    this.over = false;
    this.overAt = 0;
    this.overNotified = false;
    this.paused = false;
    this.acc = 0;
    this.lastDrop = 0;
    this.shake = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.slowUntil = 0;
    this.bigMonkUntil = 0;
    this.bigMonkCenter = null;
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.mergeQueue = [];
    this.aimX = this.W / 2;
    this.current = weightedPick(DROP_LEVELS, DROP_WEIGHTS);
    this.queue = Array.from({ length: 3 }, () => weightedPick(DROP_LEVELS, DROP_WEIGHTS));
    this.emitStats();
    this.emitQueue();
  }

  randomDrop() {
    return weightedPick(DROP_LEVELS, DROP_WEIGHTS);
  }

  emitStats() {
    this.callbacks.onStats?.(this.getStats());
  }

  emitQueue() {
    this.callbacks.onQueue?.({
      current: this.current,
      next: this.queue.slice(0, 3),
    });
  }

  getStats() {
    return {
      score: this.score,
      combo: this.combo,
      merges: this.merges,
      maxLevel: this.maxLevel,
      over: this.over,
    };
  }

  createFace(level, x, y, opts = {}) {
    const face = FACES[level];
    const radius = face.radius * 0.965;
    const isRage = face.special === "rage";
    const isSiva = face.special === "siva";
    const body = Bodies.circle(x, y, radius, {
      label: "face",
      restitution: isRage ? 0.92 : isSiva ? 0.35 : 0.13,
      friction: isRage ? 0.015 : 0.44,
      frictionStatic: isRage ? 0.08 : 0.72,
      frictionAir: isRage ? 0.006 : 0.014,
      density: isRage ? 0.0016 : 0.00105,
      slop: 0.02,
      render: { visible: false },
    });
    const now = performance.now();
    body.plugin.face = {
      level,
      merged: false,
      born: now,
      seed: Math.random() * 100,
      overSince: 0,
      nextBlast: now + 1200 + Math.random() * 900,
      blastCount: 0,
      lastJitter: 0,
    };
    Body.setAngle(body, opts.angle ?? (Math.random() - 0.5) * 0.5);
    Body.setAngularVelocity(body, opts.angularVelocity ?? (Math.random() - 0.5) * 0.035);
    if (opts.vx || opts.vy) Body.setVelocity(body, { x: opts.vx || 0, y: opts.vy || 0 });
    Composite.add(this.world, body);

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.emitStats();
    }
    if (isSiva) this.onSivaSpawn(body, false);
    if (isRage) this.onRageSpawn(body);
    return body;
  }

  handleCollisions(event) {
    if (this.over) return;
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a.label !== "face" || b.label !== "face") continue;
      const fa = a.plugin.face;
      const fb = b.plugin.face;
      if (!fa || !fb || fa.merged || fb.merged) continue;
      if (fa.level !== fb.level) continue;
      fa.merged = true;
      fb.merged = true;
      this.mergeQueue.push([a, b]);
    }
  }

  checkProximityMerges() {
    if (this.over) return;
    const bodies = Composite.allBodies(this.world);
    const faces = [];
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.label === "face" && b.plugin?.face && !b.plugin.face.merged) {
        faces.push(b);
      }
    }
    const len = faces.length;
    for (let i = 0; i < len; i++) {
      const a = faces[i];
      const fa = a.plugin?.face;
      if (!fa || fa.merged) continue;
      for (let j = i + 1; j < len; j++) {
        const b = faces[j];
        const fb = b.plugin?.face;
        if (!fb || fb.merged || fa.level !== fb.level) continue;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const rSum = a.circleRadius + b.circleRadius;
        if (dx * dx + dy * dy <= (rSum + 2) * (rSum + 2)) {
          fa.merged = true;
          fb.merged = true;
          this.mergeQueue.push([a, b]);
          break;
        }
      }
    }
  }

  processMerges(now) {
    if (!this.mergeQueue.length) return;
    const queue = this.mergeQueue;
    this.mergeQueue = [];
    for (const [a, b] of queue) {
      const fa = a.plugin.face;
      const fb = b.plugin.face;
      if (!fa || !fb) continue;
      const level = fa.level;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2;
      const vy = Math.min(0, (a.velocity.y + b.velocity.y) / 2);
      Composite.remove(this.world, a);
      Composite.remove(this.world, b);
      this.merges += 1;

      if (level >= 10) {
        this.ascendBigMonks(x, y, now);
        continue;
      }

      const next = level + 1;
      this.addScore(MERGE_POINTS[level] || 0, now, x, y, next);
      this.addMergeFx(x, y, next, now);

      if (level === 8) {
        this.rageBlastAt(x, y, 1.65, true);
      }

      const created = this.createFace(next, x, y, { vx: vx * 0.25, vy: vy * 0.15 - 0.4 });

      if (next === 10) {
        this.triggerBigMonk(created, now);
      } else if (next === 9) {
        this.audio?.monk();
        this.callbacks.onEvent?.({
          type: "monk",
          title: "坊主降臨",
          sub: "あと1回の合体で大坊主",
        });
        this.rings.push({ x, y, r: 20, maxR: 180, life: 0.8, maxLife: 0.8, color: "255,210,94", width: 5 });
        this.shake = Math.max(this.shake, 10);
      }
    }
  }

  addScore(base, now, x, y, level) {
    if (now - this.lastMergeAt < 1500) this.combo = Math.min(this.combo + 1, 5);
    else this.combo = 1;
    this.lastMergeAt = now;
    const gain = Math.round(base * this.combo);
    this.score += gain;
    this.texts.push({
      x,
      y: y - 16,
      text: `+${gain}`,
      color: level >= 9 ? "255,224,140" : "255,255,255",
      size: level >= 9 ? 34 : 25,
      life: 1.15,
      maxLife: 1.15,
      vy: -54,
    });
    this.emitStats();
    if (this.combo >= 2) {
      this.callbacks.onCombo?.(this.combo);
    }
    this.audio?.merge(level);
  }

  addMergeFx(x, y, level, now) {
    const face = FACES[level];
    const color = this.hexToRgb(face.color);
    const count = level >= 8 ? 40 : 18;
    this.burst(x, y, count, color, 120 + level * 22, 0.65, 3, 7);
    this.rings.push({
      x,
      y,
      r: face.radius * 0.35,
      maxR: face.radius * 1.8,
      life: 0.5,
      maxLife: 0.5,
      color,
      width: 3,
    });
    this.shake = Math.max(this.shake, 2.4 + level * 0.55);
    if (level >= 9) {
      this.flash = Math.max(this.flash, 0.22);
      this.flashColor = "255,240,190";
      this.confetti(x, y, 26);
    }
  }

  onSivaSpawn(body, fromMerge) {
    const now = performance.now();
    const level = body.plugin.face.level;
    this.audio?.sivaSpawn();
    if (now - this.lastVoiceAt > 1600) {
      this.lastVoiceAt = now;
      this.audio?.playVoice({ chance: level === 8 ? 1 : 0.82 });
    }
    this.rings.push({
      x: body.position.x,
      y: body.position.y,
      r: body.circleRadius * 0.5,
      maxR: body.circleRadius * 2.6,
      life: 0.95,
      maxLife: 0.95,
      color: level === 8 ? "255,77,77" : "167,139,250",
      width: 4,
    });
    this.burst(
      body.position.x,
      body.position.y,
      18,
      level === 8 ? "255,77,77" : "167,139,250",
      90,
      0.75,
      2,
      5,
    );
  }

  onRageSpawn(body) {
    const now = performance.now();
    body.plugin.face.nextBlast = now + 1400;
    if (now - this.lastVoiceAt > 1600) {
      this.lastVoiceAt = now;
      this.audio?.playVoice({ chance: 1 });
    }
    this.audio?.sivaSpawn();
    this.callbacks.onEvent?.({
      type: "rage",
      title: "siva・暴、降臨",
      sub: "物理演算が制御不能",
    });
    this.flash = Math.max(this.flash, 0.18);
    this.flashColor = "255,70,70";
    this.shake = Math.max(this.shake, 8);
  }

  rageBlastAt(x, y, power = 1, announce = false) {
    if (this.over) return;
    const maxDist = 300;
    const bodies = Composite.allBodies(this.world).filter((b) => b.label === "face");
    for (const b of bodies) {
      const dx = b.position.x - x;
      const dy = b.position.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > maxDist) continue;
      const falloff = 1 - d / maxDist;
      const nx = dx / d;
      const ny = dy / d;
      const kick = (3 + 15 * falloff) * power;
      Body.setVelocity(b, {
        x: clamp(b.velocity.x + nx * kick, -26, 26),
        y: clamp(b.velocity.y + ny * kick - 1.4 * falloff, -26, 26),
      });
      Body.setAngularVelocity(b, b.angularVelocity + (Math.random() - 0.5) * 0.5 * power);
    }
    const count = Math.round(38 * Math.min(2, power));
    this.burst(x, y, count, "255,140,70", 190 * Math.min(1.6, power), 0.55, 3, 9);
    this.burst(x, y, Math.round(count * 0.4), "255,230,160", 130, 0.9, 2, 6);
    this.rings.push({ x, y, r: 12, maxR: 290 * Math.min(1.4, power), life: 0.65, maxLife: 0.65, color: "255,90,60", width: 7 });
    this.rings.push({ x, y, r: 8, maxR: 190, life: 0.9, maxLife: 0.9, color: "255,230,170", width: 3 });
    this.flash = Math.max(this.flash, 0.34 * Math.min(1.3, power));
    this.flashColor = "255,100,70";
    this.shake = Math.max(this.shake, 16 * Math.min(1.4, power));
    this.audio?.explosion(Math.min(1.5, power));
    if (announce) {
      this.callbacks.onEvent?.({
        type: "explosion",
        title: "大爆発",
        sub: "周囲の顔面を巻き込んだ",
      });
    }
  }

  triggerBigMonk(body, now) {
    this.slowUntil = now + 1050;
    this.timeScale = 0.28;
    this.flash = 1;
    this.flashColor = "255,248,210";
    this.shake = 30;
    this.bigMonkUntil = now + 7000;
    this.bigMonkCenter = { x: body.position.x, y: body.position.y };
    this.rings.push({
      x: body.position.x,
      y: body.position.y,
      r: 30,
      maxR: 640,
      life: 1.5,
      maxLife: 1.5,
      color: "255,225,130",
      width: 9,
    });
    this.rings.push({
      x: body.position.x,
      y: body.position.y,
      r: 10,
      maxR: 400,
      life: 1.1,
      maxLife: 1.1,
      color: "255,255,255",
      width: 5,
    });
    this.burst(body.position.x, body.position.y, 90, "255,215,100", 280, 1.4, 3, 8);
    this.confetti(body.position.x, body.position.y, 70, true);
    this.audio?.bigMonk();
    this.callbacks.onEvent?.({
      type: "bigmonk",
      title: "大坊主、降臨",
      sub: "最終進化 — ド派手に決まった",
    });
  }

  ascendBigMonks(x, y, now) {
    this.addScore(FINAL_MERGE_POINTS, now, x, y, 10);
    this.flash = 1;
    this.flashColor = "255,255,255";
    this.shake = 34;
    this.bigMonkUntil = now + 7500;
    this.bigMonkCenter = { x, y };
    this.slowUntil = now + 1200;
    this.timeScale = 0.22;
    this.rings.push({ x, y, r: 10, maxR: 760, life: 1.8, maxLife: 1.8, color: "255,255,255", width: 12 });
    this.rings.push({ x, y, r: 20, maxR: 520, life: 1.3, maxLife: 1.3, color: "255,215,120", width: 8 });
    this.burst(x, y, 150, "255,255,255", 360, 1.8, 3, 10);
    this.confetti(x, y, 120, true);
    this.audio?.bigMonk();
    this.callbacks.onEvent?.({
      type: "ascend",
      title: "大坊主、成仏",
      sub: `+${FINAL_MERGE_POINTS.toLocaleString("ja-JP")} 点`,
    });
  }

  dropAt(x) {
    if (!this.running || this.over || this.paused) return false;
    const now = performance.now();
    if (now - this.lastDrop < 430) return false;
    const level = this.current;
    const radius = FACES[level].radius;
    const px = clamp(x, WORLD.left + radius + 1, WORLD.right - radius - 1);
    this.createFace(level, px, WORLD.dropY, { vy: 0.4 });
    this.lastDrop = now;
    this.current = this.queue.shift();
    this.queue.push(this.randomDrop());
    this.audio?.drop();
    this.rings.push({
      x: px,
      y: WORLD.dropY,
      r: radius * 0.3,
      maxR: radius * 1.5,
      life: 0.35,
      maxLife: 0.35,
      color: "255,255,255",
      width: 2,
    });
    this.emitQueue();
    this.callbacks.onDrop?.();
    return true;
  }

  updateSpecials(now, dt) {
    if (this.over) return;
    const bodies = Composite.allBodies(this.world).filter((b) => b.label === "face");
    for (const body of bodies) {
      const f = body.plugin.face;
      if (!f) continue;
      if (f.level === 7 || f.level === 8) {
        const interval = f.level === 8 ? 60 : 90;
        if (now - f.lastJitter > interval) {
          f.lastJitter = now;
          const power = f.level === 8 ? 1.6 : 1.0;

          // siva自身の微振動
          Body.applyForce(body, body.position, {
            x: (Math.random() - 0.5) * 0.0018 * power,
            y: (Math.random() - 0.5) * 0.0012 * power,
          });
          Body.setAngularVelocity(body, body.angularVelocity + (Math.random() - 0.5) * 0.007 * power);

          // 接触・近傍の他の顔面オブジェクトへ振動を伝播
          const sivaR = body.circleRadius;
          const effectDist = sivaR + (f.level === 8 ? 130 : 85);
          for (const other of bodies) {
            if (other === body) continue;
            const dx = other.position.x - body.position.x;
            const dy = other.position.y - body.position.y;
            const dist = Math.hypot(dx, dy) || 1;
            const touchDist = sivaR + other.circleRadius;

            if (dist < touchDist + 16) {
              // 接触中：触れている他の顔をリアルに揺らし、上に少し浮かせて隙間に落とす
              const intensity = (1 - Math.max(0, dist - touchDist) / 16) * power;
              Body.applyForce(other, other.position, {
                x: (Math.random() - 0.5) * 0.0019 * intensity,
                y: -0.0009 * intensity + (Math.random() - 0.5) * 0.0011 * intensity,
              });
              Body.setAngularVelocity(other, other.angularVelocity + (Math.random() - 0.5) * 0.009 * intensity);
            } else if (dist < effectDist) {
              // 近傍：余波の微振動
              const falloff = (1 - dist / effectDist) * power;
              Body.applyForce(other, other.position, {
                x: (Math.random() - 0.5) * 0.0007 * falloff,
                y: (Math.random() - 0.5) * 0.0005 * falloff,
              });
            }
          }
        }

        // siva・暴の爆発は1回だけ実行
        if (f.level === 8 && f.blastCount === 0 && now >= f.nextBlast) {
          f.lastBlastAt = now;
          f.blastCount = 1;
          this.rageBlastAt(body.position.x, body.position.y, 1.2, true);
        }
      }
    }

    if (this.combo > 1 && now - this.lastMergeAt > 1650) {
      this.combo = 1;
      this.emitStats();
    }
  }

  checkDanger(now) {
    if (this.over) return;
    let danger = false;
    for (const body of Composite.allBodies(this.world)) {
      if (body.label !== "face") continue;
      const f = body.plugin.face;
      if (!f || now - f.born < 1800) {
        if (f) f.overSince = 0;
        continue;
      }
      const top = body.position.y - FACES[f.level].radius;
      const speed = body.speed + Math.abs(body.angularVelocity) * 12;
      if (top < WORLD.dangerY && speed < 1.6) {
        danger = true;
        if (!f.overSince) f.overSince = now;
        if (now - f.overSince > 1700) {
          this.triggerGameOver(now);
          return;
        }
      } else {
        f.overSince = 0;
      }
    }
    this.danger = danger;
  }

  triggerGameOver(now) {
    if (this.over) return;
    this.over = true;
    this.overAt = now;
    this.timeScale = 0.32;
    this.slowUntil = now + 700;
    this.aiming = false;
    this.shake = Math.max(this.shake, 14);
    this.flash = Math.max(this.flash, 0.4);
    this.flashColor = "255,80,110";
    this.audio?.gameOver();
    this.callbacks.onEvent?.({
      type: "gameover",
      title: "顔面崩壊",
      sub: "限界まで積み上がった",
    });
    setTimeout(() => {
      if (this.overNotified) return;
      this.overNotified = true;
      this.callbacks.onGameOver?.(this.getStats());
    }, 900);
  }

  triggerSlowMotion(now) {
    if (this.slowUntil && now > this.slowUntil) {
      this.timeScale = 1;
      this.slowUntil = 0;
    }
  }

  updateEffects(dt) {
    const sec = dt / 1000;
    this.shake *= Math.pow(0.0025, sec);
    if (this.shake < 0.1) this.shake = 0;
    this.flash = Math.max(0, this.flash - sec * 2.6);
    if (this.bigMonkUntil && performance.now() > this.bigMonkUntil) {
      this.bigMonkUntil = 0;
      this.bigMonkCenter = null;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= sec;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * sec;
      p.vx *= Math.pow(0.14, sec);
      p.vy *= Math.pow(0.35, sec);
      p.x += p.vx * sec;
      p.y += p.vy * sec;
      p.rot += p.spin * sec;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= sec;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.r = r.maxR * (1 - Math.pow(1 - t, 3));
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= sec;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * sec;
      t.vy *= Math.pow(0.2, sec);
    }
  }

  loop(now) {
    if (!this.running) return;
    const rawDt = Math.min(48, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.triggerSlowMotion(now);
    const scaled = rawDt * this.timeScale;
    this.acc += scaled;
    let steps = 0;
    while (this.acc >= FIXED_STEP && steps < 4 && !this.paused) {
      Engine.update(this.engine, FIXED_STEP);
      this.checkProximityMerges();
      this.processMerges(now);
      this.updateSpecials(now, FIXED_STEP);
      this.checkDanger(now);
      this.acc -= FIXED_STEP;
      steps += 1;
    }
    if (steps === 4) this.acc = 0;
    if (this.over && this.overAt && now - this.overAt > 750) this.paused = true;
    this.updateEffects(rawDt);
    this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  draw(now) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.save();
    if (this.shake > 0.2) {
      const s = this.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    this.drawBackground(ctx, now);
    this.drawBigMonkRays(ctx, now);
    this.drawRings(ctx, false);
    this.drawAim(ctx, now);
    this.drawBodies(ctx, now);
    this.drawParticles(ctx);
    this.drawRings(ctx, true);
    this.drawTexts(ctx);
    ctx.restore();
    this.drawOverlay(ctx, now);
  }

  drawBackground(ctx, now) {
    const { W, H } = this;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#151128");
    g.addColorStop(0.55, "#0d0b1b");
    g.addColorStop(1, "#120b17");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // warm glow at the bottom
    const glow = ctx.createRadialGradient(W / 2, H - 60, 20, W / 2, H - 60, 330);
    glow.addColorStop(0, "rgba(255,77,141,0.17)");
    glow.addColorStop(0.5, "rgba(139,92,246,0.07)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // dot grid inside the jar
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (let y = 168; y < WORLD.floor; y += 30) {
      for (let x = WORLD.left + 18; x < WORLD.right; x += 30) {
        ctx.beginPath();
        ctx.arc(x, y, 1.1, 0, TAU);
        ctx.fill();
      }
    }

    // side rails
    const railGrad = ctx.createLinearGradient(WORLD.left, 0, WORLD.left + 8, 0);
    railGrad.addColorStop(0, "rgba(255,255,255,0.24)");
    railGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = railGrad;
    ctx.fillRect(WORLD.left, 0, 6, H);
    const railGrad2 = ctx.createLinearGradient(WORLD.right, 0, WORLD.right - 8, 0);
    railGrad2.addColorStop(0, "rgba(255,255,255,0.18)");
    railGrad2.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = railGrad2;
    ctx.fillRect(WORLD.right - 6, 0, 6, H);

    // floor
    const floorGrad = ctx.createLinearGradient(0, WORLD.floor - 8, 0, H);
    floorGrad.addColorStop(0, "rgba(255,255,255,0.16)");
    floorGrad.addColorStop(1, "rgba(255,255,255,0.02)");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, WORLD.floor, W, H - WORLD.floor);
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(WORLD.left, WORLD.floor + 0.5);
    ctx.lineTo(WORLD.right, WORLD.floor + 0.5);
    ctx.stroke();

    // danger line
    const pulse = this.danger ? 0.55 + Math.sin(now * 0.012) * 0.35 : 0.22;
    ctx.save();
    ctx.setLineDash([7, 8]);
    ctx.lineWidth = this.danger ? 2.2 : 1.2;
    ctx.strokeStyle = `rgba(255,72,110,${pulse})`;
    ctx.beginPath();
    ctx.moveTo(WORLD.left + 8, WORLD.dangerY);
    ctx.lineTo(WORLD.right - 8, WORLD.dangerY);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.font = "700 9px Outfit, sans-serif";
    ctx.fillStyle = `rgba(255,110,140,${0.4 + pulse * 0.5})`;
    ctx.textAlign = "right";
    ctx.fillText("DANGER LINE", WORLD.right - 12, WORLD.dangerY - 7);
    ctx.restore();

    // top glass shine
    const shine = ctx.createLinearGradient(0, 0, W, 0);
    shine.addColorStop(0, "rgba(255,255,255,0)");
    shine.addColorStop(0.5, "rgba(255,255,255,0.05)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, W, 3);
  }

  drawAim(ctx, now) {
    if (this.over || this.paused || !this.running) return;
    const level = this.current;
    const face = FACES[level];
    const radius = face.radius;
    const x = clamp(this.aimX, WORLD.left + radius + 2, WORLD.right - radius - 2);
    ctx.save();
    ctx.setLineDash([4, 8]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.moveTo(x, WORLD.dropY + radius);
    ctx.lineTo(x, WORLD.floor - 2);
    ctx.stroke();
    ctx.restore();

    const bob = Math.sin(now * 0.004) * 2;
    ctx.save();
    ctx.globalAlpha = 0.9;
    this.drawFaceToken(ctx, this.images[level], x, WORLD.dropY + bob, radius, 0, level, now, 0, 0, false);
    ctx.restore();
  }

  drawBodies(ctx, now) {
    for (const body of Composite.allBodies(this.world)) {
      if (body.label !== "face") continue;
      const f = body.plugin.face;
      if (!f) continue;
      // Faces tilt naturally with physics roll (gentle damping for readability)
      let angle = clamp(body.angle * 0.65, -1.2, 1.2);
      if (f.level >= 9) angle = clamp(body.angle * 0.35, -0.6, 0.6);
      let jx = 0;
      let jy = 0;
      let extraRot = 0;
      if (f.level === 7) {
        jx = Math.sin(now * 0.057 + f.seed) * 1.8;
        jy = Math.cos(now * 0.049 + f.seed * 1.7) * 1.5;
        extraRot = Math.sin(now * 0.06 + f.seed) * 0.018;
      } else if (f.level === 8) {
        jx = (Math.random() - 0.5) * 2.4;
        jy = (Math.random() - 0.5) * 2.2;
        extraRot = (Math.random() - 0.5) * 0.02;
      }
      this.drawFaceToken(
        ctx,
        this.images[f.level],
        body.position.x + jx,
        body.position.y + jy,
        FACES[f.level].radius,
        angle + extraRot,
        f.level,
        now,
        f.seed,
        0,
        true,
      );
    }
  }

  drawFaceToken(ctx, img, x, y, radius, angle, level, now, seed, alpha, aura) {
    if (!img) return;
    const face = FACES[level];
    const r = radius;
    ctx.save();
    ctx.translate(x, y);

    if (aura) {
      if (level === 7) {
        const a = 0.2 + Math.sin(now * 0.006 + seed) * 0.08;
        const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.6);
        grad.addColorStop(0, `rgba(167,139,250,${a * 0.3})`);
        grad.addColorStop(0.6, `rgba(167,139,250,${a * 0.15})`);
        grad.addColorStop(1, "rgba(167,139,250,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, 0, TAU);
        ctx.fill();
      } else if (level === 8) {
        const a = 0.28 + Math.random() * 0.12;
        const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.7);
        grad.addColorStop(0, `rgba(255,60,60,${a * 0.3})`);
        grad.addColorStop(0.6, `rgba(255,60,60,${a * 0.15})`);
        grad.addColorStop(1, "rgba(255,60,60,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.7, 0, TAU);
        ctx.fill();
      } else if (level >= 9) {
        const a = level === 10 ? 0.35 : 0.2;
        const grad = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.6);
        grad.addColorStop(0, `rgba(255,220,120,${a * 0.3})`);
        grad.addColorStop(0.6, `rgba(255,210,94,${a * 0.12})`);
        grad.addColorStop(1, "rgba(255,210,94,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, 0, TAU);
        ctx.fill();
      }
    }

    ctx.rotate(angle);

    // Head-shaped cutout sticker with contour border.
    // Scale up so visible head boundary matches the circular physics collision radius.
    const drawSize = r * 2 * (512 / 460);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.48)";
    ctx.shadowBlur = Math.max(8, r * 0.22);
    ctx.shadowOffsetY = Math.max(2, r * 0.06);
    ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    if (level === 8) {
      this.drawLightning(ctx, r, now, seed);
    }
    ctx.restore();
  }

  drawLightning(ctx, r, now, seed) {
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const a = now * 0.004 + seed + (i * TAU) / 3;
      const x1 = Math.cos(a) * (r + 3);
      const y1 = Math.sin(a) * (r + 3);
      const x2 = Math.cos(a) * (r + 16);
      const y2 = Math.sin(a) * (r + 16);
      ctx.strokeStyle = `rgba(255,220,120,${0.4 + Math.random() * 0.5})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * 7;
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * 7;
      ctx.lineTo(mx, my);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBigMonkRays(ctx, now) {
    if (!this.bigMonkUntil || !this.bigMonkCenter) return;
    const t = 1 - (this.bigMonkUntil - now) / 7000;
    if (t < 0 || t > 1) return;
    const alpha = Math.pow(1 - t, 1.7);
    const { x, y } = this.bigMonkCenter;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 0.00022);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      ctx.save();
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(0, 0, 520, 0);
      grad.addColorStop(0, `rgba(255,220,130,${0.3 * alpha})`);
      grad.addColorStop(1, "rgba(255,220,130,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(520, -14);
      ctx.lineTo(520, 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawRings(ctx, front) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ring of this.rings) {
      const a = ring.life / ring.maxLife;
      ctx.strokeStyle = `rgba(${ring.color},${a * 0.75})`;
      ctx.lineWidth = ring.width * a + 0.5;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      if (p.shape === "confetti") continue;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    for (const p of this.particles) {
      if (p.shape !== "confetti") continue;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = `rgba(${p.color},${a})`;
      ctx.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
      ctx.restore();
    }
    ctx.restore();
  }

  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    for (const t of this.texts) {
      const a = Math.min(1, t.life / t.maxLife * 1.8);
      ctx.font = `800 ${t.size}px Outfit, "Yu Gothic UI", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(10,8,20,0.55)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = `rgba(${t.color},${a})`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawOverlay(ctx, now) {
    if (this.flash > 0.005) {
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(0.92, this.flash)})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
    // vignette + frame
    const v = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.3, this.W / 2, this.H / 2, this.H * 0.74);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, this.W - 2, this.H - 2);
  }

  burst(x, y, count, color, speed, life, minSize, maxSize) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.25 + Math.random() * 0.9);
      const l = life * (0.6 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: 620,
        size: minSize + Math.random() * (maxSize - minSize),
        color,
        life: l,
        maxLife: l,
        spin: 0,
        rot: 0,
        shape: "spark",
      });
    }
  }

  confetti(x, y, count, big = false) {
    const colors = ["255,210,94", "255,77,141", "94,231,255", "167,139,250", "255,255,255", "123,255,178"];
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (big ? 220 : 120) * (0.5 + Math.random());
      const l = 1.4 + Math.random() * 1.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        gravity: 480,
        size: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: l,
        maxLife: l,
        spin: (Math.random() - 0.5) * 14,
        rot: Math.random() * TAU,
        shape: "confetti",
      });
    }
  }

  hexToRgb(hex) {
    const h = hex.replace("#", "");
    const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
  }
}
