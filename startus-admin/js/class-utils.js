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

// --- lookup ---

export function getClassroomByTag(tag) {
  if (!tag) return null;
  return getClassrooms().find(c => c.calendar_tag === tag) || null;
}