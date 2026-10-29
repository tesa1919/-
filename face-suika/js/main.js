import {
  FACES,
  RANDOM_NAMES,
  STORAGE,
  formatScore,
} from "./config.js";
import { SoundEngine } from "./audio.js";
import { Leaderboard } from "./leaderboard.js";
import { FaceSuikaGame } from "./game.js";

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  screen: "home",
  best: 0,
  lastScore: 0,
  runActive: false,
  gameOverActive: false,
  submitting: false,
  pausedForRanking: false,
  loadingRank: false,
  voicesLoaded: false,
  lastFocus: null,
  toastTimer: null,
};

const audio = new SoundEngine();
const lb = new Leaderboard();
let game = null;

const els = {
  loader: $("loader"),
  loaderBar: $("loaderBar"),
  home: $("screen-home"),
  gameScreen: $("screen-game"),
  playerName: $("playerName"),
  goName: $("goName"),
  goComment: $("goComment"),
  score: $("scoreValue"),
  best: $("bestValue"),
  heroBest: $("heroBest"),
  nextQueue: $("nextQueue"),
  comboStack: $("comboStack"),
  comboValue: $("comboValue"),
  comboPop: $("comboPop"),
  stageProgress: $("stageProgress"),
  stageCounter: $("stageCounter"),
  stageLabel: $("stageLabel"),
  eventBanner: $("eventBanner"),
  dropHint: $("dropHint"),
  rankHome: $("rankHome"),
  rankMini: $("rankMini"),
  rankFull: $("rankFull"),
  rankAfter: $("rankAfter"),
  rankHomeStatus: $("rankHomeStatus"),
  rankFullStatus: $("rankFullStatus"),
  modalRanking: $("modalRanking"),
  modalGameover: $("modalGameover"),
  finalScore: $("finalScore"),
  newBest: $("newBest"),
  resultStage: $("resultStage"),
  resultMerges: $("resultMerges"),
  resultRank: $("resultRank"),
  submitStatus: $("submitStatus"),
  toast: $("toast"),
  btnSubmitScore: $("btnSubmitScore"),
};

function levelName(level) {
  return FACES[Math.max(0, Math.min(10, Number(level) || 0))].name;
}

function levelPill(level) {
  const face = FACES[Math.max(0, Math.min(10, Number(level) || 0))];
  const pill = document.createElement("span");
  pill.className = "rank-level";
  if (level >= 9) pill.classList.add("high");
  else if (level >= 7) pill.classList.add("siva");
  pill.textContent = `Lv.${level} ${face.name}`;
  return pill;
}

function shortDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}

function timeLabel(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function rankStatusText() {
  if (lb.status === "loading") return "読み込み中…";
  if (lb.status === "error") {
    return lb.entries.length ? "オフライン表示 / 保存済みランキング" : "取得できません。通信環境を確認してください。";
  }
  if (!lb.entries.length) return "";
  return lb.lastLoaded ? `最終更新 ${timeLabel(lb.lastLoaded)} / 全${lb.entries.length}人` : "";
}

function renderRankList(container, entries, { compact = false, limit = 10 } = {}) {
  if (!container) return;
  container.replaceChildren();
  const list = entries.slice(0, limit);
  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "rank-empty";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    if (lb.status === "loading") {
      strong.textContent = "読み込み中…";
      span.textContent = "世界中の顔面スコアを集めています。";
    } else if (lb.status === "error") {
      strong.textContent = "ランキングを取得できません";
      span.textContent = "通信環境を確認して、更新してみてください。";
    } else {
      strong.textContent = "まだ記録がありません";
      span.textContent = "最初のプレイヤーになって、ランキングの頂点に立て。";
    }
    empty.append(strong, span);
    container.append(empty);
    return;
  }

  list.forEach((entry, index) => {
    const li = document.createElement("li");
    li.className = "rank-row";
    if (entry.id === lb.playerId) li.classList.add("own");

    const no = document.createElement("span");
    no.className = "rank-no";
    no.textContent = String(index + 1);

    const info = document.createElement("div");
    info.className = "rank-info";
    const name = document.createElement("div");
    name.className = "rank-name";
    name.textContent = entry.name;
    const meta = document.createElement("div");
    meta.className = "rank-meta";
    meta.textContent = compact
      ? `${levelPillText(entry.level)} ・ ${shortDate(entry.date)}`
      : `${shortDate(entry.date)}${entry.plays > 1 ? ` ・ ${entry.plays}回` : ""}`;
    info.append(name, meta);

    if (entry.comment) {
      const comment = document.createElement("div");
      comment.className = "rank-comment";
      comment.textContent = `“${entry.comment}”`;
      info.append(comment);
    }

    const score = document.createElement("span");
    score.className = "rank-score";
    score.textContent = formatScore(entry.score);
    const pt = document.createElement("small");
    pt.textContent = "pt";
    score.append(pt);

    if (compact) li.append(no, info, score);
    else li.append(no, info, levelPill(entry.level), score);
    container.append(li);
  });
}

