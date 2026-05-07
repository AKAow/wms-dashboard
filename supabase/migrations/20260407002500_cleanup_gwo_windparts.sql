-- Cleanup mistakenly applied windparts schema from GWO project

drop table if exists public.audit_log;
drop table if exists public.quotations;
drop table if exists public.orders;
drop table if exists public.customers;
drop table if exists public.admins;
