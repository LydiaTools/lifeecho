import { database, ensureSchema, findProfile, loadStages, visitorHash } from '@/lib/db-runtime';

async function identity(request: Request) {
  const token = new URL(request.url).searchParams.get('visitorToken') ?? '';
  if (token.length < 20) return null;
  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  return profile ? { token, hash, profile } : null;
}

export async function GET(request: Request) {
  await ensureSchema();
  const found = await identity(request);
  if (!found) return Response.json({ error: '找不到用户档案' }, { status: 404 });
  const stages = await loadStages(found.profile.id);
  const councils = await database()
    .prepare(`SELECT c.id, c.question, c.category, c.responses_json, c.synthesis_json, c.action_text, c.created_at,
      f.helpfulness, f.would_return, f.note
      FROM councils c LEFT JOIN council_feedback f ON f.council_id = c.id
      WHERE c.profile_id = ? ORDER BY c.created_at ASC`)
    .bind(found.profile.id)
    .all<Record<string, unknown>>();
  return Response.json({
    exportedAt: new Date().toISOString(),
    profile: found.profile,
    stages,
    councils: councils.results.map((row) => ({
      ...row,
      responses_json: JSON.parse(String(row.responses_json)),
      synthesis_json: JSON.parse(String(row.synthesis_json)),
    })),
  });
}

export async function DELETE(request: Request) {
  await ensureSchema();
  const found = await identity(request);
  if (!found) return Response.json({ error: '找不到用户档案' }, { status: 404 });
  await database().batch([
    database().prepare('DELETE FROM product_events WHERE visitor_hash = ?').bind(found.hash),
    database().prepare('DELETE FROM profiles WHERE id = ?').bind(found.profile.id),
  ]);
  return Response.json({ ok: true });
}