function levelPillText(level) {
  return `Lv.${level} ${levelName(level)}`;
}

function renderAllRanks() {
  renderRankList(els.rankHome, lb.entries, { compact: true, limit: 6 });
  renderRankList(els.rankMini, lb.entries, { compact: true, limit: 5 });
  renderRankList(els.rankFull, lb.entries, { compact: false, limit: 50 });
  renderRankList(els.rankAfter, lb.entries, { compact: true, limit: 5 });
  const status = rankStatusText();
  els.rankHomeStatus.textContent = status;
  els.rankFullStatus.textContent = status;
}

function renderEvolution() {
  const track = $("evolutionTrack");
  if (!track) return;
  track.replaceChildren();
  FACES.forEach((face) => {
    const card = document.createElement("article");
    card.className = "evo-node";
    if (face.special) card.dataset.special = face.special;

    const num = document.createElement("span");
    num.className = "evo-num";
    num.textContent = String(face.level).padStart(2, "0");

    const img = document.createElement("img");
    img.src = face.file;
    img.alt = `${face.name}の顔`;
    img.loading = "lazy";

    const title = document.createElement("h3");
    title.textContent = face.name;
    const sub = document.createElement("p");
    sub.textContent = face.sub;

    const badge = document.createElement("span");
    badge.className = "evo-badge";
    badge.textContent =
      face.special === "siva"
        ? "SIVA"
        : face.special === "rage"
          ? "DANGER"
          : face.special === "monk"
            ? "MONK"
            : face.special === "bigmonk"
              ? "FINAL"
              : `STAGE ${face.level}`;

    card.append(num, img, title, sub, badge);
    track.append(card);
  });
}

function renderStageProgress(maxLevel) {
  if (!els.stageProgress) return;
  if (!els.stageProgress.children.length) {
    FACES.forEach((face) => {
      const dot = document.createElement("span");
      dot.className = "stage-dot";
      if (face.special) dot.classList.add("special");
      dot.title = `${face.level}: ${face.name}`;
      const img = document.createElement("img");
      img.src = face.file;
      img.alt = "";
      dot.append(img);
      els.stageProgress.append(dot);
    });
  }
  [...els.stageProgress.children].forEach((dot, i) => {
    dot.classList.toggle("reached", i <= maxLevel);
    dot.classList.toggle("current", i === maxLevel);
  });
  els.stageCounter.textContent = `${maxLevel} / 10`;
  if (maxLevel >= 10) els.stageLabel.textContent = "大坊主、降臨。顔面の頂点に到達。";
  else if (maxLevel > 0) els.stageLabel.textContent = `現在 ${maxLevel}: ${levelName(maxLevel)} まで到達`;
  else els.stageLabel.textContent = "ピンクから始めよう";
}

function renderNext({ next }) {
  if (!els.nextQueue) return;
  els.nextQueue.replaceChildren();
  next.forEach((level, i) => {
    const face = FACES[level];
    const item = document.createElement("div");
    item.className = "next-item";
    const img = document.createElement("img");
    img.className = "next-face";
    img.src = face.file;
    img.alt = face.name;
    const name = document.createElement("span");
    name.className = "next-name";
    name.textContent = face.name;
    item.append(img, name);
    els.nextQueue.append(item);
  });
}

