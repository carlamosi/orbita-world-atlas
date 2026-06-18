REVOKE EXECUTE ON FUNCTION public.sync_pull(jsonb, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_push(jsonb) FROM anon;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;