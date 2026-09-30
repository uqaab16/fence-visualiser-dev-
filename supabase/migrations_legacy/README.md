# Legacy migrations (archived)

These three hand-written files pre-date the baseline migration. They did not match what was
actually applied to the live database (the core tables, RLS policies and storage bucket were
created by hand in the Supabase dashboard), so they could not rebuild the database.

Their effects are already contained in the baseline migration in `../migrations/`, which was
generated from the live production catalogs. Kept here for history only. Do not apply them.