function renderCombo(combo) {
  const level = Math.max(1, Math.min(5, combo || 1));
  els.comboValue.textContent = `×${level}`;
  [...els.comboStack.children].forEach((bar, i) => bar.classList.toggle("on", i < level - 1));
}

function bumpScore() {
  els.score.classList.remove("bump");
  void els.score.offsetWidth;
  els.score.classList.add("bump");
  clearTimeout(bumpScore.timer);
  bumpScore.timer = setTimeout(() => els.score.classList.remove("bump"), 180);
}

function onStats(stats) {
  els.score.textContent = formatScore(stats.score);
  if (stats.score !== state.lastScore) {
    state.lastScore = stats.score;
    bumpScore();
  }
  const shownBest = Math.max(state.best, stats.score);
  els.best.textContent = formatScore(shownBest);
  els.heroBest.textContent = formatScore(Math.max(state.best, stats.score));
  renderCombo(stats.combo);
  renderStageProgress(stats.maxLevel);
}

function showEvent(event) {
  const { type, title, sub } = event;
  els.eventBanner.dataset.type = type || "info";
  els.eventBanner.replaceChildren();
  const strong = document.createElement("span");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = sub || "";
  els.eventBanner.append(strong, small);
  els.eventBanner.classList.remove("show");
  void els.eventBanner.offsetWidth;
  els.eventBanner.classList.add("show");
  clearTimeout(showEvent.timer);
  const hold = type === "bigmonk" || type === "ascend" ? 3800 : 2500;
  showEvent.timer = setTimeout(() => {
    els.eventBanner.classList.remove("show");
  }, hold);
}

function showCombo(combo) {
  if (combo < 2) return;
  els.comboPop.textContent = `COMBO ×${combo}`;
  els.comboPop.classList.remove("show");
  void els.comboPop.offsetWidth;
  els.comboPop.classList.add("show");
}

function toast(text, ms = 2400) {
  els.toast.textContent = text;
  els.toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), ms);
}

function updateSoundButtons() {
  $$("[data-sound-toggle]").forEach((btn) => {
    const icon = btn.querySelector(".icon");
    if (icon) icon.textContent = audio.muted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", String(audio.muted));
    btn.setAttribute("aria-label", audio.muted ? "音をオンにする" : "音をオフにする");
  });
}

async function ensureAudio() {
  await audio.unlock();
  if (!state.voicesLoaded) {
    state.voicesLoaded = true;
    audio
      .loadVoices([1, 2, 3, 4].map((i) => `assets/audio/voice${i}.mp3`))
      .catch(() => {});
    audio
      .loadBigMonkVoice("assets/audio/bigmonk.mp3")
      .catch(() => {});
    audio
      .loadMonkVoices(["assets/audio/monk1.mp3", "assets/audio/monk2.mp3"])
      .catch(() => {});
  }
}

