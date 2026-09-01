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

function stageStatement(stage: StageRow, question: string, index: number, feeling: string) {
  const memory = clean(stage.memory, 96);
  const heard = feeling ? `我听见你说，你现在${feeling}。` : '我听见你终于把这件事说出来了。';
  const letters = [
    `先别催自己马上坚强。那时在「${stage.title}」里，你经历过：${memory}。你不是因为不害怕才往前走，而是因为心里还有“${stage.value}”不想弄丢。关于“${question}”，先问问自己：哪一种选择，会让你更像那个真实的你？`,
    `我已经知道，硬撑和坚持不是同一件事。你记得「${stage.title}」那段日子：${memory}。它教会你的，不是凡事都要忍住，而是“${stage.value}”值得被认真照顾。这一次，也别只计算别人会不会失望。`,
    `我想先抱抱已经撑了很久的你。你曾在「${stage.title}」里写下：${memory}。如果“${stage.value}”还是你心里重要的东西，就允许自己诚实一点：留下和离开，哪一种代价会让你慢慢失去自己？`,
  ];
  return `${heard}${letters[index % letters.length]}`;
}

function buildCouncil(question: string, stages: StageRow[], feeling: string) {
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
    statement: stageStatement(stage, question, index, feeling),
    source: `她记得你亲手留下的「${stage.title}」：${clean(stage.memory, 58)}`,
  }));

  const values = [...new Set(stages.slice(0, 3).map((stage) => stage.value))];
  const future = [
    {
      id: 'future-change',
      label: '+3 年 · 改变之后',
      role: '可能情景 A',
      kind: 'future',
      statement: `如果我真的是那个在“${question}”之后选择改变、走到三年后的你，我不会回来告诉你“你选对了”。我只想让你知道：不确定会让人害怕，但它也可能把你带回更接近“${values[0] ?? '真实'}”的生活。你不必孤注一掷，可以先为自己准备一小块安全的落脚地。`,
      source: '这是根据你此刻的选择写出的一种可能，不是预测，也不是承诺。',
    },
    {
      id: 'future-stay',
      label: '+3 年 · 维持之后',
      role: '可能情景 B',
      kind: 'future',
      statement: `如果我是那个选择暂时留下、走到三年后的你，我不会责怪今天的你胆小。留下也可以是一种有意识的选择，只要它真的在保护“${values.at(-1) ?? '你在乎的人和事'}”。我更担心的，是你一边说再等等，一边把自己的感受越放越远。`,
      source: '这是根据你此刻的选择写出的一种可能，不是预测，也不是已发生的记忆。',
    },
  ];

  return {
    category: rule.name,
    responses: [...grounded, ...future],
    synthesis: {
      common: `不管几岁的你，都在保护这些没有变过的东西：${values.slice(0, 3).join('、') || '你真正想过的生活'}。`,
      conflict: `你不是不够果断。你只是同时舍不得${rule.tension}里的两边，所以每走一步都像在告别什么。`,
      missing: '今晚不用逼自己作最终决定。你缺的不是勇气，只是一小块能让心安静下来的现实证据。',
      decisionFrame: '先问自己：哪一种代价虽然会疼，却不会让我越来越不像自己？然后用七天验证，不在今晚逼自己决定一生。',
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
  const body = await request.json() as { visitorToken?: string; question?: string; feeling?: string };
  const token = clean(body.visitorToken, 200);
  const question = clean(body.question, 180);
  const feeling = clean(body.feeling, 20);
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
  const result = buildCouncil(question, stages, feeling);
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
