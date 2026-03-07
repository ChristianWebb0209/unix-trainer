-- Drop all app schema (run in Supabase SQL Editor before re-running supabase-setup.sql)

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.problem_completions;
DROP TABLE IF EXISTS public.files;
DROP TABLE IF EXISTS public.projects;
DROP TABLE IF EXISTS public.problems;
DROP TABLE IF EXISTS public.users;
