import { supabaseAdmin } from "../src/config/supabase.config.js";

async function cleanupCompletions() {
  if (!supabaseAdmin) {
    console.error("[cleanup-completions] supabaseAdmin is not configured");
    process.exit(1);
  }

  console.log("[cleanup-completions] Fetching problem ids...");
  const { data: problems, error: problemsError } = await supabaseAdmin
    .from("problems")
    .select("id");

  if (problemsError) {
    console.error("[cleanup-completions] Failed to fetch problems:", problemsError.message);
    process.exit(1);
  }

  const validIds = new Set((problems ?? []).map((p) => p.id));
  console.log(`[cleanup-completions] Found ${validIds.size} valid problem ids.`);

  console.log("[cleanup-completions] Fetching problem_completions...");
  const { data: completions, error: completionsError } = await supabaseAdmin
    .from("problem_completions")
    .select("id, problem_id");

  if (completionsError) {
    console.error("[cleanup-completions] Failed to fetch problem_completions:", completionsError.message);
    process.exit(1);
  }

  const stale = (completions ?? []).filter(
    (c) => !validIds.has(c.problem_id)
  );

  if (stale.length === 0) {
    console.log("[cleanup-completions] No stale completions found. Nothing to delete.");
    process.exit(0);
  }

  console.log(`[cleanup-completions] Found ${stale.length} stale completions. Deleting in batches...`);

  const batchSize = 200;
  let deleted = 0;
  for (let i = 0; i < stale.length; i += batchSize) {
    const batch = stale.slice(i, i + batchSize);
    const ids = batch.map((c) => c.id);
    const { error } = await supabaseAdmin
      .from("problem_completions")
      .delete()
      .in("id", ids);
    if (error) {
      console.error("[cleanup-completions] Failed to delete batch:", error.message);
      continue;
    }
    deleted += ids.length;
    console.log(`[cleanup-completions] Deleted batch of ${ids.length} (total deleted: ${deleted})`);
  }

  console.log(`[cleanup-completions] Done. Deleted ${deleted} stale completion rows.`);
  process.exit(0);
}

cleanupCompletions().catch((err) => {
  console.error("[cleanup-completions] Unexpected error:", err?.message ?? err);
  process.exit(1);
});
