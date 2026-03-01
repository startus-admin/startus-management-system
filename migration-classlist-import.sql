-- =============================================
-- ClassList（教室マスタ）CSV データ取り込み
-- 既存レコードは不足フィールドのみ補完
-- 新規レコードは INSERT
-- =============================================

-- UPSERT: 教室名で一致 → 空フィールドのみ補完、一致なし → 新規INSERT
-- display_order は CSV の SortOrder で常に更新

INSERT INTO classrooms (name, display_order, category, day_of_week, calendar_tag, furikae_group, is_active, target, time_slot, venue, main_coach, capacity, fee, class_code, memo)
VALUES
  ('大人のマラソン塾', 1, '陸上・マラソン', ARRAY['木'], 'otonamarathon-rikujo', '', true, '', '19:30~21:00', '', '', NULL, 3300, '', ''),
  ('陸上マラソン塾（キッズ）', 2, '陸上・マラソン', ARRAY['金'], 'marathonjyuku-k-rikujo', '', true, '', '19:00～20:00', '金沢市営陸上競技場', '', NULL, 6600, '', ''),
  ('陸上マラソン塾（ジュニア）', 3, '陸上・マラソン', ARRAY['金'], 'marathonjyuku-j-rikujo', '', true, '', '19:00～20:00', '', '', NULL, 6600, '', ''),
  ('かけっこ塾（アプローチ）', 4, '陸上・マラソン', ARRAY['水'], 'kakekojyuku-rikujo', '', true, '', '19:30~20:30', '稲置学園総合運動場（冬季：金沢星稜大学体育館）', '金沢星稜大学陸上競技部', NULL, 6600, '', ''),
  ('かけっこ塾（ホップ・ステップ・ジャンプ）', 5, '陸上・マラソン', ARRAY['水'], 'kakekojyuku-rikujo', 'rikujo', true, '', '19:30～20:30', '稲置学園総合運動場（冬季：金沢星稜大学体育館）', '金沢星稜大学陸上競技部', NULL, 6600, '', ''),
  ('ソーシャルフットボール（精神障がい者フットサル）', 7, 'サッカー・フットボール', ARRAY['木'], 'socialfootball', 'football', true, '', '17:00~18:00', 'あめるんパーク（金沢市屋内交流広場）', '', NULL, 3300, '', ''),
  ('バドミントン高尾台（ジュニア）', 8, 'バドミントン', ARRAY['土'], 'badminton-takaodai', '', true, '', '18:00~19:30', '高尾台中学校', '竹井 早葉子', NULL, 6600, '', ''),
  ('バドミントン高尾台（ビギナー）', 9, 'バドミントン', ARRAY['土'], 'badminton-takaodai', '', true, '', '19:30~21:00', '高尾台中学校', '竹井 早葉子', NULL, 6600, '', ''),
  ('バドミントン扇台', 10, 'バドミントン', ARRAY['木'], 'badminton-ougidai', '', true, '', '17:30~19:00', '扇台小学校 体育館', '竹井 早葉子', NULL, 6600, '', ''),
  ('テニス塾', 11, 'テニス', ARRAY['水'], 'tennis', '', true, '', '19:00~20:30', '金沢星稜大学サブアリーナ', '吉田 一宏', NULL, 9900, '', ''),
  ('キンボールスポーツ', 12, 'キンボールスポーツ', ARRAY['日'], 'kinballsports', '', true, '', '19:00~21:00', '高尾台中学校体育館', '田中 宏治', NULL, 4100, '', ''),
  ('親子バドミントン(日)高尾台', 13, 'バドミントン', ARRAY['日'], 'oyakobadminton', '', true, '', '19:00～20:30', '高尾台中学校', '竹井 早葉子', NULL, 6600, '', ''),
  ('陸上スポレク（キッズ）', 14, '陸上・マラソン', ARRAY['火'], 'suporeku-k-rikujo', '', true, '', '17:00~18:00', '健民スポレクプラザ多目的コート', '須田 崇', NULL, 6600, '', ''),
  ('陸上スポレク（ジュニア）', 15, '陸上・マラソン', ARRAY['火'], 'suporeku-j-rikujo', '', true, '', '18:00～19:00', '', '須田 崇', NULL, 6600, '', ''),
  ('陸上西部（キッズ）', 16, '陸上・マラソン', ARRAY['水'], 'seibu-k-rikujo', '', true, '', '17:00~18:00', '石川県西部緑地公園陸上競技場', '松井 久', NULL, 6600, '', ''),
  ('陸上西部（ジュニア）', 17, '陸上・マラソン', ARRAY['水'], 'seibu-j-rikujo', '', true, '', '18:00~19:00', '石川県西部緑地公園陸上競技場', '須田 崇', NULL, 6600, '', ''),
  ('インクルーシブ陸上', 18, '陸上・マラソン', ARRAY['月'], 'inclusive-rikujo', '', true, '', '19:30~21:00', '金沢市営陸上競技場', '', NULL, 3300, '', ''),
  ('陸上泉(木)（キッズクラス）', 19, '陸上・マラソン', ARRAY['木'], 'izumi-k-rikujo', '', true, '', '17:00~18:00', '金沢市営陸上競技場', '松井 久', NULL, 6600, '', ''),
  ('陸上泉(木)（ジュニアクラス）', 20, '陸上・マラソン', ARRAY['木'], 'izumi-j-rikujo', '', true, '', '18:00~19:00', '金沢市営陸上競技場', '山本 勝裕（やまティー）', NULL, 6600, '', ''),
  ('るぶげる親子陸上塾', 21, '陸上・マラソン', ARRAY['土','日'], 'rubugeru-rikujo', 'rikujo', true, '', '13:00~14:30', '金沢市営陸上競技場・その他', '山本 勝裕（やまティー）', NULL, 9900, '', ''),
  ('陸上中村町(月)かけっこ（キッズ）', 22, '陸上・マラソン', ARRAY['月'], 'nakamurakakeko-k-rikujo', '', true, '', '17:00~18:00', '中村町小学校', '松井 久', NULL, 6600, '', ''),
  ('陸上中村町(月)かけっこ（ジュニア）', 23, '陸上・マラソン', ARRAY['月'], 'nakamurakakeko-j-rikujo', '', true, '', '18:00~19:00', '中村町小学校', '松井 久', NULL, 6600, '', ''),
  ('陸上中村町(火)マラソン（キッズ）', 24, '陸上・マラソン', ARRAY['火'], 'nakamuramarathon-k-rikujo', '', true, '', '17:00~18:00', '中村町小学校', '松井 久', NULL, 6600, '', ''),
  ('陸上中村町(火)マラソン（ジュニア）', 25, '陸上・マラソン', ARRAY['火'], 'nakamuramarathon-j-rikujo', '', true, '', '18:00~19:00', '中村町小学校', '松井 久', NULL, 6600, '', ''),
  ('アイススケート教室', 27, 'その他', ARRAY['土'], '', 'other', true, '', '9:30~11:30', '健民スポレクプラザ アイスリンク', '石川県スケート連盟普及部指導員', NULL, 8800, '', ''),
  ('キッズバレエ', 28, 'バレエ・ダンス・チア', ARRAY['金'], 'ballet', '', true, '', '17:00~18:00', '金沢市総合体育館スタジオ', '髙島 怜美', NULL, 6600, '', ''),
  ('キッズヒップホップ', 29, 'バレエ・ダンス・チア', ARRAY['金'], 'hiphop', '', true, '', '18:00~19:00', '金沢市総合体育館スタジオ', '坂村 絵里', NULL, 6600, '', ''),
  ('キッズチアリーディング(金)泉野', 30, 'バレエ・ダンス・チア', ARRAY['金'], 'cheer-f-izumino', '', true, '', '19:00~20:00', '金沢市総合体育館スタジオ', '前 ひとみ', NULL, 6600, '', ''),
  ('キッズチアリーディング(水)米泉', 31, 'バレエ・ダンス・チア', ARRAY['水'], 'cheer-w-yonaizumi', '', true, '', '19:00~20:00', '米泉小学校体育館', '中塚 泰子', NULL, 6600, '', ''),
  ('キッズダンス', 32, 'バレエ・ダンス・チア', ARRAY['火'], 'kidsdance', 'dance', true, '', '18:00～19:00', '金沢市総合体育館スタジオ', '坂村 絵里', NULL, 6600, '', '')
