# 申請管理機能 仕様書

## 1. 概要

各種フォーム（入会・体験・退会・休会・復会・変更）からの申請を受け付け、
事務局スタッフが管理画面上で確認・コメント・修正・承認/却下を行う仕組み。

### 1.1 フォームの所在

| フォーム | 所在 | 認証 | 現状 |
|---------|------|------|------|
| 入会フォーム | 別サイト | 不要（公開） | 作成済み |
| 体験フォーム | 別サイト | 不要（公開） | 作成済み |
| 退会フォーム | 会員向けアプリ | アプリ側で対応 | 将来実装 |
| 休会フォーム | 会員向けアプリ | アプリ側で対応 | 将来実装 |
| 復会フォーム | 会員向けアプリ | アプリ側で対応 | 将来実装 |
| 変更フォーム | 会員向けアプリ | アプリ側で対応 | 将来実装 |

### 1.2 本仕様のスコープ

- **`applications` テーブル** — 申請データを格納する共通テーブル
- **`application_comments` テーブル** — 申請ごとのコメント（スタッフ間のやり取り）
- **管理画面の「申請」タブ** — 申請一覧の表示・検索・フィルタ
- **申請詳細画面** — 内容確認・編集・コメント・承認/却下
- **承認時の自動処理** — members テーブルへの反映
- **事務局へのメール通知** — 新規申請時の通知

### 1.3 権限

- 全スタッフが全操作可能（権限分けは将来対応）
- 既存の認証方式（Google OAuth + ALLOWED_EMAILS）をそのまま利用

---

## 2. データモデル

### 2.1 applications テーブル

```sql
CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  member_id UUID REFERENCES members(id),
  form_data JSONB NOT NULL DEFAULT '{}',
  admin_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT DEFAULT ''
);

-- updated_at 自動更新トリガー
CREATE TRIGGER set_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- インデックス
CREATE INDEX idx_applications_type ON applications(type);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_created_at ON applications(created_at DESC);
CREATE INDEX idx_applications_member_id ON applications(member_id);
```

#### カラム定義

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| type | TEXT | 申請種別（後述） |
| status | TEXT | ステータス（後述） |
| member_id | UUID | 既存会員の場合、members.id への参照。入会・体験は NULL |
| form_data | JSONB | フォーム入力内容（種別ごとに構造が異なる） |
| admin_note | TEXT | 事務局メモ（承認/却下理由など） |
| created_at | TIMESTAMPTZ | 申請日時 |
| updated_at | TIMESTAMPTZ | 最終更新日時 |
| processed_at | TIMESTAMPTZ | 承認/却下した日時 |
| processed_by | TEXT | 承認/却下したスタッフのメールアドレス |

#### type（申請種別）

| 値 | 表示名 |
|------|--------|
| `join` | 入会申請 |
| `trial` | 体験申請 |
| `withdrawal` | 退会申請 |
| `suspension` | 休会申請 |
| `reinstatement` | 復会申請 |
| `change` | 変更申請 |

#### status（ステータス）

| 値 | 表示名 | 説明 |
|------|--------|------|
| `pending` | 受付 | フォームから届いた初期状態 |
| `reviewed` | 確認済み | スタッフが内容を確認・修正した状態 |
| `approved` | 承認 | 処理完了。members テーブルに反映済み |
| `rejected` | 却下 | 却下（理由は admin_note に記録） |

ステータス遷移に制約は設けない。どのステータスからどのステータスにも変更可能。
（例: pending → approved も可、pending → reviewed → approved も可）

### 2.2 application_comments テーブル

```sql
CREATE TABLE application_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  user_name TEXT DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_app_comments_application_id ON application_comments(application_id);
CREATE INDEX idx_app_comments_created_at ON application_comments(created_at);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| application_id | UUID | 対象の申請 ID（CASCADE 削除） |
| user_email | TEXT | コメントしたスタッフのメールアドレス |
| user_name | TEXT | コメントしたスタッフの表示名 |
| body | TEXT | コメント本文 |
| created_at | TIMESTAMPTZ | コメント日時 |

### 2.3 RLS ポリシー

```sql
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON applications
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE application_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON application_comments
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

既存の members テーブルと同じ方針（認証済みユーザーのみ全操作可能）。

### 2.4 外部フォームからの INSERT 用ポリシー

入会・体験フォーム（別サイト）は認証なしで申請を送信するため、
anon ユーザーに INSERT のみ許可する。

```sql
CREATE POLICY "anon_insert" ON applications
  FOR INSERT TO anon
  WITH CHECK (type IN ('join', 'trial'));
```

