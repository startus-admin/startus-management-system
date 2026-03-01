-- ============================================================
-- 業務チャット機能テーブル作成
-- Supabase SQL エディタで実行してください
-- ============================================================

-- チャットチャンネル
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('group', 'self', 'dm')),
  name TEXT DEFAULT '',
  slug TEXT DEFAULT '',
  created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON chat_channels (type);
CREATE INDEX IF NOT EXISTS idx_chat_channels_slug ON chat_channels (slug);

ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_chat_channels" ON chat_channels
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- チャンネルメンバー
CREATE TABLE IF NOT EXISTS chat_channel_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (channel_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_staff ON chat_channel_members (staff_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_channel ON chat_channel_members (channel_id);

ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_chat_channel_members" ON chat_channel_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- チャットメッセージ
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'task', 'link', 'system')),
  body TEXT NOT NULL DEFAULT '',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages (sender_id);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_chat_messages" ON chat_messages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Realtime 有効化
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 事務局グループチャンネル（初期データ）
INSERT INTO chat_channels (type, name, slug) VALUES
  ('group', '事務局チャット', 'jimukyoku');
