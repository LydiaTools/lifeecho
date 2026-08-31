import { database, ensureSchema, findProfile, recordEvent, visitorHash } from '@/lib/db-runtime';

export async function POST(request: Request) {
  const body = await request.json() as {
    visitorToken?: string;
    councilId?: string;
    helpfulness?: number;
    wouldReturn?: boolean;
    note?: string;
  };
  const token = String(body.visitorToken ?? '').trim();
  const councilId = String(body.councilId ?? '').trim();
  const helpfulness = Number(body.helpfulness);
  const note = String(body.note ?? '').trim().slice(0, 800);
  if (token.length < 20 || !councilId || !Number.isInteger(helpfulness) || helpfulness < 1 || helpfulness > 5) {
    return Response.json({ error: '请完成 1—5 分评价' }, { status: 400 });
  }

  await ensureSchema();
  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ error: '找不到用户档案' }, { status: 404 });
  const owned = await database()
    .prepare('SELECT id FROM councils WHERE id = ? AND profile_id = ?')
    .bind(councilId, profile.id)
    .first<{ id: string }>();
  if (!owned) return Response.json({ error: '找不到这次议会' }, { status: 404 });

  const createdAt = new Date().toISOString();
  await database()
    .prepare(`INSERT INTO council_feedback (council_id, helpfulness, would_return, note, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(council_id) DO UPDATE SET helpfulness = excluded.helpfulness,
        would_return = excluded.would_return, note = excluded.note, created_at = excluded.created_at`)
    .bind(councilId, helpfulness, body.wouldReturn ? 1 : 0, note, createdAt)
    .run();
  await recordEvent(hash, 'feedback_submitted', { helpfulness, wouldReturn: Boolean(body.wouldReturn), hasNote: Boolean(note) }, profile.id);
  return Response.json({ ok: true });
}
