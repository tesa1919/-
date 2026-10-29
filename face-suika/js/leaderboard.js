import { LEADERBOARD, STORAGE, randomUUID, clamp } from "./config.js";

const CACHE_KEY = "face_suika_rank_cache";

async function request(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function cleanName(name) {
  const s = String(name ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(s).slice(0, 12).join("");
  return chars || "名無しの顔面";
}

function cleanComment(comment) {
  const s = String(comment ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(s).slice(0, 30).join("");
}

function cleanEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const score = Math.floor(Number(raw.score));
  if (!Number.isFinite(score) || score < 0 || score > 9999999) return null;
  const level = clamp(Math.floor(Number(raw.level) || 0), 0, 10);
  const name = cleanName(raw.name);
  const comment = cleanComment(raw.comment);
  const id = String(raw.id || raw.playerId || "").slice(0, 80) || "anon-" + randomUUID();
  return {
    id,
    name,
    comment,
    score,
    level,
    date: Number(raw.date) || Date.now(),
    plays: Math.max(1, Math.min(99999, Math.floor(Number(raw.plays) || 1))),
    verified: raw.verified === true,
  };
}

function dedupe(entries) {
  const map = new Map();
  for (const e of entries) {
    const cur = map.get(e.id);
    if (!cur) {
      map.set(e.id, e);
      continue;
    }
    const winner = e.score > cur.score ? e : cur;
    map.set(e.id, {
      ...winner,
      comment: e.score >= cur.score ? (e.comment || cur.comment || "") : (cur.comment || e.comment || ""),
      plays: Math.max(cur.plays || 1, e.plays || 1),
      date: Math.max(cur.date || 0, e.date || 0),
    });
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.date - b.date);
}

export class Leaderboard {
  constructor() {
    this.entries = [];
    this.playerId = this.getPlayerId();
    this.status = "idle";
    this.lastError = null;
    this.lastLoaded = 0;
  }

  getLocalBest() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE.best) || "null");
      if (!raw) return { score: 0, level: 0, date: 0 };
      return {
        score: Math.max(0, Math.floor(Number(raw.score) || 0)),
        level: clamp(Math.floor(Number(raw.level) || 0), 0, 10),
        date: Number(raw.date) || 0,
      };
    } catch {
      return { score: 0, level: 0, date: 0 };
    }
  }

  setLocalBest(score, level) {
    const cur = this.getLocalBest();
    if (score > cur.score || (score === cur.score && level > cur.level)) {
      const next = { score, level, date: Date.now() };
      localStorage.setItem(STORAGE.best, JSON.stringify(next));
      return next;
    }
    return cur;
  }

  getPlayerId() {
    let id = localStorage.getItem(STORAGE.playerId);
    if (!id) {
      id = randomUUID();
      localStorage.setItem(STORAGE.playerId, id);
    }
    return id;
  }

  getName() {
    return localStorage.getItem(STORAGE.name) || "名無しの顔面";
  }

  setName(name) {
    const clean = cleanName(name);
    localStorage.setItem(STORAGE.name, clean);
    return clean;
  }

  getComment() {
    return localStorage.getItem(STORAGE.comment) || "";
  }

  setComment(comment) {
    const clean = cleanComment(comment);
    localStorage.setItem(STORAGE.comment, clean);
    return clean;
  }

  getRank(id) {
    const i = this.entries.findIndex((e) => e.id === id);
    return i >= 0 ? i + 1 : null;
  }

  async load() {
    this.status = "loading";
    try {
      const res = await request(LEADERBOARD.url);
      const data = await res.json();
      const raw = Array.isArray(data?.scores) ? data.scores : [];
      this.entries = dedupe(raw.map(cleanEntry).filter(Boolean)).slice(0, LEADERBOARD.max);
      this.lastLoaded = Date.now();
      this.status = "ready";
      this.lastError = null;
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ savedAt: this.lastLoaded, scores: this.entries }),
      );
      this.flushPending();
      return this.entries;
    } catch (err) {
      this.status = "error";
      this.lastError = err;
      const cached = this.readCache();
      if (cached.length) this.entries = cached;
      return this.entries;
    }
  }

  readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!Array.isArray(data?.scores)) return [];
      return dedupe(data.scores.map(cleanEntry).filter(Boolean)).slice(0, LEADERBOARD.max);
    } catch {
      return [];
    }
  }

  async submit({ name, comment, score, level }) {
    const entry = {
      id: this.playerId,
      name: cleanName(name),
      comment: cleanComment(comment !== undefined ? comment : this.getComment()),
      score: Math.max(0, Math.floor(Number(score) || 0)),
      level: clamp(Math.floor(Number(level) || 0), 0, 10),
      date: Date.now(),
      plays: 1,
    };
    if (entry.score <= 0) return { skipped: true, entry };

    try {
      const res = await request(LEADERBOARD.url);
      const data = await res.json();
      let current = dedupe((Array.isArray(data?.scores) ? data.scores : []).map(cleanEntry).filter(Boolean));
      const old = current.find((e) => e.id === entry.id);
      const isBest = !old || entry.score > old.score;
      if (isBest) {
        entry.plays = (old?.plays || 0) + 1;
        current = current.filter((e) => e.id !== entry.id);
        current.push(entry);
      } else {
        old.plays = (old.plays || 1) + 1;
        old.name = entry.name;
        if (entry.comment) old.comment = entry.comment;
        old.date = entry.date;
        entry.score = old.score;
        entry.level = old.level;
      }
      current = dedupe(current).sort((a, b) => b.score - a.score || a.date - b.date).slice(0, LEADERBOARD.max);
      await this.write(current);
      this.entries = current;
      this.lastLoaded = Date.now();
      this.status = "ready";
      this.lastError = null;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: this.lastLoaded, scores: this.entries }));
      return {
        rank: this.getRank(this.playerId),
        total: current.length,
        isBest,
        best: current.find((e) => e.id === this.playerId) || entry,
        entry,
      };
    } catch (err) {
      this.lastError = err;
      this.status = "error";
      this.queuePending(entry);
      const local = dedupe([...this.entries, entry]).sort((a, b) => b.score - a.score || a.date - b.date);
      this.entries = local;
      return {
        offline: true,
        rank: this.getRank(this.playerId),
        total: local.length,
        entry,
      };
    }
  }

  async write(scores) {
    const res = await request(LEADERBOARD.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mantle-Key": LEADERBOARD.writeKey,
      },
      body: JSON.stringify({ updatedAt: Date.now(), scores }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.success) throw new Error("leaderboard write failed");
  }

  queuePending(entry) {
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
      const filtered = Array.isArray(list) ? list.filter((e) => e && e.id !== entry.id) : [];
      filtered.push(entry);
      localStorage.setItem(STORAGE.pending, JSON.stringify(filtered.slice(-10)));
    } catch {
      /* ignore */
    }
  }

  async flushPending() {
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(STORAGE.pending) || "[]");
    } catch {
      list = [];
    }
    if (!Array.isArray(list) || !list.length) return;
    const remaining = [];
    for (const entry of list) {
      const clean = cleanEntry(entry);
      if (!clean) continue;
      try {
        const res = await this.submit(clean);
        if (res.offline) remaining.push(entry);
      } catch {
        remaining.push(entry);
      }
    }
    if (remaining.length) localStorage.setItem(STORAGE.pending, JSON.stringify(remaining));
    else localStorage.removeItem(STORAGE.pending);
  }
}
