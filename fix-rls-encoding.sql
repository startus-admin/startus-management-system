-- RLS関数のエンコーディング修正
-- is_active_staff / is_admin_staff の日本語が文字化けしていたため再作成

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE email = auth.jwt() ->> 'email'
      AND status = '在籍'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE email = auth.jwt() ->> 'email'
      AND status = '在籍'
      AND is_admin = true
  );
$$;
