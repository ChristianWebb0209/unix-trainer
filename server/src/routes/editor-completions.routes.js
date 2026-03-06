import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Serves static completion data for the editor (Option A IntelliSense).
 * GET /api/editor-completions/:language → JSON from server/src/data/completions/{language}_completions.json
 * If the file does not exist, returns 404; client fails gracefully (no IntelliSense).
 */
const DATA_DIR = path.join(__dirname, '../data/completions');

export const editorCompletionsRouter = Router();

editorCompletionsRouter.get('/:language', (req, res) => {
  const lang = (req.params.language || '').toLowerCase();
  if (!lang) {
    res.status(400).json({ error: 'Language required' });
    return;
  }
  const filePath = path.join(DATA_DIR, `${lang}_completions.json`);
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: `No completion data for language: ${lang}` });
        return;
      }
      console.error('[editor-completions]', err.message);
      res.status(500).json({ error: 'Failed to load completion data' });
      return;
    }
    try {
      const json = JSON.parse(data);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(json);
    } catch (parseErr) {
      console.error('[editor-completions] Invalid JSON:', parseErr.message);
      res.status(500).json({ error: 'Invalid completion data' });
    }
  });
});
