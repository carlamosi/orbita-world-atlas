create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'unauthenticated'; end if;
  delete from public.country_progress where user_id = uid;
  delete from public.sessions_log where user_id = uid;
  delete from public.challenge_attempts where user_id = uid;
  delete from public.unlocks where user_id = uid;
  delete from public.daily_streak where user_id = uid;
  delete from public.user_roles where user_id = uid;
  delete from public.profiles where id = uid;
end; $$;
grant execute on function public.delete_account() to authenticated;