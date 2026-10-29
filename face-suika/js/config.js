export const WORLD = {
  width: 540,
  height: 680,
  left: 20,
  right: 520,
  floor: 656,
  dangerY: 156,
  dropY: 76,
  wallThickness: 44,
};

export const FACES = [
  {
    level: 0,
    name: "ピンク",
    sub: "SNSの申し子",
    file: "assets/faces/face0.webp",
    radius: 21,
    color: "#ff77a8",
  },
  {
    level: 1,
    name: "ドアップ",
    sub: "近すぎる男",
    file: "assets/faces/face1.webp",
    radius: 28,
    color: "#ffb27a",
  },
  {
    level: 2,
    name: "紫メガネ",
    sub: "紫の反射",
    file: "assets/faces/face2.webp",
    radius: 39,
    color: "#b38cff",
  },
  {
    level: 3,
    name: "ポテチ",
    sub: "くちびるポテチ",
    file: "assets/faces/face3.webp",
    radius: 45,
    color: "#ffd166",
  },
  {
    level: 4,
    name: "クマ",
    sub: "顔、売り物",
    file: "assets/faces/face4.webp",
    radius: 57,
    color: "#ff9bbd",
  },
  {
    level: 5,
    name: "爆笑",
    sub: "限界スマイル",
    file: "assets/faces/face5.webp",
    radius: 72,
    color: "#7bffb2",
  },
  {
    level: 6,
    name: "虹色漢",
    sub: "深夜の虹",
    file: "assets/faces/face6.webp",
    radius: 83,
    color: "#6ee7ff",
  },
  {
    level: 7,
    name: "siva",
    sub: "震えるsiva",
    file: "assets/faces/face7.webp",
    radius: 102,
    color: "#a78bfa",
    special: "siva",
  },
  {
    level: 8,
    name: "siva・暴",
    sub: "物理の暴力",
    file: "assets/faces/face8.webp",
    radius: 114,
    color: "#ff4d4d",
    special: "rage",
  },
  {
    level: 9,
    name: "坊主",
    sub: "悟りの境地",
    file: "assets/faces/face9.webp",
    radius: 140,
    color: "#ffd25e",
    special: "monk",
  },
  {
    level: 10,
    name: "大坊主",
    sub: "最終進化",
    file: "assets/faces/face10.webp",
    radius: 166,
    color: "#ffe9a3",
    special: "bigmonk",
  },
];

// Points awarded when two faces of level i merge.
export const MERGE_POINTS = [2, 4, 8, 14, 22, 32, 46, 64, 90, 200];
export const FINAL_MERGE_POINTS = 5000;

export const DROP_LEVELS = [0, 1, 2, 3, 4];
export const DROP_WEIGHTS = [0.25, 0.24, 0.2, 0.17, 0.14];

export const LEADERBOARD = {
  url: "https://mantledb.sh/v2/face-suika-2026-7f3a/leaderboard",
  writeKey: "2db038bf3efc792a4ccce0f7859b1c0a6ac06fe43693b7c6e65f0c006f318fab",
  max: 100,
};

export const STORAGE = {
  name: "face_suika_name",
  comment: "face_suika_comment",
  best: "face_suika_best",
  muted: "face_suika_muted",
  playerId: "face_suika_player_id",
  pending: "face_suika_pending",
};

export const RANDOM_NAMES = [
  "名無しの顔面",
  "坊主予備軍",
  "siva信者",
  "大坊主の申し子",
  "ポテチリップ",
  "紫メガネ先輩",
  "顔面崩壊係",
  "深夜の虹",
  "クマの中の人",
  "物理の犠牲者",
  "合体請負人",
  "限界スマイル",
];

export function formatScore(n) {
  return Number(n || 0).toLocaleString("ja-JP");
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function randomUUID() {
  if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
