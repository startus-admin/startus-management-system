-- ============================================================
-- 体験・入会ダミーデータ（転換率テスト用）
-- Supabase SQL エディタで実行してください
-- ============================================================

-- 2025年度（2025年4月〜2026年3月）の体験データ
INSERT INTO applications (type, status, form_data, created_at) VALUES
-- 4月: 3件体験、1件入会済み
('trial', 'enrolled', '{"name":"田中太郎","furigana":"タナカタロウ","gender":"男","age":"8","grade":"小2","school":"泉小学校","guardian_name":"田中花子","phone":"090-1111-0001","email":"tanaka@example.com","desired_date":"2025-04-12","desired_classes":["かけっこ塾"],"route":"友人紹介","note":""}', '2025-04-05T10:00:00+09:00'),
('trial', 'approved', '{"name":"鈴木美咲","furigana":"スズキミサキ","gender":"女","age":"7","grade":"小1","school":"中央小学校","guardian_name":"鈴木一郎","phone":"090-1111-0002","email":"suzuki@example.com","desired_date":"2025-04-15","desired_classes":["キッズダンス"],"route":"Instagram","note":""}', '2025-04-08T14:00:00+09:00'),
('trial', 'rejected', '{"name":"佐藤健太","furigana":"サトウケンタ","gender":"男","age":"9","grade":"小3","school":"松任小学校","guardian_name":"佐藤美穂","phone":"090-1111-0003","email":"sato@example.com","desired_date":"2025-04-20","desired_classes":["陸上西部キッズ"],"route":"チラシ","note":""}', '2025-04-10T09:00:00+09:00'),

-- 5月: 4件体験、2件入会済み
('trial', 'enrolled', '{"name":"山田あおい","furigana":"ヤマダアオイ","gender":"女","age":"10","grade":"小4","school":"富樫小学校","guardian_name":"山田次郎","phone":"090-1111-0004","email":"yamada@example.com","desired_date":"2025-05-10","desired_classes":["バドミントン高尾台"],"route":"ホームページ","note":""}', '2025-05-03T11:00:00+09:00'),
('trial', 'enrolled', '{"name":"中村陸","furigana":"ナカムラリク","gender":"男","age":"8","grade":"小2","school":"泉小学校","guardian_name":"中村真理","phone":"090-1111-0005","email":"nakamura@example.com","desired_date":"2025-05-17","desired_classes":["かけっこ塾","陸上西部キッズ"],"route":"友人紹介","note":"兄弟と一緒に"}', '2025-05-06T10:30:00+09:00'),
('trial', 'approved', '{"name":"小林結衣","furigana":"コバヤシユイ","gender":"女","age":"6","grade":"年長","school":"ひまわり保育園","guardian_name":"小林正","phone":"090-1111-0006","email":"kobayashi@example.com","desired_date":"2025-05-24","desired_classes":["キッズチアリーディング"],"route":"Instagram","note":""}', '2025-05-12T15:00:00+09:00'),
('trial', 'reviewed', '{"name":"加藤翔","furigana":"カトウショウ","gender":"男","age":"11","grade":"小5","school":"額小学校","guardian_name":"加藤恵子","phone":"090-1111-0007","email":"kato@example.com","desired_date":"2025-05-31","desired_classes":["キンボールスポーツ"],"route":"チラシ","note":""}', '2025-05-20T09:00:00+09:00'),

-- 6月: 5件体験、2件入会済み
('trial', 'enrolled', '{"name":"伊藤さくら","furigana":"イトウサクラ","gender":"女","age":"9","grade":"小3","school":"中央小学校","guardian_name":"伊藤健一","phone":"090-1111-0008","email":"ito@example.com","desired_date":"2025-06-07","desired_classes":["キッズダンス"],"route":"ホームページ","note":""}', '2025-06-01T10:00:00+09:00'),
('trial', 'enrolled', '{"name":"渡辺大翔","furigana":"ワタナベヒロト","gender":"男","age":"7","grade":"小1","school":"泉小学校","guardian_name":"渡辺明美","phone":"090-1111-0009","email":"watanabe@example.com","desired_date":"2025-06-14","desired_classes":["かけっこ塾"],"route":"友人紹介","note":""}', '2025-06-04T14:30:00+09:00'),
('trial', 'approved', '{"name":"高橋凛","furigana":"タカハシリン","gender":"女","age":"10","grade":"小4","school":"松任小学校","guardian_name":"高橋誠","phone":"090-1111-0010","email":"takahashi@example.com","desired_date":"2025-06-21","desired_classes":["インクルーシブ陸上"],"route":"Instagram","note":""}', '2025-06-08T11:00:00+09:00'),
('trial', 'approved', '{"name":"松本蓮","furigana":"マツモトレン","gender":"男","age":"12","grade":"小6","school":"額小学校","guardian_name":"松本恵","phone":"090-1111-0011","email":"matsumoto@example.com","desired_date":"2025-06-28","desired_classes":["陸上西部ジュニア"],"route":"チラシ","note":""}', '2025-06-15T09:00:00+09:00'),
('trial', 'rejected', '{"name":"井上楓","furigana":"イノウエカエデ","gender":"女","age":"8","grade":"小2","school":"富樫小学校","guardian_name":"井上博","phone":"090-1111-0012","email":"inoue@example.com","desired_date":"2025-06-28","desired_classes":["キッズチアリーディング"],"route":"ホームページ","note":""}', '2025-06-18T16:00:00+09:00'),

