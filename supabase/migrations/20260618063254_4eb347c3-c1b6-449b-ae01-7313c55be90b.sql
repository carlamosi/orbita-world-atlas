REVOKE EXECUTE ON FUNCTION public.sync_pull(jsonb, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_push(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_pull(jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_push(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pull(jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_push(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;