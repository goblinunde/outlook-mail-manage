import type { DatabaseAdapter } from '../database/types';
import type { Tag } from '../types';

export class TagRepository {
  constructor(private readonly db: DatabaseAdapter) {}

  async list(): Promise<Tag[]> {
    return this.db.all<Tag>('SELECT * FROM tags ORDER BY name');
  }

  async getById(id: number): Promise<Tag | undefined> {
    return this.db.first<Tag>(
      'SELECT * FROM tags WHERE id = ?',
      [id]
    );
  }

  async create(name: string, color = '#3B82F6'): Promise<Tag> {
    const result = await this.db.run(
      'INSERT INTO tags (name, color) VALUES (?, ?)',
      [name, color]
    );

    const created = await this.getById(Number(result.lastInsertRowid));
    if (!created) {
      throw new Error('Tag creation failed');
    }

    return created;
  }

  async update(id: number, data: { name?: string; color?: string }): Promise<Tag | undefined> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.color !== undefined) {
      fields.push('color = ?');
      values.push(data.color);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await this.db.run(
      `UPDATE tags SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.changes === 0) {
      return undefined;
    }

    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.db.run(
      'DELETE FROM tags WHERE id = ?',
      [id]
    );

    return result.changes > 0;
  }
}