function showScreen(name) {
  state.screen = name;
  const playing = name === "game";
  els.home.classList.toggle("active", !playing);
  els.home.setAttribute("aria-hidden", String(playing));
  els.gameScreen.classList.toggle("active", playing);
  els.gameScreen.setAttribute("aria-hidden", String(!playing));
  document.body.classList.toggle("is-playing", playing);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function startGame() {
  if (!game) return;
  state.runActive = true;
  state.gameOverActive = false;
  state.submitting = false;
  state.pausedForRanking = false;
  state.lastScore = 0;
  state.best = lb.getLocalBest().score;
  els.score.textContent = "0";
  els.best.textContent = formatScore(state.best);
  els.heroBest.textContent = formatScore(state.best);
  els.stageProgress.replaceChildren();
  els.dropHint.classList.remove("hide");
  els.eventBanner.classList.remove("show");
  els.comboPop.classList.remove("show");
  closeModal(els.modalGameover);
  closeModal(els.modalRanking);
  showScreen("game");
  renderCombo(1);
  renderStageProgress(0);
  ensureAudio().then(() => {
    if (state.runActive && state.screen === "game") audio.startBgm();
  });
  game.start();
  els.score.textContent = "0";
}

function handleGameOver(stats) {
  if (!state.runActive || state.screen !== "game") return;
  state.gameOverActive = true;
  audio.stopBgm();

  const prevBest = lb.getLocalBest().score;
  const isNewBest = stats.score > prevBest;
  lb.setLocalBest(stats.score, stats.maxLevel);
  state.best = Math.max(prevBest, stats.score);
  els.best.textContent = formatScore(state.best);
  els.heroBest.textContent = formatScore(state.best);

  els.finalScore.textContent = formatScore(stats.score);
  els.finalScore.append(document.createElement("small"));
  els.finalScore.querySelector("small").textContent = " pt";
  els.newBest.hidden = !isNewBest;
  els.resultStage.textContent = `Lv.${stats.maxLevel} ${levelName(stats.maxLevel)}`;
  els.resultMerges.textContent = formatScore(stats.merges);
  els.resultRank.textContent = "—";
  els.submitStatus.textContent = "";
  els.goName.value = lb.getName();
  if (els.goComment) els.goComment.value = lb.getComment();
  renderRankList(els.rankAfter, lb.entries, { compact: true, limit: 5 });
  openModal(els.modalGameover);
  setTimeout(() => els.btnSubmitScore.focus({ preventScroll: true }), 60);

  if (stats.score > 0) {
    const runAtOpen = state.runActive;
    setTimeout(() => {
      if (runAtOpen && state.gameOverActive) {
        submitScore(els.goName.value || lb.getName(), els.goComment?.value || lb.getComment(), true);
      }
    }, 320);
  } else {
    els.submitStatus.textContent = "0点はランキング対象外。もう一回、顔面を重ねよう。";
  }
  if (isNewBest) {
    audio.newBest();
    setTimeout(() => toast("自己ベスト更新。ランキングに送信中…"), 500);
  }
}

async function submitScore(name, commentOrAuto = false, automatic = false) {
  if (typeof commentOrAuto === "boolean") {
    automatic = commentOrAuto;
    commentOrAuto = undefined;
  }
  if (!state.gameOverActive || state.submitting) return;
  const score = Number(els.finalScore.textContent.replace(/[^\d]/g, "")) || 0;
  const maxLevel = Number((els.resultStage.textContent.match(/Lv\.(\d+)/) || [])[1] || 0);
  if (score <= 0) {
    els.submitStatus.textContent = "0点はランキング対象外です。";
    return;
  }
  state.submitting = true;
  els.btnSubmitScore.disabled = true;
  const cleanName = lb.setName(name || lb.getName());
  const cleanComment = lb.setComment(commentOrAuto !== undefined ? commentOrAuto : (els.goComment?.value ?? lb.getComment()));
  els.goName.value = cleanName;
  els.playerName.value = cleanName;
  if (els.goComment) els.goComment.value = cleanComment;
  if (els.playerComment) els.playerComment.value = cleanComment;
  els.submitStatus.textContent = automatic ? "スコアを送信中…" : "名前とコメントを更新して送信中…";
  try {
    const res = await lb.submit({ name: cleanName, comment: cleanComment, score, level: maxLevel });
    if (res.skipped) {
      els.submitStatus.textContent = "0点はランキング対象外です。";
    } else if (res.offline) {
      els.submitStatus.textContent =
        "オフライン保存しました。次回オンライン時に自動送信します。";
      els.resultRank.textContent = res.rank ? `${res.rank}位` : "—";
      toast("オフライン保存。次回オンライン時に送信します。");
    } else {
      els.resultRank.textContent = res.rank ? `${res.rank}位` : "—";
      if (res.isBest === false) {
        els.submitStatus.textContent = `登録済み。自己ベストは ${formatScore(res.best?.score || score)} pt です。`;
      } else {
        els.submitStatus.textContent = `登録しました。現在 ${res.rank || "—"}位 / 全${res.total}人。`;
      }
      toast(automatic ? "スコアをランキングに登録しました" : "名前とコメントを更新しました");
      renderAllRanks();
      setTimeout(() => loadLeaderboard(true), 900);
    }
    renderAllRanks();
  } catch {
    els.submitStatus.textContent = "送信できませんでした。通信環境を確認してもう一度。";
  } finally {
    state.submitting = false;
    els.btnSubmitScore.disabled = false;
  }
}

async function loadLeaderboard(silent = false) {
  if (state.loadingRank) return;
  state.loadingRank = true;
  if (!silent) {
    els.rankHomeStatus.textContent = "更新中…";
    els.rankFullStatus.textContent = "更新中…";
  }
  try {
    await lb.load();
    renderAllRanks();
    if (!silent && lb.status === "error") toast("ランキングを取得できませんでした");
  } finally {
    state.loadingRank = false;
  }
}

function openModal(el) {
  if (!el) return;
  state.lastFocus = document.activeElement;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeModal(el) {
  if (!el || !el.classList.contains("open")) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".modal.open")) document.body.classList.remove("modal-open");
  if (state.lastFocus && typeof state.lastFocus.focus === "function") {
    try {
      state.lastFocus.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }
  state.lastFocus = null;
}

function openRanking() {
  if (state.screen === "game" && game && game.running && !game.over) {
    game.paused = true;
    state.pausedForRanking = true;
  }
  renderAllRanks();
  openModal(els.modalRanking);
  const close = els.modalRanking.querySelector("[data-close-modal]");
  close?.focus({ preventScroll: true });
}

function closeRanking() {
  closeModal(els.modalRanking);
  if (state.pausedForRanking) {
    state.pausedForRanking = false;
    if (state.screen === "game" && game && !game.over) game.paused = false;
  }
}

function goHome() {
  state.runActive = false;
  state.gameOverActive = false;
  state.pausedForRanking = false;
  audio.stopBgm();
  if (game) game.stop();
  closeModal(els.modalGameover);
  closeModal(els.modalRanking);
  showScreen("home");
  loadLeaderboard(true);
}

function confirmQuit() {
  if (!state.runActive || state.screen !== "game") {
    goHome();
    return;
  }
  const score = Number(els.score.textContent.replace(/[^\d]/g, "")) || 0;
  if (!state.gameOverActive && score > 0) {
    if (!window.confirm("ゲームをやめますか？ このスコアは保存されません。")) return;
  }
  goHome();
}

async function shareGame(score = 0) {
  const base = location.origin + location.pathname;
  const text =
    score > 0
      ? `顔面スイカで ${formatScore(score)} 点！ 坊主を2つ重ねて大坊主を降臨させろ。`
      : "顔面スイカ — 落として、重ねて、最後は大坊主。";
  const shareData = {
    title: "顔面スイカ",
    text,
    url: base,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  const copy = `${text}\n${base}`;
  try {
    await navigator.clipboard.writeText(copy);
    toast("リンクとメッセージをコピーしました");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = copy;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("リンクとメッセージをコピーしました");
    } catch {
      window.prompt("このリンクをシェアしてください", base);
    }
    ta.remove();
  }
}

function randomName() {
  const name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  els.playerName.value = name;
  els.playerName.focus();
  els.playerName.select();
}

function loadImages() {
  let done = 0;
  const total = FACES.length;
  const update = () => {
    done += 1;
    els.loaderBar.style.width = `${Math.round((done / total) * 100)}%`;
  };
  return Promise.all(
    FACES.map(
      (face) =>
        new Promise((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            update();
            resolve(img);
          };
          img.onerror = () => {
            update();
            resolve(img);
          };
          img.src = face.file;
        }),
    ),
  );
}

