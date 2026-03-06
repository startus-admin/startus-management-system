-- Fix RLS functions: use chr() to build status string
-- chr(22312) = first char, chr(31821) = second char
CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff
    WHERE email = auth.jwt() ->> 'email'
      AND status = chr(22312) || chr(31821)
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
      AND status = chr(22312) || chr(31821)
      AND is_admin = true
  );
$$;