---

## 3. form_data の構造（種別ごと）

### 3.1 入会申請（join）

```json
{
  "name": "山田 太郎",
  "furigana": "ヤマダ タロウ",
  "birthdate": "2016-05-10",
  "gender": "男",
  "guardian_name": "山田 花子",
  "phone": "090-1234-5678",
  "email": "yamada@example.com",
  "address": "金沢市○○町1-2-3",
  "school": "○○小学校",
  "grade": "小3",
  "desired_classes": ["Aクラス"],
  "disability_info": "ASD",
  "note": "体験に2回参加しました"
}
```

### 3.2 体験申請（trial）

```json
{
  "name": "鈴木 次郎",
  "furigana": "スズキ ジロウ",
  "birthdate": "2017-08-20",
  "guardian_name": "鈴木 美咲",
  "phone": "080-9876-5432",
  "email": "suzuki@example.com",
  "desired_date": "2026-03-15",
  "desired_classes": ["Bクラス"],
  "note": "友人の紹介で申し込みます"
}
```

### 3.3 退会申請（withdrawal）

```json
{
  "reason": "引っ越しのため",
  "withdrawal_month": "2026-04",
  "note": ""
}
```

### 3.4 休会申請（suspension）

```json
{
  "reason": "手術のため",
  "start_month": "2026-04",
  "end_month": "2026-06",
  "note": "7月から復帰予定"
}
```

### 3.5 復会申請（reinstatement）

```json
{
  "reinstatement_month": "2026-07",
  "note": ""
}
```

### 3.6 変更申請（change）

```json
{
  "change_type": "class_move",
  "current_classes": ["Aクラス"],
  "desired_classes": ["Bクラス"],
  "reason": "時間帯の都合",
  "note": ""
}
```

change_type の値:
- `class_add` — 教室追加
- `class_move` — 教室移動
- `other` — その他

---

## 4. 画面設計

### 4.1 ナビゲーション

既存のヘッダーまたはメイン画面にタブを追加し、「会員一覧」と「申請」を切り替え可能にする。

```
┌──────────────────────────────────────────┐
│ [icon] STARTUS Management System  user@.. [logout]│
├──────────────────────────────────────────┤
│ [会員一覧]  [会費]  [申請 (3)]           │  ← タブ切り替え。(3)は未処理件数
├──────────────────────────────────────────┤
│ （選択されたタブの内容）                   │
└──────────────────────────────────────────┘
```

未処理件数（pending + reviewed）をバッジで表示する。

### 4.2 申請一覧画面

```
┌──────────────────────────────────────────┐
│ 申請一覧                                  │
│                                           │
│ [🔍 名前・種別で検索...]                 │
│                                           │
│ [新しい順 ▼] [絞込] [3件]               │
│ ┌─ 絞込パネル ──────────────────────┐    │
│ │ ステータス: [受付] [確認済み]       │    │
│ │             [承認] [却下]           │    │
│ │ 種別: [入会] [体験] [退会]         │    │
│ │       [休会] [復会] [変更]         │    │
│ └────────────────────────────────────┘    │
│                                           │
│ ┌─────────────────────────────────┐      │
│ │ [入会] 山田 太郎                  │      │
│ │ 2026-02-25 14:30          [受付] →│      │
│ └─────────────────────────────────┘      │
│ ┌─────────────────────────────────┐      │
│ │ [退会] 佐藤 一郎                  │      │
│ │ 2026-02-24 10:15       [確認済み] →│      │
│ └─────────────────────────────────┘      │
│ ┌─────────────────────────────────┐      │
│ │ [体験] 鈴木 次郎                  │      │
│ │ 2026-02-23 09:00          [受付] →│      │
│ └─────────────────────────────────┘      │
│ ...                                       │
└──────────────────────────────────────────┘
```

- デフォルトフィルタ: ステータス「受付」「確認済み」のみ表示
- ソート: 新しい順（デフォルト）/ 古い順
- 検索: form_data 内の name、type で絞り込み
- リストアイテムのクリックで申請詳細モーダルを開く

### 4.3 申請一覧リストアイテムの色分け

| 種別 | バッジ色 |
|------|---------|
| 入会 | primary（青） |
| 体験 | accent（紫） |
| 退会 | danger（赤） |
| 休会 | warning（オレンジ） |
| 復会 | success（緑） |
| 変更 | gray（グレー） |

| ステータス | バッジ色 |
|-----------|---------|
| 受付 | warning（オレンジ） |
| 確認済み | primary（青） |
| 承認 | success（緑） |
| 却下 | danger（赤） |

