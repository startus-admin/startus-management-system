export const SUPABASE_URL = 'https://jfsxywwufwdprqdkyxhr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmc3h5d3d1ZndkcHJxZGt5eGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTM4NjUsImV4cCI6MjA4NzUyOTg2NX0.htkbpmzoFkH204wggYTl10YEBalDIDq4gJp-W25fRRQ';

// アクセス許可メールアドレス一覧（空の場合は全Googleアカウント許可）
export const ALLOWED_EMAILS = [
  'hisashimatsui@startus-kanazawa.org',
  'hisasimatu3117@gmail.com'
];

export const APP_NAME = 'STARTUS 会員管理';

// Google Calendar API
export const GOOGLE_CALENDAR_API_KEY = 'AIzaSyDFK99ib15lvQ2sTugYQF6sXVaFqLHgXzI';
export const GOOGLE_OAUTH_CLIENT_ID = '692539813382-20e73l8vfc83sqmfgd4hom3umrorf031.apps.googleusercontent.com';

// スタッフカレンダー設定
// id: Google Calendar の「カレンダーID」（設定 > カレンダーの統合 で確認）
// name: 表示名
// color: カラーコード
export const STAFF_CALENDARS = [
  { id: 'imoto@startus-kanazawa.org',    name: '井元', color: '#4285F4' },
  { id: 'matsui@startus-kanazawa.org',   name: '松井', color: '#EA4335' },
  { id: 'matsukura@startus-kanazawa.org', name: '松倉', color: '#FBBC05' },
  { id: 'takei@startus-kanazawa.org',    name: '竹井', color: '#34A853' },
  { id: 'sakurai@startus-kanazawa.org',  name: '櫻井', color: '#8B5CF6' },
  // 共有カレンダー（かなざわ総合スポーツクラブ）
  // { id: 'xxxxx@group.calendar.google.com', name: 'かなざわ総合', color: '#F97316' },
];

// カレンダー表示時間帯
export const CALENDAR_START_HOUR = 6;
export const CALENDAR_END_HOUR = 23;

// 教室スケジュールAPI (GAS calendar_extract)
export const SCHEDULE_API_URL = 'https://script.google.com/macros/s/AKfycbzSckwINV7p82DXUaUeQNEAyRy2MoWXJfbzeYWffwnKoQZ_inJ_6lAOPZim6N-oBxqF9g/exec';
