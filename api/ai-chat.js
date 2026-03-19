// Vercel Serverless Function: AI Chat Proxy
// Claude API を安全にプロキシする（APIキーはVercel環境変数で管理）

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const { messages, staffName } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const systemPrompt = buildSystemPrompt(staffName || '職員');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-20), // 直近20件に制限
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // フィードバック抽出: AIの返答に [FEEDBACK] タグがあれば構造化データとして返す
    const feedback = extractFeedback(reply);
    const cleanReply = reply.replace(/\[FEEDBACK\][\s\S]*?\[\/FEEDBACK\]/g, '').trim();

    return res.status(200).json({
      reply: cleanReply,
      feedback: feedback,
    });

  } catch (err) {
    console.error('AI chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function buildSystemPrompt(staffName) {
  return `あなたは「STARTUS Sports Academy 会員管理システム」の改善アシスタントです。
職員「${staffName}」さんと会話しています。

## あなたの役割
1. 職員がアプリを使う中で感じた不具合・不満・改善要望を丁寧に聞き出す
2. 曖昧な要望は具体的に掘り下げて、何が問題なのかを明確にする
3. 十分な情報が集まったら、フィードバックを構造化してまとめる

## アプリの機能一覧（これを理解した上で質問すること）
- **会員管理**: 会員の登録・編集・削除・一覧表示・検索・CSV出力。会員にはクラス、学年、ステータス等の情報がある
- **教室管理**: 教室（クラス）の登録・編集。曜日・時間帯・会場・担当コーチ・定員等を管理
- **申請管理**: 入会・退会・休会・復会の申請を管理。ステータス管理（未対応→確認済み→承認/却下）
- **体験管理**: 体験申込の管理。希望日・希望教室・フォローアップ状態を追跡
- **月謝管理**: 月ごとの月謝の支払い状態を管理
- **スケジュール**: 週・月・年ビューで教室の開催予定を表示。Google Apps Script APIと連携
- **スタッフカレンダー**: Google Calendarと連携し、スタッフの予定を日ビューで表示
- **スタッフ管理**: スタッフの登録・編集。役割（スタッフ/指導者/事務局）
- **チャット**: 職員間のメッセージング。グループ・DM・自分メモ
- **統計**: 会員数推移・教室別在籍数等
- **アプリ設定**: アプリ名・団体名・カレンダー表示時間・スケジュールAPI等の設定

## 質問のコツ
- 「どの画面で起きましたか？」（会員一覧、申請詳細、スケジュール等）
- 「どういう操作をしたときですか？」
- 「期待した動作は何でしたか？」
- 「実際にはどうなりましたか？」
- 「スマホですか？PCですか？」
- 「頻度はどのくらいですか？（毎回/時々/一度だけ）」

## フィードバックの構造化
十分な情報が集まったと判断したら、返答の末尾に以下の形式でフィードバックを付けてください。
このタグはユーザーには見えません。管理者への報告用です。

[FEEDBACK]
category: bug または improvement または question
summary: 一行の概要
screen: 関連する画面名
details: 詳細な説明（何が問題で、どうあるべきか）
priority: low または medium または high
[/FEEDBACK]

## トーンと注意点
- フレンドリーで丁寧に
- 短めの返答（2-3文程度）で質問を投げかける
- 一度に複数の質問をしない（1つずつ聞く）
- 技術用語は避け、わかりやすい言葉で
- 要望を聞き出すことに集中し、解決策を提案しない（開発者に伝える役割）
- 日本語で会話する`;
}

function extractFeedback(text) {
  const match = text.match(/\[FEEDBACK\]([\s\S]*?)\[\/FEEDBACK\]/);
  if (!match) return null;

  const block = match[1];
  const get = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(.+?)(?:\\n|$)`));
    return m ? m[1].trim() : '';
  };

  const category = get('category');
  const summary = get('summary');
  if (!category || !summary) return null;

  return {
    category,
    summary,
    screen: get('screen'),
    details: get('details'),
    priority: get('priority') || 'medium',
  };
}
