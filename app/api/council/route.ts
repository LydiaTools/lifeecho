import { database, ensureSchema, findProfile, loadStages, recordEvent, visitorHash } from '@/lib/db-runtime';

type StageRow = Awaited<ReturnType<typeof loadStages>>[number];

const unsafePattern = /(自杀|自残|不想活|结束生命|伤害自己|活不下去)/;

const categories = [
  { name: '职业', pattern: /(工作|辞职|离职|职业|老板|公司|跳槽)/, action: '找一位目标行业的人，做一次 20 分钟事实访谈，并写下三个意外发现。', tension: '稳定感与成长空间' },
  { name: '迁移', pattern: /(城市|搬家|迁居|出国|回家|留下)/, action: '分别写下“留下”和“离开”后一个普通周二的完整日程，再标出最想保留的三件事。', tension: '归属感与新可能' },
  { name: '关系', pattern: /(关系|恋爱|分手|结婚|伴侣|继续)/, action: '安排一次 30 分钟对话：只谈事实、感受和边界，不急着得出结论。', tension: '亲密需求与自我边界' },
  { name: '创造', pattern: /(创业|项目|副业|生意|产品)/, action: '把最小版本展示给 5 位真实目标用户，只记录他们是否愿意继续使用或付费。', tension: '安全路径与主动创造' },
];

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function stageStatement(stage: StageRow, question: string, index: number) {
  const memory = clean(stage.memory, 96);
  const openings = ['我那时最怕把自己困在别人的答案里。', '我已经知道，硬撑和坚持不是同一件事。', '我更在意这次选择是否忠于你真正重视的东西。'];
  return `关于“${question}”，${openings[index % openings.length]}在「${stage.title}」那段经历里，你记得：${memory}。如果仍把“${stage.value}”放在心里，先看清什么会因此得到、什么会因此失去。`;
}

function buildCouncil(question: string, stages: StageRow[]) {
  const rule = categories.find((item) => item.pattern.test(question)) ?? {
    name: '自我方向',
    action: '设计一个连续 7 天、每天 20 分钟、可以随时撤回的小实验，用真实感受代替脑内猜测。',
    tension: '熟悉的身份与正在形成的新身份',
  };
  const grounded = stages.slice(0, 3).map((stage, index) => ({
    id: `stage-${stage.id}`,
    label: stage.stage_type === 'present' ? '现在的我' : `${stage.age_label} 岁的我`,
    role: stage.title,
    kind: stage.stage_type,
    statement: stageStatement(stage, question, index),
    source: `来自你记录的「${stage.title}」：${clean(stage.memory, 58)}`,
  }));

  const values = [...new Set(stages.slice(0, 3).map((stage) => stage.value))];
  const future = [
    {
      id: 'future-change',
      label: '+3 年 · 改变之后',
      role: '可能情景 A',
      kind: 'future',
      statement: `假设你为“${question}”选择了改变：三年后的价值不在于证明当初正确，而在于你是否获得了更接近“${values[0] ?? '真实'}”的生活证据。代价可能是短期不确定，你需要提前设计缓冲。`,
      source: '基于当前问题的情景推演，不是预测，也不是已发生的记忆。',
    },
    {
      id: 'future-stay',
      label: '+3 年 · 维持之后',
      role: '可能情景 B',
      kind: 'future',
      statement: `假设你维持现状：稳定本身不是失败，但必须明确它为“${values.at(-1) ?? '重要关系'}”换来了什么。最大的风险不是留下，而是把没有决定误当成了决定。`,
      source: '基于当前问题的情景推演，不是预测，也不是已发生的记忆。',
    },
  ];

  return {
    category: rule.name,
    responses: [...grounded, ...future],
    synthesis: {
      common: `不同阶段都在保护同一件事：${values.slice(0, 3).join('、') || '你真正重视的生活'}。`,
      conflict: `真正的拉扯不是简单的“做或不做”，而是${rule.tension}之间如何取舍。`,
      missing: '目前最缺的不是更多观点，而是一小块来自现实的证据。',
      decisionFrame: '先问：哪一个选项的代价虽然不舒服，但更值得承担？再用一周实验验证，而不是今天逼自己终局表态。',
    },
    action: rule.action,
  };
}

function serializeCouncil(row: Record<string, unknown> | null, turns: Record<string, unknown>[] = []) {
  if (!row) return null;
  return {
    id: row.id,
    question: row.question,
    category: row.category,
    responses: JSON.parse(String(row.responses_json)),
    synthesis: JSON.parse(String(row.synthesis_json)),
    action: row.action_text,
    createdAt: row.created_at,
    turns: turns.map((turn) => ({
      id: turn.id,
      stageKey: turn.stage_key,
      userMessage: turn.user_message,
      stageReply: turn.stage_reply,
      createdAt: turn.created_at,
    })),
  };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('visitorToken') ?? '';
  if (token.length < 20) return Response.json({ error: '缺少设备凭证' }, { status: 400 });
  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ council: null });
  const row = await database()
    .prepare(`SELECT id, question, category, responses_json, synthesis_json, action_text, created_at
      FROM councils WHERE profile_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(profile.id)
    .first<Record<string, unknown>>();
  const turns = row ? await database()
    .prepare('SELECT id, stage_key, user_message, stage_reply, created_at FROM council_turns WHERE council_id = ? ORDER BY created_at ASC')
    .bind(String(row.id))
    .all<Record<string, unknown>>() : { results: [] };
  return Response.json({ council: serializeCouncil(row, turns.results) });
}

export async function POST(request: Request) {
  const body = await request.json() as { visitorToken?: string; question?: string };
  const token = clean(body.visitorToken, 200);
  const question = clean(body.question, 180);
  if (token.length < 20 || question.length < 4) return Response.json({ error: '请写下一个更具体的真实选择' }, { status: 400 });
  if (unsafePattern.test(question)) {
    return Response.json({
      crisis: true,
      error: '这已经超出选择工具能安全支持的范围。请先联系身边可信任的人或专业机构；如有立即危险，请拨打 120 或 110。你不必独自处理。',
    }, { status: 422 });
  }

  await ensureSchema();
  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ error: '请先完成人生阶段建档' }, { status: 404 });
  const stages = await loadStages(profile.id);
  const result = buildCouncil(question, stages);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await database()
    .prepare(`INSERT INTO councils
      (id, profile_id, question, category, responses_json, synthesis_json, action_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, profile.id, question, result.category, JSON.stringify(result.responses), JSON.stringify(result.synthesis), result.action, createdAt)
    .run();
  await recordEvent(hash, 'council_completed', { category: result.category }, profile.id);

  return Response.json({ council: { id, question, category: result.category, responses: result.responses, synthesis: result.synthesis, action: result.action, createdAt, turns: [] } });
}