async function init() {
  state.best = lb.getLocalBest().score;
  const savedName = lb.getName();
  const savedComment = lb.getComment();
  els.playerName.value = savedName === "名無しの顔面" ? "" : savedName;
  els.goName.value = savedName;
  if (els.goComment) els.goComment.value = savedComment;
  els.heroBest.textContent = formatScore(state.best);
  els.best.textContent = formatScore(state.best);

  const muted = localStorage.getItem(STORAGE.muted) === "1";
  audio.muted = muted;
  updateSoundButtons();
  renderEvolution();
  renderStageProgress(0);
  renderCombo(1);
  lb.status = "loading";
  renderAllRanks();

  const images = await loadImages();
  if (!window.Matter) {
    toast("物理エンジンを読み込めませんでした");
    return;
  }

  game = new FaceSuikaGame($("gameCanvas"), images, audio, {
    onStats,
    onQueue: renderNext,
    onCombo: showCombo,
    onEvent: showEvent,
    onGameOver: handleGameOver,
    onDrop: () => els.dropHint.classList.add("hide"),
  });
  window.__faceSuika = { game, lb, audio, startGame, state, submitScore };

  setTimeout(() => {
    els.loader.classList.add("done");
  }, 220);

  loadLeaderboard(true);
  setInterval(() => {
    if (state.screen === "home" && !document.hidden) loadLeaderboard(true);
  }, 60000);
}

