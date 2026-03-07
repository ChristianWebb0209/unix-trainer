/**
 * File Service
 * ------------
 * CRUD for playground files stored in file_data (one row per user, files in JSONB array).
 * Uses Supabase; requires supabaseAdmin.
 */

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/supabase.config.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUserId(userId) {
  return typeof userId === 'string' && userId.trim() && UUID_REGEX.test(userId);
}

/** @typedef {{ id: string, name: string, code: string }} FileEntry */

export class FileService {
  /**
   * Get or create the single file_data row for this user.
   * @returns {{ id: string, user_id: string, files: FileEntry[] }}
   */
  async getOrCreateUserFile(userId) {
    if (!validUserId(userId)) throw new Error('Invalid userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('file_data')
      .select('id, user_id, files')
      .eq('user_id', userId)
      .single();

    if (!fetchError && existing) return existing;

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('file_data')
      .insert({ user_id: userId, files: [] })
      .select('id, user_id, files')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: retry } = await supabaseAdmin
          .from('file_data')
          .select('id, user_id, files')
          .eq('user_id', userId)
          .single();
        if (retry) return retry;
      }
      console.error('[FileService] getOrCreateUserFile error:', insertError.message);
      throw insertError;
    }
    return inserted;
  }

  async listByUser(userId) {
    if (!validUserId(userId)) return { files: [] };
    if (!supabaseAdmin) return { files: [] };

    const row = await this.getOrCreateUserFile(userId);
    const files = Array.isArray(row.files) ? row.files : [];
    return { files };
  }

  async getById(id, userId) {
    if (!validUserId(userId) || !id) return null;
    if (!supabaseAdmin) return null;

    const row = await this.getOrCreateUserFile(userId);
    const files = Array.isArray(row.files) ? row.files : [];
    return files.find((f) => f.id === id) ?? null;
  }

  async create({ userId, name, code }) {
    if (!validUserId(userId)) throw new Error('Invalid userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const nameStr = typeof name === 'string' ? name.trim() : 'untitled';
    const codeStr = typeof code === 'string' ? code : '';
    const file = { id: randomUUID(), name: nameStr || 'untitled', code: codeStr };

    const row = await this.getOrCreateUserFile(userId);
    const files = Array.isArray(row.files) ? [...row.files] : [];
    files.unshift(file);

    const { error } = await supabaseAdmin
      .from('file_data')
      .update({ files })
      .eq('user_id', userId);

    if (error) {
      console.error('[FileService] create error:', error.message);
      throw error;
    }
    return file;
  }

  async update(id, userId, { name, code }) {
    if (!validUserId(userId) || !id) throw new Error('Invalid id or userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const row = await this.getOrCreateUserFile(userId);
    const files = Array.isArray(row.files) ? [...row.files] : [];
    const idx = files.findIndex((f) => f.id === id);
    if (idx === -1) throw new Error('Invalid file id');

    if (typeof name === 'string') files[idx].name = name.trim() || 'untitled';
    if (typeof code === 'string') files[idx].code = code;

    const { error } = await supabaseAdmin
      .from('file_data')
      .update({ files })
      .eq('user_id', userId);

    if (error) {
      console.error('[FileService] update error:', error.message);
      throw error;
    }
    return files[idx];
  }

  async delete(id, userId) {
    if (!validUserId(userId) || !id) throw new Error('Invalid id or userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const row = await this.getOrCreateUserFile(userId);
    const files = Array.isArray(row.files) ? row.files.filter((f) => f.id !== id) : [];

    const { error } = await supabaseAdmin
      .from('file_data')
      .update({ files })
      .eq('user_id', userId);

    if (error) {
      console.error('[FileService] delete error:', error.message);
      throw error;
    }
    return true;
  }

  /**
   * Return the files array for a user (for container injection).
   */
  async getFilesForUser(userId) {
    const { files } = await this.listByUser(userId);
    return files;
  }

  /**
   * Replace the entire files array for a user (e.g. after syncing from container).
   * @param {string} userId
   * @param {FileEntry[]} files
   */
  async setFilesForUser(userId, files) {
    if (!validUserId(userId)) throw new Error('Invalid userId');
    if (!supabaseAdmin) throw new Error('Database not configured');
    const list = Array.isArray(files) ? files : [];

    const row = await this.getOrCreateUserFile(userId);
    const { error } = await supabaseAdmin
      .from('file_data')
      .update({ files: list })
      .eq('id', row.id);

    if (error) {
      console.error('[FileService] setFilesForUser error:', error.message);
      throw error;
    }
    return true;
  }
}
