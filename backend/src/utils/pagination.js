// Keyset pagination on (field desc, _id desc). Cursor is an opaque base64url JSON string.
export const parseLimit = (v, def = 30, max = 100) => Math.min(Math.max(parseInt(v, 10) || def, 1), max);

export function encodeCursor(doc, field) {
  return Buffer.from(JSON.stringify({ v: doc[field], id: String(doc._id) })).toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const { v, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    const value = new Date(v);
    if (Number.isNaN(value.getTime()) || !/^[a-f0-9]{24}$/i.test(id)) return null;
    return { value, id };
  } catch {
    return null;
  }
}

/** Filter fragment for "older than cursor" in a descending (field, _id) ordering. */
export function beforeCursor(cursor, field) {
  const c = decodeCursor(cursor);
  if (!c) return {};
  return { $or: [{ [field]: { $lt: c.value } }, { [field]: c.value, _id: { $lt: c.id } }] };
}

export async function paginate(query, { limit, field }) {
  const rows = await query.sort({ [field]: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1], field) : null };
}
