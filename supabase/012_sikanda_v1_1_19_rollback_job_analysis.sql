-- Rollback Job Analysis Features (Tables and Policies)

-- Drop tables in reverse order of creation
drop table if exists public.job_analysis_assessment_answers cascade;
drop table if exists public.job_analysis_assessments cascade;
drop table if exists public.job_analysis_rules cascade;
drop table if exists public.job_analysis_variables cascade;
