// sm-store.js
// スケジュール管理タブ用 データ層（CRUD + キャッシュ）
// member-manager の supabase.js を使用

import { supabase } from './supabase.js';

// --- キャッシュ ---
let scheduleCache = [];
let currentFiscalYear = '';

// --- データ取得 ---

export async function smLoadSchedules(fiscalYear) {
  currentFiscalYear = fiscalYear;

  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('fiscal_year', fiscalYear)
    .order('date', { ascending: true })
    .order('class_name', { ascending: true });

  if (error) {
    console.error('スケジュール読み込みエラー:', error);
    scheduleCache = [];
  } else {
    scheduleCache = data || [];
  }
  return scheduleCache;
}

export function smGetSchedules() {
  return scheduleCache;
}

export function smPatchCache(id, updates) {
  const item = scheduleCache.find(s => s.id === id);
  if (item) Object.assign(item, updates);
}

export function smRemoveFromCache(id) {
  const idx = scheduleCache.findIndex(s => s.id === id);
  if (idx >= 0) scheduleCache.splice(idx, 1);
}

// --- 単体CRUD ---

export async function smCreateSchedule(record) {
  const { data, error } = await supabase
    .from('schedules')
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('スケジュール作成エラー:', error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function smUpdateSchedule(id, updates) {
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('schedules')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('スケジュール更新エラー:', error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function smDeleteSchedule(id) {
  const { error } = await supabase
    .from('schedules')
    .delete()
    .eq('id', id);

  if (error) console.error('スケジュール削除エラー:', error);
  return { error };
}

// --- 一括操作 ---

export async function smBulkCreateSchedules(records) {
  const { data, error } = await supabase
    .from('schedules')
    .insert(records)
    .select();

  if (error) {
    console.error('一括作成エラー:', error);
    return { data: null, error };
  }
  return { data, error: null };
}

export async function smBulkDeleteSchedules(ids) {
  const { error } = await supabase
    .from('schedules')
    .delete()
    .in('id', ids);

  if (error) console.error('一括削除エラー:', error);
  return { error };
}

export async function smBulkUpdateStatus(ids, status) {
  const { error } = await supabase
    .from('schedules')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids);

  if (error) console.error('一括ステータス変更エラー:', error);
  return { error };
}

export async function smBulkUpdatePublish(ids, isPublished) {
  const { error } = await supabase
    .from('schedules')
    .update({ is_published: isPublished, updated_at: new Date().toISOString() })
    .in('id', ids);

  if (error) console.error('一括公開変更エラー:', error);
  return { error };
}

// --- 集計 ---

export function smGetProgressByClass(schedules) {
  const map = {};
  for (const s of schedules) {
    if (s.status === 'canceled') continue;
    if (!map[s.class_name]) {
      map[s.class_name] = { confirmed: 0, tentative: 0, total: 0 };
    }
    map[s.class_name].total++;
    if (s.status === 'confirmed') map[s.class_name].confirmed++;
    if (s.status === 'tentative') map[s.class_name].tentative++;
  }
  return map;
}
