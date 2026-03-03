/**
 * Google Calendar Events API - GAS Web App
 *
 * スタッフのGoogleカレンダーからイベントを取得するAPIエンドポイント。
 * startus@startus-kanazawa.org アカウントでデプロイすること。
 *
 * ★ 事前準備:
 *   GASエディタ左側「サービス」→「Google Calendar API」を追加すること
 *
 * デプロイ手順:
 * 1. https://script.google.com で新規プロジェクト作成
 * 2. このコードを貼り付け
 * 3. 左側「サービス」→「Google Calendar API」を追加
 * 4. testDoGet を実行して権限を承認
 * 5. デプロイ → 新しいデプロイ → ウェブアプリ
 *    - 実行: 自分 (startus@startus-kanazawa.org)
 *    - アクセス: 全員
 * 6. 生成された URL をアプリ設定の「カレンダーAPI URL」に登録
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

  // スタッフメールアドレス（カンマ区切り）
  var emailsStr = params.emails || '';
  var emails = emailsStr ? emailsStr.split(',').map(function(s) { return s.trim(); }) : [];

  if (emails.length === 0) {
    return respond_({ error: 'emails parameter is required' }, params.callback);
  }

  // 当日の開始・終了（JST）
  var timeMin = dateStr + 'T00:00:00+09:00';
  var timeMax = dateStr + 'T23:59:59+09:00';

  var results = {};

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    try {
      // Calendar Advanced Service (Calendar API v3) を使用
      // 共有されていれば購読不要でアクセス可能
      var response = Calendar.Events.list(email, {
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: 'Asia/Tokyo'
      });

      var eventList = [];
      var items = response.items || [];

      for (var j = 0; j < items.length; j++) {
        var ev = items[j];
        var isAllDay = !!ev.start.date; // 終日イベントは date、時間指定は dateTime

        eventList.push({
          title: ev.summary || '(タイトルなし)',
          start: isAllDay ? ev.start.date + 'T00:00:00+09:00' : ev.start.dateTime,
          end: isAllDay ? ev.end.date + 'T00:00:00+09:00' : ev.end.dateTime,
          location: ev.location || '',
          description: ev.description || '',
          isAllDay: isAllDay,
          color: ev.colorId || ''
        });
      }

      results[email] = { events: eventList };
    } catch (err) {
      results[email] = { error: err.message, events: [] };
    }
  }

  var responseData = {
    date: dateStr,
    results: results
  };

  return respond_(responseData, params.callback);
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
 * ★ 初回実行時に権限承認ダイアログが出るので承認すること
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
