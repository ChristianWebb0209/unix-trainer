-- Supabase Database Setup
-- Run this in Supabase SQL Editor to create all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (uses Supabase Auth, but we keep a reference for completions)
-- Note: Supabase Auth handles users, but we need a profiles table for app data
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Problems table (cached from JSON files)
CREATE TABLE IF NOT EXISTS public.problems (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    type VARCHAR(50) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
    time_limit_ms INTEGER NOT NULL DEFAULT 5000,
    memory_limit_bytes INTEGER NOT NULL DEFAULT 268435456,
    test_case_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Problem completions table
CREATE TABLE IF NOT EXISTS public.problem_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solution_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    attempts_count INTEGER NOT NULL DEFAULT 1,
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, problem_id)
);

-- 4. Submissions table (optional, for history)
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    submitted_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    execution_time_ms INTEGER,
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON public.problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_type ON public.problems(type);
CREATE INDEX IF NOT EXISTS idx_problems_visibility ON public.problems(visibility);

CREATE INDEX IF NOT EXISTS idx_completions_user_id ON public.problem_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_completions_problem_id ON public.problem_completions(problem_id);
CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON public.problem_completions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_problem_id ON public.submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.submissions(status);

-- Set up Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" 
    ON public.profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- RLS Policies for problems (read-only, public)
CREATE POLICY "Anyone can view problems" 
    ON public.problems FOR SELECT 
    USING (visibility = 'public');

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

-- RLS Policies for submissions
CREATE POLICY "Users can view their own submissions" 
    ON public.submissions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create submissions" 
    ON public.submissions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
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
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.problems TO authenticated;
GRANT ALL ON public.problem_completions TO authenticated;
GRANT ALL ON public.submissions TO authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