-- 7月〜9月: 各2-3件
('trial', 'enrolled', '{"name":"木村悠真","furigana":"キムラユウマ","gender":"男","age":"9","grade":"小3","school":"泉小学校","guardian_name":"木村幸子","phone":"090-1111-0013","email":"kimura@example.com","desired_date":"2025-07-05","desired_classes":["かけっこ塾"],"route":"友人紹介","note":""}', '2025-07-01T10:00:00+09:00'),
('trial', 'approved', '{"name":"林彩花","furigana":"ハヤシアヤカ","gender":"女","age":"7","grade":"小1","school":"中央小学校","guardian_name":"林太郎","phone":"090-1111-0014","email":"hayashi@example.com","desired_date":"2025-07-12","desired_classes":["キッズダンス"],"route":"Instagram","note":""}', '2025-07-05T14:00:00+09:00'),
('trial', 'approved', '{"name":"斎藤大和","furigana":"サイトウヤマト","gender":"男","age":"11","grade":"小5","school":"松任小学校","guardian_name":"斎藤由美","phone":"090-1111-0015","email":"saito@example.com","desired_date":"2025-08-09","desired_classes":["キンボールスポーツ"],"route":"ホームページ","note":""}', '2025-08-02T10:00:00+09:00'),
('trial', 'enrolled', '{"name":"清水心春","furigana":"シミズコハル","gender":"女","age":"8","grade":"小2","school":"額小学校","guardian_name":"清水健太","phone":"090-1111-0016","email":"shimizu@example.com","desired_date":"2025-08-23","desired_classes":["キッズチアリーディング"],"route":"チラシ","note":""}', '2025-08-10T11:00:00+09:00'),
('trial', 'reviewed', '{"name":"山口大輝","furigana":"ヤマグチダイキ","gender":"男","age":"10","grade":"小4","school":"泉小学校","guardian_name":"山口美香","phone":"090-1111-0017","email":"yamaguchi@example.com","desired_date":"2025-09-06","desired_classes":["陸上西部キッズ"],"route":"友人紹介","note":""}', '2025-09-01T09:00:00+09:00'),
('trial', 'approved', '{"name":"森本葵","furigana":"モリモトアオイ","gender":"女","age":"6","grade":"年長","school":"みどり保育園","guardian_name":"森本一","phone":"090-1111-0018","email":"morimoto@example.com","desired_date":"2025-09-20","desired_classes":["かけっこ塾"],"route":"Instagram","note":""}', '2025-09-08T15:00:00+09:00'),

-- 10月〜12月
('trial', 'enrolled', '{"name":"岡田颯太","furigana":"オカダソウタ","gender":"男","age":"9","grade":"小3","school":"中央小学校","guardian_name":"岡田直子","phone":"090-1111-0019","email":"okada@example.com","desired_date":"2025-10-04","desired_classes":["バドミントン高尾台"],"route":"ホームページ","note":""}', '2025-10-01T10:00:00+09:00'),
('trial', 'approved', '{"name":"藤田芽依","furigana":"フジタメイ","gender":"女","age":"7","grade":"小1","school":"富樫小学校","guardian_name":"藤田洋介","phone":"090-1111-0020","email":"fujita@example.com","desired_date":"2025-10-18","desired_classes":["キッズダンス"],"route":"チラシ","note":""}', '2025-10-05T14:00:00+09:00'),
('trial', 'enrolled', '{"name":"西村蒼","furigana":"ニシムラアオ","gender":"男","age":"8","grade":"小2","school":"泉小学校","guardian_name":"西村真由美","phone":"090-1111-0021","email":"nishimura@example.com","desired_date":"2025-11-08","desired_classes":["かけっこ塾","陸上西部キッズ"],"route":"友人紹介","note":""}', '2025-11-01T10:00:00+09:00'),
('trial', 'rejected', '{"name":"三浦陽菜","furigana":"ミウラヒナ","gender":"女","age":"10","grade":"小4","school":"松任小学校","guardian_name":"三浦剛","phone":"090-1111-0022","email":"miura@example.com","desired_date":"2025-11-15","desired_classes":["インクルーシブ陸上"],"route":"Instagram","note":""}', '2025-11-05T11:00:00+09:00'),
('trial', 'approved', '{"name":"石川海斗","furigana":"イシカワカイト","gender":"男","age":"12","grade":"小6","school":"額小学校","guardian_name":"石川裕子","phone":"090-1111-0023","email":"ishikawa@example.com","desired_date":"2025-12-06","desired_classes":["陸上西部ジュニア"],"route":"ホームページ","note":""}', '2025-12-01T09:00:00+09:00'),

