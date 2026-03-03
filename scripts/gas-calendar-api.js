/**
 * Google Calendar Events API - GAS Web App
 *
 * スタッフのGoogleカレンダーからイベントを取得するAPIエンドポイント。
 * startus@startus-kanazawa.org アカウントでデプロイすること。
 *
 * デプロイ手順:
 * 1. https://script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行: 自分 (startus@startus-kanazawa.org)
 *    - アクセス: 全員
 * 4. 生成された URL をアプリ設定の「カレンダーAPI URL」に登録
 *
 * リクエスト例:
 *   ?date=2026-03-03&emails=imoto@startus-kanazawa.org,matsui@startus-kanazawa.org
 *
 * JSONP:
 *   ?date=2026-03-03&emails=...&callback=myFunc
 */

function doGet(e) {
  var params = e.parameter;

  // 日付パラメータ（デフォルト: 今日）
  var dateStr = params.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var targetDate = parseDate_(dateStr);

  // スタッフメールアドレス（カンマ区切り）
  var emailsStr = params.emails || '';
  var emails = emailsStr ? emailsStr.split(',').map(function(s) { return s.trim(); }) : [];

  if (emails.length === 0) {
    return respond_({ error: 'emails parameter is required' }, params.callback);
  }

  var results = {};

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    try {
      var cal = CalendarApp.getCalendarById(email);
      if (!cal) {
        results[email] = { error: 'Calendar not found or no access', events: [] };
        continue;
      }

      var events = cal.getEventsForDay(targetDate);
      var eventList = [];

      for (var j = 0; j < events.length; j++) {
        var ev = events[j];
        eventList.push({
          title: ev.getTitle(),
          start: ev.getStartTime().toISOString(),
          end: ev.getEndTime().toISOString(),
          location: ev.getLocation() || '',
          description: ev.getDescription() || '',
          isAllDay: ev.isAllDayEvent(),
          color: ev.getColor() || ''
        });
      }

      results[email] = { events: eventList };
    } catch (err) {
      results[email] = { error: err.message, events: [] };
    }
  }

  var response = {
    date: dateStr,
    results: results
  };

  return respond_(response, params.callback);
}

/**
 * 日付文字列をDateオブジェクトに変換（JST）
 */
function parseDate_(dateStr) {
  var parts = dateStr.split('-');
  var year = parseInt(parts[0], 10);
  var month = parseInt(parts[1], 10) - 1;
  var day = parseInt(parts[2], 10);
  return new Date(year, month, day);
}

/**
 * JSON または JSONP でレスポンスを返す
 */
function respond_(data, callback) {
  var json = JSON.stringify(data);

  if (callback) {
    // JSONP
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * テスト用: ログにサンプルレスポンスを出力
 */
function testDoGet() {
  var result = doGet({
    parameter: {
      date: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
      emails: 'imoto@startus-kanazawa.org,matsui@startus-kanazawa.org'
    }
  });
  Logger.log(result.getContent());
}