### 4.4 申請詳細モーダル

```
┌─────────────────────────────────────┐
│ 入会申請                         [×] │
├─────────────────────────────────────┤
│ ステータス  [受付 ▼]                 │  ← セレクトで変更可能
│ 申請日時    2026-02-25 14:30         │
│─────────────────────────────────────│
│                                      │
│ ▼ 申請内容                  [編集]  │
│ ┌─────────────────────────────────┐ │
│ │ 氏名       山田 太郎             │ │
│ │ フリガナ   ヤマダ タロウ          │ │
│ │ 生年月日   2016-05-10            │ │
│ │ 性別       男                    │ │
│ │ 保護者名   山田 花子             │ │
│ │ 電話番号   090-1234-5678         │ │
│ │ メール     yamada@example.com    │ │
│ │ 住所       金沢市○○町1-2-3       │ │
│ │ 学校       ○○小学校              │ │
│ │ 学年       小3                   │ │
│ │ 希望クラス Aクラス                │ │
│ │ 障がい情報 ASD                   │ │
│ │ 備考       体験に2回参加しました  │ │
│ └─────────────────────────────────┘ │
│                                      │
│ ▼ コメント (2)                       │
│ ┌─────────────────────────────────┐ │
│ │ 田中  2/25 14:50                 │ │
│ │ この子は体験に2回来ています。     │ │
│ │ Bクラスの方が合っていると思います。│ │
│ ├─────────────────────────────────┤ │
│ │ 松井  2/25 16:00                 │ │
│ │ 了解です。Bクラスで登録します。   │ │
│ └─────────────────────────────────┘ │
│                                      │
│ [コメントを入力...          ] [送信] │
│                                      │
│ ▼ 事務局メモ                         │
│ [                                  ] │
│                                      │
├─────────────────────────────────────┤
│        [却下]    [確認済み]    [承認] │
└─────────────────────────────────────┘
```

### 4.5 申請内容の編集モーダル

申請詳細の「編集」ボタンをクリックすると、form_data の内容を編集できるフォームを表示する。
フォームの項目は申請種別（type）に応じて動的に生成する。

```
┌─────────────────────────────────────┐
│ 申請内容の編集                   [×] │
├─────────────────────────────────────┤
│ [氏名 *          山田 太郎        ] │
│ [フリガナ        ヤマダ タロウ     ] │
│ [生年月日  ] [性別 ▼              ] │
│ [保護者名        山田 花子        ] │
│ [電話番号        090-1234-5678    ] │
│ [メール          yamada@example.. ] │
│ [住所            金沢市○○町...    ] │
│ [学校    ] [学年                  ] │
│ [希望クラス      Bクラス           ] │  ← 修正後
│ [障がい情報                       ] │
│ [備考                             ] │
├─────────────────────────────────────┤
│                  [キャンセル] [保存] │
└─────────────────────────────────────┘
```

保存時に form_data を UPDATE する。

---

## 5. 機能仕様

### 5.1 申請一覧の読み込み

- ページ読み込み時（タブ切り替え時）に Supabase から全申請を取得
- デフォルトフィルタ: status が `pending` または `reviewed`
- 検索・フィルタ・ソートはクライアントサイドで実行（既存の会員一覧と同じパターン）

```javascript
const { data, error } = await supabase
  .from('applications')
  .select('*')
  .order('created_at', { ascending: false });
```

### 5.2 申請詳細の表示

- リストアイテムのクリックで申請詳細モーダルを表示
- form_data の内容を種別に応じたラベルで表示
- コメントを application_comments から取得して時系列で表示

```javascript
const { data: comments } = await supabase
  .from('application_comments')
  .select('*')
  .eq('application_id', applicationId)
  .order('created_at', { ascending: true });
```

### 5.3 form_data の表示ラベル定義

種別ごとに form_data のキーと表示ラベルの対応を定義する。