ON CONFLICT (name) DO UPDATE SET
  display_order = EXCLUDED.display_order,
  category    = CASE WHEN classrooms.category IS NULL OR classrooms.category = '' THEN EXCLUDED.category ELSE classrooms.category END,
  day_of_week = CASE WHEN classrooms.day_of_week IS NULL OR classrooms.day_of_week = '{}' THEN EXCLUDED.day_of_week ELSE classrooms.day_of_week END,
  calendar_tag  = CASE WHEN classrooms.calendar_tag IS NULL OR classrooms.calendar_tag = '' THEN EXCLUDED.calendar_tag ELSE classrooms.calendar_tag END,
  furikae_group = CASE WHEN classrooms.furikae_group IS NULL OR classrooms.furikae_group = '' THEN EXCLUDED.furikae_group ELSE classrooms.furikae_group END,
  target      = CASE WHEN classrooms.target IS NULL OR classrooms.target = '' THEN EXCLUDED.target ELSE classrooms.target END,
  time_slot   = CASE WHEN classrooms.time_slot IS NULL OR classrooms.time_slot = '' THEN EXCLUDED.time_slot ELSE classrooms.time_slot END,
  venue       = CASE WHEN classrooms.venue IS NULL OR classrooms.venue = '' THEN EXCLUDED.venue ELSE classrooms.venue END,
  main_coach  = CASE WHEN classrooms.main_coach IS NULL OR classrooms.main_coach = '' THEN EXCLUDED.main_coach ELSE classrooms.main_coach END,
  capacity    = COALESCE(classrooms.capacity, EXCLUDED.capacity),
  fee         = COALESCE(classrooms.fee, EXCLUDED.fee),
  class_code  = CASE WHEN classrooms.class_code IS NULL OR classrooms.class_code = '' THEN EXCLUDED.class_code ELSE classrooms.class_code END,
  memo        = CASE WHEN classrooms.memo IS NULL OR classrooms.memo = '' THEN EXCLUDED.memo ELSE classrooms.memo END;
