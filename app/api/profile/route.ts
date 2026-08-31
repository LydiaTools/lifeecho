import { database, ensureSchema, findProfile, loadStages, recordEvent, visitorHash, type StageInput } from '@/lib/db-runtime';

const asText = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('visitorToken') ?? '';
  if (token.length < 20) return Response.json({ error: '缺少设备凭证' }, { status: 400 });

  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ profile: null });
  const stages = await loadStages(profile.id);

  return Response.json({
    profile: {
      id: profile.id,
      name: profile.name,
      currentAge: profile.current_age,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
      stages: stages.map((stage) => ({
        id: stage.id,
        ageLabel: stage.age_label,
        title: stage.title,
        memory: stage.memory,
        value: stage.value,
        stageType: stage.stage_type,
      })),
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    visitorToken?: string;
    name?: string;
    currentAge?: number;
    consent?: boolean;
    stages?: StageInput[];
  };
  const token = asText(body.visitorToken, 200);
  const name = asText(body.name, 24);
  const currentAge = Number(body.currentAge);
  const stages = Array.isArray(body.stages) ? body.stages.slice(0, 6) : [];

  if (token.length < 20 || !name || !Number.isInteger(currentAge) || currentAge < 18 || currentAge > 100) {
    return Response.json({ error: '请完整填写昵称和真实年龄（仅限 18 岁以上）' }, { status: 400 });
  }
  if (!body.consent) return Response.json({ error: '请先确认隐私与使用边界' }, { status: 400 });
  if (stages.length < 3) return Response.json({ error: '至少需要三个人生阶段' }, { status: 400 });

  const cleaned = stages.map((stage, index) => ({
    ageLabel: asText(stage.ageLabel, 12),
    title: asText(stage.title, 40),
    memory: asText(stage.memory, 600),
    value: asText(stage.value, 60),
    stageType: index === stages.length - 1 ? 'present' : 'past',
  }));
  if (cleaned.some((stage) => !stage.ageLabel || !stage.title || stage.memory.length < 8 || !stage.value)) {
    return Response.json({ error: '每个阶段都需要年龄、标题、一段真实记忆和当时重视的东西' }, { status: 400 });
  }

  await ensureSchema();
  const hash = await visitorHash(token);
  const before = await findProfile(hash);
  const now = new Date().toISOString();
  await database()
    .prepare(`INSERT INTO profiles (visitor_hash, name, current_age, consent_version, created_at, updated_at)
      VALUES (?, ?, ?, '2026-08-31', ?, ?)
      ON CONFLICT(visitor_hash) DO UPDATE SET name = excluded.name, current_age = excluded.current_age, updated_at = excluded.updated_at`)
    .bind(hash, name, currentAge, now, now)
    .run();
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ error: '建档失败，请重试' }, { status: 500 });

  const statements = [database().prepare('DELETE FROM life_stages WHERE profile_id = ?').bind(profile.id)];
  cleaned.forEach((stage, index) => {
    statements.push(
      database()
        .prepare(`INSERT INTO life_stages
          (profile_id, stage_order, age_label, title, memory, value, stage_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(profile.id, index, stage.ageLabel, stage.title, stage.memory, stage.value, stage.stageType, now),
    );
  });
  await database().batch(statements);
  await recordEvent(hash, before ? 'profile_updated' : 'profile_created', { stageCount: cleaned.length }, profile.id);

  return GET(new Request(`${new URL(request.url).origin}/api/profile?visitorToken=${encodeURIComponent(token)}`));
}
