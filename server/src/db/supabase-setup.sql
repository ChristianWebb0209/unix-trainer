-- Supabase Database Setup
-- Run this in Supabase SQL Editor to create all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (wrapper around Supabase Auth users)
-- Supabase Auth stores credentials in auth.users; this table is for app-specific user data.
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Problems table (source of truth for problems)
CREATE TABLE IF NOT EXISTS public.problems (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    instructions TEXT NOT NULL,
    solution TEXT DEFAULT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('learn', 'easy', 'medium', 'hard')),
    language VARCHAR(50) NOT NULL,
    tests JSONB NOT NULL DEFAULT '[]'::jsonb,
    starter_code TEXT
);

-- 3. Problem completions table
CREATE TABLE IF NOT EXISTS public.problem_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solution_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, problem_id)
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON public.problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_language ON public.problems(language);

CREATE INDEX IF NOT EXISTS idx_completions_user_id ON public.problem_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_problem_id ON public.problem_completions(problem_id);
CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON public.problem_completions(completed_at DESC);

-- Set up Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view their own user record" 
    ON public.users FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own user record" 
    ON public.users FOR UPDATE 
    USING (auth.uid() = id);

-- RLS Policies for problems (read-only, public)
CREATE POLICY "Anyone can view problems" 
    ON public.problems FOR SELECT 
    USING (true);

-- RLS Policies for completions
CREATE POLICY "Users can view their own completions" 
    ON public.problem_completions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create completions" 
    ON public.problem_completions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own completions" 
    ON public.problem_completions FOR UPDATE 
    USING (auth.uid() = user_id);

-- Function to automatically create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.problems TO authenticated;
GRANT ALL ON public.problem_completions TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
