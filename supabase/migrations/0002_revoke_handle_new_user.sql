-- =============================================================================
-- 0002_revoke_handle_new_user.sql
-- Supabase concede EXECUTE a `authenticated` por defecto en funciones nuevas
-- de public. handle_new_user() es solo para el trigger de auth.users, así que
-- no debe poder llamarse por RPC (lo señaló `supabase db advisors`).
-- =============================================================================
revoke execute on function public.handle_new_user() from authenticated;
