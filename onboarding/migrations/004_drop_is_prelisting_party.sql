-- Tim's OK, 5 November 2026: remove the unused helper left from the pre-listing build.
-- Status: approved by Tim; not yet applied (the approval prompt timed out). Apply exactly this when he is at his screen.
drop function if exists public.is_prelisting_party(public.prelistings);