```javascript
const FORM_FIELD_LABELS = {
  join: [
    { key: 'name', label: '氏名' },
    { key: 'furigana', label: 'フリガナ' },
    { key: 'birthdate', label: '生年月日' },
    { key: 'gender', label: '性別' },
    { key: 'guardian_name', label: '保護者名' },
    { key: 'phone', label: '電話番号' },
    { key: 'email', label: 'メール' },
    { key: 'address', label: '住所' },
    { key: 'school', label: '学校' },
    { key: 'grade', label: '学年' },
    { key: 'desired_classes', label: '希望クラス' },
    { key: 'disability_info', label: '障がい情報' },
    { key: 'note', label: '備考' },
  ],
  trial: [
    { key: 'name', label: '氏名' },
    { key: 'furigana', label: 'フリガナ' },
    { key: 'birthdate', label: '生年月日' },
    { key: 'guardian_name', label: '保護者名' },
    { key: 'phone', label: '電話番号' },
    { key: 'email', label: 'メール' },
    { key: 'desired_date', label: '希望日' },
    { key: 'desired_classes', label: '希望クラス' },
    { key: 'note', label: '備考' },
  ],
  withdrawal: [
    { key: 'reason', label: '退会理由' },
    { key: 'withdrawal_month', label: '退会希望月' },
    { key: 'note', label: '備考' },
  ],
  suspension: [
    { key: 'reason', label: '休会理由' },
    { key: 'start_month', label: '休会開始月' },
    { key: 'end_month', label: '休会終了月' },
    { key: 'note', label: '備考' },
  ],
  reinstatement: [
    { key: 'reinstatement_month', label: '復会希望月' },
    { key: 'note', label: '備考' },
  ],
  change: [
    { key: 'change_type', label: '変更種別' },
    { key: 'current_classes', label: '現在のクラス' },
    { key: 'desired_classes', label: '希望クラス' },
    { key: 'reason', label: '理由' },
    { key: 'note', label: '備考' },
  ],
};
```

### 5.4 コメントの追加

- コメント入力欄に入力して「送信」ボタンでコメントを追加
- ログイン中のスタッフのメールアドレスと表示名を自動設定
- 送信後、コメント一覧を再描画

```javascript
const { error } = await supabase
  .from('application_comments')
  .insert({
    application_id: applicationId,
    user_email: currentUser.email,
    user_name: currentUser.user_metadata?.full_name || currentUser.email,
    body: commentText,
  });
```

### 5.5 ステータスの変更

- 申請詳細モーダル内のセレクトボックスまたはフッターボタンで変更
- フッターボタン:
  - **却下** — status を `rejected` に変更
  - **確認済み** — status を `reviewed` に変更
  - **承認** — status を `approved` に変更 + 承認処理（5.6 参照）
- 変更時に `processed_at`（承認/却下時のみ）と `processed_by` を記録

### 5.6 承認時の自動処理

「承認」ボタン押下時、申請種別に応じて members テーブルを自動更新する。
更新前に確認ダイアログを表示する。

#### 入会承認（join）

```
確認: 「山田 太郎」を会員として登録しますか？
```

- members テーブルに INSERT
- form_data から以下のフィールドをマッピング:

| form_data のキー | members のカラム |
|-----------------|-----------------|
| name | name |
| furigana | furigana |
| birthdate | birthdate |
| gender | gender |
| guardian_name | guardian_name |
| phone | phone |
| email | email |
| address | address |
| school | school |
| grade | grade |
| desired_classes | classes |
| disability_info | disability_info |
| note | note |

- `member_type` は `'会員'` を設定
- `status` は `'在籍'` を設定
- INSERT 後、生成された member_id を applications.member_id に記録

#### 体験承認（trial）

```
確認: 「鈴木 次郎」を体験として登録しますか？
```

- members テーブルに INSERT
- `member_type` は `'体験'` を設定
- `status` は `'在籍'` を設定
- マッピングは入会と同様（存在するフィールドのみ）

#### 退会承認（withdrawal）

```
確認: 「佐藤 一郎」のステータスを「退会」に変更しますか？
```

- members テーブルの該当レコードの `status` を `'退会'` に UPDATE

#### 休会承認（suspension）

```
確認: 「高橋 美咲」のステータスを「休会」に変更しますか？
```

- members テーブルの該当レコードの `status` を `'休会'` に UPDATE

#### 復会承認（reinstatement）

```
確認: 「高橋 美咲」のステータスを「在籍」に戻しますか？
```

- members テーブルの該当レコードの `status` を `'在籍'` に UPDATE

#### 変更承認（change）

```
確認: 「田中 健太」のクラスを [Aクラス] → [Bクラス] に変更しますか？
```

- members テーブルの該当レコードの `classes` を form_data の `desired_classes` に UPDATE
- `class_add` の場合は既存の classes に追加

### 5.7 申請内容の編集

- 申請詳細モーダルの「編集」ボタンで編集モーダルを表示
- フォーム項目は申請種別に応じて FORM_FIELD_LABELS から動的に生成
- 保存時に form_data を丸ごと UPDATE

```javascript
const { error } = await supabase
  .from('applications')
  .update({ form_data: updatedFormData })
  .eq('id', applicationId);
```

### 5.8 申請の削除