-- 1月〜2月（2026年）
('trial', 'enrolled', '{"name":"前田結月","furigana":"マエダユヅキ","gender":"女","age":"9","grade":"小3","school":"中央小学校","guardian_name":"前田正人","phone":"090-1111-0024","email":"maeda@example.com","desired_date":"2026-01-17","desired_classes":["キッズチアリーディング"],"route":"友人紹介","note":""}', '2026-01-10T10:00:00+09:00'),
('trial', 'pending', '{"name":"佐々木翼","furigana":"ササキツバサ","gender":"男","age":"7","grade":"小1","school":"泉小学校","guardian_name":"佐々木明","phone":"090-1111-0025","email":"sasaki@example.com","desired_date":"2026-01-31","desired_classes":["かけっこ塾"],"route":"チラシ","note":""}', '2026-01-20T14:00:00+09:00'),
('trial', 'pending', '{"name":"原田彩乃","furigana":"ハラダアヤノ","gender":"女","age":"8","grade":"小2","school":"富樫小学校","guardian_name":"原田雅子","phone":"090-1111-0026","email":"harada@example.com","desired_date":"2026-02-15","desired_classes":["キッズダンス"],"route":"Instagram","note":""}', '2026-02-05T11:00:00+09:00'),
('trial', 'reviewed', '{"name":"村上大地","furigana":"ムラカミダイチ","gender":"男","age":"10","grade":"小4","school":"松任小学校","guardian_name":"村上千恵","phone":"090-1111-0027","email":"murakami@example.com","desired_date":"2026-02-22","desired_classes":["キンボールスポーツ"],"route":"ホームページ","note":""}', '2026-02-10T09:00:00+09:00');

-- 対応する入会申請（転換確認用に数件）
INSERT INTO applications (type, status, form_data, created_at) VALUES
('join', 'approved', '{"name":"田中太郎","furigana":"タナカタロウ","birthdate":"2017-03-15","gender":"男","grade":"小2","school":"泉小学校","guardian_name":"田中花子","phone":"090-1111-0001","email":"tanaka@example.com","desired_classes":["かけっこ塾"],"trial_date":"2025-04-12","first_date":"2025-05-01","note":""}', '2025-04-20T10:00:00+09:00'),
('join', 'approved', '{"name":"山田あおい","furigana":"ヤマダアオイ","birthdate":"2015-08-22","gender":"女","grade":"小4","school":"富樫小学校","guardian_name":"山田次郎","phone":"090-1111-0004","email":"yamada@example.com","desired_classes":["バドミントン高尾台"],"trial_date":"2025-05-10","first_date":"2025-06-01","note":""}', '2025-05-20T14:00:00+09:00'),
('join', 'approved', '{"name":"中村陸","furigana":"ナカムラリク","birthdate":"2017-01-10","gender":"男","grade":"小2","school":"泉小学校","guardian_name":"中村真理","phone":"090-1111-0005","email":"nakamura@example.com","desired_classes":["かけっこ塾","陸上西部キッズ"],"trial_date":"2025-05-17","first_date":"2025-06-07","note":""}', '2025-05-25T11:00:00+09:00'),
('join', 'pending', '{"name":"小林結衣","furigana":"コバヤシユイ","birthdate":"2019-04-01","gender":"女","grade":"年長","school":"ひまわり保育園","guardian_name":"小林正","phone":"090-1111-0006","email":"kobayashi@example.com","desired_classes":["キッズチアリーディング"],"trial_date":"2025-05-24","first_date":"2025-06-15","note":""}', '2025-06-02T10:00:00+09:00'),
('join', 'approved', '{"name":"伊藤さくら","furigana":"イトウサクラ","birthdate":"2016-11-05","gender":"女","grade":"小3","school":"中央小学校","guardian_name":"伊藤健一","phone":"090-1111-0008","email":"ito@example.com","desired_classes":["キッズダンス"],"trial_date":"2025-06-07","first_date":"2025-07-01","note":""}', '2025-06-15T14:00:00+09:00');
