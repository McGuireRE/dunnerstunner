-- Hourly reminders, and a five-minute check that sends anything waiting in the email queue.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('music-hourly', '0 * * * *', $$select private.hourly()$$);
select cron.schedule('music-drain', '*/5 * * * *', $$select net.http_post(
  url := 'https://cimksrrmmbtauowrywlh.supabase.co/functions/v1/music-mail',
  body := '{"action":"drain"}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb)
  where exists (select 1 from private.outbox where sent_at is null and error is null and created_at > now() - interval '2 days')$$);