- 申請詳細モーダルに「削除」ボタンを設置（目立たない位置に）
- 確認ダイアログ表示後に DELETE
- application_comments は CASCADE で自動削除

---

## 6. メール通知

### 6.1 通知タイミング

| イベント | 通知先 | 件名例 |
|---------|-------|--------|
| 新規申請の受付 | 事務局全員 | 【STARTUS】新しい入会申請: 山田太郎 |

### 6.2 実装方式

Supabase Database Webhook + Edge Function で実装する。

```
applications に INSERT
  → Database Webhook が発火
  → Edge Function が呼ばれる
  → 事務局メンバーにメール送信
```

#### Edge Function（概要）

```typescript
// supabase/functions/notify-application/index.ts

// Webhook から受け取る payload
const { type, record } = await req.json();

// 種別の日本語ラベル
const typeLabels = {
  join: '入会', trial: '体験', withdrawal: '退会',
  suspension: '休会', reinstatement: '復会', change: '変更'
};

const typeName = typeLabels[record.type];
const applicantName = record.form_data.name || '（会員）';

// メール送信（Supabase の SMTP or 外部サービス）
await sendEmail({
  to: STAFF_EMAILS,
  subject: `【STARTUS】新しい${typeName}申請: ${applicantName}`,
  body: `
    ${typeName}申請が届きました。

    申請者: ${applicantName}
    申請日時: ${record.created_at}

    管理画面で内容を確認してください。
    ${ADMIN_URL}
  `,
});
```

### 6.3 通知先メールアドレス

config.js の `ALLOWED_EMAILS` を通知先として利用する（事務局スタッフ全員）。
または Edge Function 内に別途定義する。

---

## 7. ファイル構成（追加分）

```
member-admin/
├── js/
│   ├── applications.js    申請一覧・詳細・編集・承認処理
│   └── ...（既存ファイル）
└── ...
```

新規ファイルは `applications.js` の1ファイルのみ。
既存ファイルへの変更:

| ファイル | 変更内容 |
|---------|---------|
| index.html | タブUI追加、申請一覧の表示エリア追加 |
| style.css | 申請関連のスタイル追加 |
| app.js | タブ切り替えロジック、applications.js の初期化呼び出し |

---

## 8. 外部フォームとの連携

### 8.1 既存の入会・体験フォームからの送信

既存フォーム（別サイト）から Supabase の applications テーブルに直接 INSERT する。

```javascript
// 入会フォーム側のコード（別サイト）
const { error } = await supabase
  .from('applications')
  .insert({
    type: 'join',
    status: 'pending',
    form_data: {
      name: '...',
      furigana: '...',
      // ... フォーム入力内容
    },
  });
```

- RLS の anon_insert ポリシーにより、認証なしで INSERT 可能
- SELECT / UPDATE / DELETE は認証済みユーザーのみ

### 8.2 将来の会員向けアプリからの送信

会員向けアプリからの申請は、アプリ側の認証を通じて INSERT する。
member_id を含めて送信することで、既存会員との紐付けを行う。

```javascript
// 会員向けアプリ側のコード（将来）
const { error } = await supabase
  .from('applications')
  .insert({
    type: 'withdrawal',
    status: 'pending',
    member_id: currentMemberId,
    form_data: {
      reason: '...',
      withdrawal_month: '2026-04',
    },
  });
```

---

## 9. エラーハンドリング

| 操作 | 成功時 | 失敗時 |
|------|--------|--------|
| 申請一覧読み込み | 一覧表示 | console.error + 空配列 |
| コメント追加 | コメント欄に追加表示 | Toast「コメントの送信に失敗しました」 |
| 申請内容編集 | Toast「保存しました」 | Toast「保存に失敗しました」 |
| ステータス変更 | Toast「ステータスを更新しました」 | Toast「更新に失敗しました」 |
| 承認処理 | Toast「承認しました」+ members 更新 | Toast「承認処理に失敗しました」 |
| 申請削除 | Toast「削除しました」 | Toast「削除に失敗しました」 |

承認処理でエラーが発生した場合:
- applications の status は変更しない（ロールバック）
- エラー内容をコンソールに出力
- ユーザーに再試行を促す

---

## 10. 将来の拡張（本仕様の対象外）

- 権限管理（巡回スタッフ: 確認済みまで、入力担当: 承認可能）
- 差し戻しフロー（会員向けアプリでの再編集）
- 編集履歴の記録（誰がいつ何を変更したか）
- 保護者へのメール通知（承認/却下結果の自動送信）
- 申請データの CSV エクスポート
