// ============================================
// 教室タグ⇔名前 変換ユーティリティ
// ============================================
// members.classes / staff.classes に格納された
// calendar_tag を日本語教室名に変換（表示用）、
// またはその逆（保存用）を行う。
//
// フォールバック: 一致しない場合は入力値をそのまま返す

import { getClassrooms } from './classroom.js';

// --- tag → name ---

export function tagToName(tag) {
  if (!tag) return '';
  const classrooms = getClassrooms();
  const found = classrooms.find(c => c.calendar_tag === tag);
  return found ? found.name : tag;
}

export function tagsToNames(tags) {
  if (!tags || !tags.length) return [];
  const classrooms = getClassrooms();
  const map = {};
  for (const c of classrooms) {
    if (c.calendar_tag) map[c.calendar_tag] = c.name;
  }
  return tags.map(t => map[t] || t);
}

// --- name → tag ---

export function nameToTag(name) {
  if (!name) return '';
  const classrooms = getClassrooms();
  const found = classrooms.find(c => c.name === name);
  return (found && found.calendar_tag) ? found.calendar_tag : name;
}

export function namesToTags(names) {
  if (!names || !names.length) return [];
  const classrooms = getClassrooms();
  const map = {};
  for (const c of classrooms) {
    if (c.name && c.calendar_tag) map[c.name] = c.calendar_tag;
  }
  return names.map(n => map[n] || n);
}

// --- sub-class ---

/** classes 配列から教室タグ以外の要素（サブクラス名）を抽出 */
export function getSubClassesFromArray(classes) {
  if (!classes || !classes.length) return [];
  const classrooms = getClassrooms();
  const tagSet = new Set(classrooms.map(c => c.calendar_tag).filter(Boolean));
  return classes.filter(c => !tagSet.has(c));
}

/** 全教室のサブクラス名を一つの Set として返す */
export function getAllKnownSubClasses() {
  const classrooms = getClassrooms();
  const subSet = new Set();
  for (const c of classrooms) {
    if (c.sub_classes && c.sub_classes.length) {
      for (const sc of c.sub_classes) subSet.add(sc);
    }
  }
  return subSet;
}

// --- fuzzy match ---

/** 2つの文字列の類似度を 0〜1 で返す（1=完全一致） */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const la = a.length, lb = b.length;
  const maxLen = Math.max(la, lb);
  if (maxLen === 0) return 1;

  const prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= lb; j++) {
      const old = prev[j];
      prev[j] = a[i - 1] === b[j - 1]
        ? corner
        : Math.min(corner, prev[j - 1], prev[j]) + 1;
      corner = old;
    }
  }
  return (maxLen - prev[lb]) / maxLen;
}

/** 名前に最も近い教室を返す（類似度 0.6 以上） */
export function findClosestClassroom(name) {
  if (!name) return null;
  const classrooms = getClassrooms();
  let best = null;
  let bestScore = 0;
  for (const c of classrooms) {
    const score = levenshteinSimilarity(name, c.name);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore >= 0.6 ? { classroom: best, score: bestScore } : null;
}

// --- lookup ---

export function getClassroomByTag(tag) {
  if (!tag) return null;
  return getClassrooms().find(c => c.calendar_tag === tag) || null;
}