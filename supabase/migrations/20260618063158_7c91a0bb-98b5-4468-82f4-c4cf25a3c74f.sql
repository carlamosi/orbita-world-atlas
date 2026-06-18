GRANT SELECT, INSERT, UPDATE, DELETE ON public.country_progress TO authenticated;
GRANT ALL ON public.country_progress TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_streak TO authenticated;
GRANT ALL ON public.daily_streak TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unlocks TO authenticated;
GRANT ALL ON public.unlocks TO service_role;

GRANT SELECT, INSERT ON public.sessions_log TO authenticated;
GRANT ALL ON public.sessions_log TO service_role;

GRANT SELECT, INSERT ON public.challenge_attempts TO authenticated;
GRANT ALL ON public.challenge_attempts TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_pull(jsonb, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_push(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;