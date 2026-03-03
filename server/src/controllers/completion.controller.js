import { supabaseAdmin } from '../config/supabase.config.js';

/**
 * Completion Controller
 * ---------------------
 * Handles retrieval and upsert of problem completion records.
 *
 * Semantics:
 * - A row in `problem_completions` with NULL `completed_at` means "attempted but not completed".
 * - A row with non-NULL `completed_at` means "completed".
 *
 * This controller is intentionally thin and delegates all persistence to Supabase.
 */
export class CompletionController {
  /**
   * Returns all problem completions for a given user.
   * Expects `userId` as a query parameter.
   */
  async listForUser(req, res) {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
      if (!userId) {
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }

      // In dev we sometimes use a non-UUID like "dev-admin" for convenience.
      // Supabase will error if we pass an invalid UUID into an eq() filter.
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        console.warn('[CompletionController] Non-UUID userId provided; returning empty completions.', userId);
        res.status(200).json({ completions: [] });
        return;
      }

      if (!supabaseAdmin) {
        res.status(500).json({ error: 'Supabase admin client is not configured' });
        return;
      }

      const { data, error } = await supabaseAdmin
        .from('problem_completions')
        .select('id,user_id,problem_id,solution_code,language,completed_at')
        .eq('user_id', userId);

      if (error) {
        console.error('[CompletionController] Error fetching completions:', error.message);
        res.status(500).json({ error: 'Failed to fetch problem completions' });
        return;
      }

      res.status(200).json({ completions: data ?? [] });
    } catch (err) {
      console.error('[CompletionController] Unexpected error fetching completions:', err);
      res.status(500).json({ error: 'Internal server error while fetching completions' });
    }
  }

  /**
   * Upserts a single problem completion record.
   * Body: { userId, problemId, solutionCode, language, completed? }
   *
   * - If a row does not exist, it is inserted.
   * - If it exists, it is updated with the latest code/language.
   * - If `completed === true`, `completed_at` is set to now.
   * - If `completed` is omitted or false, `completed_at` is left untouched
   *   so that once a problem is completed it is not downgraded by autosaves.
   */
  async upsertCompletion(req, res) {
    try {
      const { userId, problemId, solutionCode, language, completed } = req.body ?? {};

      if (!userId || !problemId || !solutionCode || !language) {
        res.status(400).json({ error: 'userId, problemId, solutionCode, and language are required' });
        return;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        console.warn('[CompletionController] Non-UUID userId provided to upsertCompletion; rejecting write.', userId);
        res.status(400).json({ error: 'Invalid userId format' });
        return;
      }

      if (!supabaseAdmin) {
        res.status(500).json({ error: 'Supabase admin client is not configured' });
        return;
      }

      const payload = {
        user_id: userId,
        problem_id: problemId,
        solution_code: solutionCode,
        language,
      };

      if (completed === true) {
        payload.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabaseAdmin
        .from('problem_completions')
        .upsert(payload, { onConflict: 'user_id,problem_id' })
        .select('id,user_id,problem_id,solution_code,language,completed_at')
        .single();

      if (error) {
        console.error('[CompletionController] Error upserting completion:', error.message);
        res.status(500).json({ error: 'Failed to save problem completion' });
        return;
      }

      res.status(200).json({ completion: data });
    } catch (err) {
      console.error('[CompletionController] Unexpected error upserting completion:', err);
      res.status(500).json({ error: 'Internal server error while saving completion' });
    }
  }
}

