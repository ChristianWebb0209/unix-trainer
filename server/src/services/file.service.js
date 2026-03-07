/**
 * File Service
 * ------------
 * CRUD for playground files (user_id, name, code).
 * Uses Supabase; requires supabaseAdmin.
 */

import { supabaseAdmin } from '../config/supabase.config.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUserId(userId) {
  return typeof userId === 'string' && userId.trim() && UUID_REGEX.test(userId);
}

export class FileService {
  async listByUser(userId) {
    if (!validUserId(userId)) return { files: [] };
    if (!supabaseAdmin) return { files: [] };

    const { data, error } = await supabaseAdmin
      .from('files')
      .select('id, name, code, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('[FileService] listByUser error:', error.message);
      throw error;
    }
    return { files: data ?? [] };
  }

  async getById(id, userId) {
    if (!validUserId(userId) || !id) return null;
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin
      .from('files')
      .select('id, user_id, name, code, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;
    return data;
  }

  async create({ userId, name, code }) {
    if (!validUserId(userId)) throw new Error('Invalid userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const nameStr = typeof name === 'string' ? name.trim() : 'untitled';
    const codeStr = typeof code === 'string' ? code : '';

    const { data, error } = await supabaseAdmin
      .from('files')
      .insert({
        user_id: userId,
        name: nameStr || 'untitled',
        code: codeStr,
        updated_at: new Date().toISOString(),
      })
      .select('id, name, code, created_at, updated_at')
      .single();

    if (error) {
      console.error('[FileService] create error:', error.message);
      throw error;
    }
    return data;
  }

  async update(id, userId, { name, code }) {
    if (!validUserId(userId) || !id) throw new Error('Invalid id or userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const updates = { updated_at: new Date().toISOString() };
    if (typeof name === 'string') updates.name = name.trim() || 'untitled';
    if (typeof code === 'string') updates.code = code;

    const { data, error } = await supabaseAdmin
      .from('files')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select('id, name, code, created_at, updated_at')
      .single();

    if (error) {
      console.error('[FileService] update error:', error.message);
      throw error;
    }
    return data;
  }

  async delete(id, userId) {
    if (!validUserId(userId) || !id) throw new Error('Invalid id or userId');
    if (!supabaseAdmin) throw new Error('Database not configured');

    const { error } = await supabaseAdmin
      .from('files')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[FileService] delete error:', error.message);
      throw error;
    }
    return true;
  }
}
