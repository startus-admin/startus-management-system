// sm-gcal-stub.js
// Google カレンダー同期のスタブ実装。
// GCal 連携が不要な場合はこのファイルをそのまま使用してください。
// 実装する場合は isGCalReady() が true を返すように変更し、
// syncToGCal / deleteFromGCal を実装してください。

export function isGCalReady() {
  return false;
}

export async function syncToGCal(/* schedule */) {
  return { gcal_event_id: null, error: null };
}

export async function deleteFromGCal(/* gcalEventId */) {
  return { error: null };
}
