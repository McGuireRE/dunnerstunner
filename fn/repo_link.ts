// Links for vendors to the photos and documents Tim shares with them (migration 016). The deployed entry; the request handling is in
// repo_link_handler.ts (tested without a network or database). Vendors have no storage policy on the property-files bucket: this
// function asks the database, with the caller's own token, whether they may read the file (repo_vendor_can_read), and only then
// makes a 600-second signed link with the service role. Tim reads through his own storage policy and doesn't use this.
// Deployed like the others: a tiny index.ts imports this file's raw GitHub URL pinned to a commit, as `repo-link`, with the
// gateway's JWT verification ON (every caller must be signed in).
import { admin, cors } from "./shared.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { makeHandler } from "./repo_link_handler.ts";

Deno.serve(makeHandler({
  cors,
  canRead: async (authorization, path) => {
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: u, error: ue } = await uc.auth.getUser();
    if (ue || !u?.user) return null;
    const { data, error } = await uc.rpc("repo_vendor_can_read", { p_name: path });
    if (error) return false;
    return data === true;
  },
  sign: async (path, seconds) => {
    const { data, error } = await admin().storage.from("property-files").createSignedUrl(path, seconds);
    return error || !data ? null : data.signedUrl;
  },
}));
