
# As of 3/5/2026:

-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.problem_completions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  problem_id character varying NOT NULL,
  solution_code text NOT NULL,
  language character varying NOT NULL,
  completed_at timestamp with time zone,
  CONSTRAINT problem_completions_pkey PRIMARY KEY (id),
  CONSTRAINT problem_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT problem_completions_problem_id_fkey FOREIGN KEY (problem_id) REFERENCES public.problems(id)
);
CREATE TABLE public.problems (
  id character varying NOT NULL,
  title character varying NOT NULL,
  instructions text NOT NULL,
  difficulty character varying NOT NULL CHECK (difficulty::text = ANY (ARRAY['learn'::character varying, 'easy'::character varying, 'medium'::character varying, 'hard'::character varying]::text[])),
  language character varying NOT NULL,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  starter_code text,
  solution text,
  validation jsonb,
  CONSTRAINT problems_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email character varying NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);