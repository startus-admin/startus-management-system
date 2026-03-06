-- Supabase auth.users のメールアドレスを確認
SELECT id, email, raw_user_meta_data->>'full_name' as name, last_sign_in_at
FROM auth.users
ORDER BY last_sign_in_at DESC;