/* events */

$("startForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.screen === "game") return;
  const name = lb.setName(els.playerName.value || "名無しの顔面");
  els.playerName.value = name === "名無しの顔面" ? "" : name;
  ensureAudio();
  startGame();
  audio.click();
});

$("btnRandomName").addEventListener("click", randomName);
$("btnRandomName").addEventListener("click", () => audio.unlock());

$$("[data-sound-toggle]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const muted = !audio.muted;
    audio.setMuted(muted);
    localStorage.setItem(STORAGE.muted, muted ? "1" : "0");
    updateSoundButtons();
    if (!muted) {
      await ensureAudio();
      if (state.screen === "game" && state.runActive && !state.gameOverActive) audio.startBgm();
      audio.click();
    }
  });
});

$("brandHome").addEventListener("click", () => {
  if (state.screen === "game") confirmQuit();
  else window.scrollTo({ top: 0, behavior: "smooth" });
});

$("btnRankHeader").addEventListener("click", () => {
  audio.click();
  openRanking();
});
$("btnRankHome").addEventListener("click", openRanking);
$("btnRankGame").addEventListener("click", openRanking);
$("btnRankGameTop").addEventListener("click", openRanking);
$("btnRefreshHome").addEventListener("click", () => loadLeaderboard(false));
$("btnRefreshFull").addEventListener("click", () => loadLeaderboard(false));

$("btnQuit").addEventListener("click", confirmQuit);
$("btnHomeFromGo").addEventListener("click", goHome);
$("btnRetry").addEventListener("click", () => {
  ensureAudio();
  startGame();
  audio.startBgm();
});
$("btnSubmitScore").addEventListener("click", () => submitScore(els.goName.value, els.goComment?.value, false));
$("btnShareGame").addEventListener("click", () => shareGame(Number(els.score.textContent.replace(/[^\d]/g, "")) || 0));
$("btnShareScore").addEventListener("click", () => shareGame(Number(els.finalScore.textContent.replace(/[^\d]/g, "")) || 0));
$("btnShareRank").addEventListener("click", () => shareGame(state.best));

els.modalRanking.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", closeRanking);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (els.modalRanking.classList.contains("open")) closeRanking();
});

document.addEventListener("visibilitychange", () => {
  if (!game) return;
  if (document.hidden) {
    if (state.screen === "game" && !game.over) game.paused = true;
    audio.ctx?.suspend?.();
  } else {
    if (state.screen === "game" && !game.over && !els.modalRanking.classList.contains("open")) {
      game.paused = false;
    }
    audio.ctx?.resume?.();
  }
});

window.addEventListener("pagehide", () => {
  audio.stopBgm();
});

init().catch((err) => {
  console.error(err);
  els.loaderBar.style.width = "100%";
  toast("読み込み中にエラーが発生しました");
  setTimeout(() => els.loader.classList.add("done"), 500);
});
