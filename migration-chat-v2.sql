-- ================================================================
-- Chat V2 Migration: 編集・削除・ファイル送信対応
-- 実行: Supabase SQL Editor で1回のみ実行
-- ================================================================

-- 1. メッセージ削除フラグ
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

-- 2. メッセージ編集タイムスタンプ
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- 3. message_type に 'file' を追加
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'task', 'link', 'system', 'file'));

-- 4. Realtime UPDATE で全カラムを受け取るために REPLICA IDENTITY FULL
ALTER TABLE chat_messages REPLICA IDENTITY FULL;

-- 5. チャット添付ファイル用 Storage バケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT DO NOTHING;

-- 6. Storage ポリシー
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_attachments_read' AND tablename = 'objects') THEN
    CREATE POLICY "chat_attachments_read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-attachments');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'chat_attachments_insert' AND tablename = 'objects') THEN
    CREATE POLICY "chat_attachments_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-attachments');
  END IF;
END$$;
