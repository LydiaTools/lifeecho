import { database, ensureSchema, findProfile, recordEvent, visitorHash } from '@/lib/db-runtime';

const unsafePattern = /(自杀|自残|不想活|结束生命|伤害自己|活不下去)/;

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function focusFor(message: string, value: string) {
  if (/(怕|担心|不敢|风险|失去)/.test(message)) return `先把确定会失去的，和只是想象会失去的分开。对我来说，“${value}”比避免一切不舒服更重要。`;
  if (/(后悔|错|选错)/.test(message)) return `真正需要防的未必是选错，而是重复一段你已经知道不适合自己的模式。问问哪一种代价更值得承担。`;
  if (/(怎么|如何|第一步)/.test(message)) return `先走一个可撤回的小步骤，不要把试验误当成终局承诺。做完后只记录事实，不急着解释。`;
  return `我会把问题缩小成一句：这个选择会不会让你更靠近“${value}”，同时愿意承担它真实的代价？`;
}

export async function POST(request: Request) {
  const body = await request.json() as { visitorToken?: string; councilId?: string; stageKey?: string; message?: string };
  const token = clean(body.visitorToken, 200);
  const councilId = clean(body.councilId, 80);
  const stageKey = clean(body.stageKey, 80);
  const message = clean(body.message, 400);
  if (token.length < 20 || !councilId || !stageKey || message.length < 2) {
    return Response.json({ error: '请写下你想追问这个阶段的话' }, { status: 400 });
  }
  if (unsafePattern.test(message)) {
    return Response.json({
      crisis: true,
      error: '这已经超出选择工具能安全支持的范围。请先联系身边可信任的人或专业机构；如有立即危险，请拨打 120 或 110。你不必独自处理。',
    }, { status: 422 });
  }

  await ensureSchema();
  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  if (!profile) return Response.json({ error: '找不到用户档案' }, { status: 404 });
  const council = await database()
    .prepare('SELECT id, question, responses_json FROM councils WHERE id = ? AND profile_id = ?')
    .bind(councilId, profile.id)
    .first<{ id: string; question: string; responses_json: string }>();
  if (!council) return Response.json({ error: '找不到这次议会' }, { status: 404 });

  const response = (JSON.parse(council.responses_json) as Array<{ id: string; label: string; role: string; kind: string; source: string }>).find((item) => item.id === stageKey);
  if (!response) return Response.json({ error: '找不到这个人生阶段' }, { status: 404 });

  let reply: string;
  if (response.kind === 'future') {
    reply = `我只是“${response.role}”，不是你的真实未来，所以无法保证会发生什么。对于你问的“${message}”，我建议先定义一个可观察信号：如果它出现，你会更相信这个情景；如果没有出现，就及时修正。未来分支的价值是帮助你准备，不是替你预测。`;
  } else {
    const stageId = Number(stageKey.replace('stage-', ''));
    const stage = await database()
      .prepare('SELECT title, memory, value, stage_type FROM life_stages WHERE id = ? AND profile_id = ?')
      .bind(stageId, profile.id)
      .first<{ title: string; memory: string; value: string; stage_type: string }>();
    if (!stage) return Response.json({ error: '找不到这个人生阶段' }, { status: 404 });
    const boundary = stage.stage_type === 'past' ? '我只知道那时已经发生的事，不知道你后来的经历。' : '我会只使用你写下的现在处境。';
    reply = `${boundary}站在「${stage.title}」这段人生里，关于你追问的“${message}”：${focusFor(message, stage.value)}这不是替你决定，而是从那段记忆里照回来的问题。`;
  }

  const createdAt = new Date().toISOString();
  const result = await database()
    .prepare(`INSERT INTO council_turns (council_id, stage_key, user_message, stage_reply, created_at)
      VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .bind(council.id, stageKey, message, reply, createdAt)
    .first<{ id: number }>();
  await recordEvent(hash, 'dialogue_turn_created', { stageKind: response.kind }, profile.id);
  return Response.json({ turn: { id: result?.id, stageKey, userMessage: message, stageReply: reply, createdAt } });
}
