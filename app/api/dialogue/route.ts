import { database, ensureSchema, findProfile, recordEvent, visitorHash } from '@/lib/db-runtime';

const unsafePattern = /(自杀|自残|不想活|结束生命|伤害自己|活不下去)/;

function clean(value: unknown, max: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function focusFor(message: string, value: string) {
  if (/(怕|担心|不敢|风险|失去)/.test(message)) return `害怕不代表你不够勇敢。先把真的会失去什么，和心里想象会失去什么，分开写下来。对那时的我来说，“${value}”比假装什么都不在乎更重要。`;
  if (/(后悔|错|选错)/.test(message)) return `我也怕过后悔。可后来才明白，比选错更难过的，是明明已经听见自己的声音，又把它按了回去。问问自己：哪一种代价虽然会疼，却更值得？`;
  if (/(怎么|如何|第一步)/.test(message)) return `不用一下子走很远。先做一件随时可以停下的小事，做完以后只问自己：身体有没有松一点，心里有没有亮一点。`;
  return `如果只留一个问题给你，我想问：这条路会不会让你更靠近“${value}”，也更认得出镜子里的自己？`;
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
    reply = `我是你想象中三年后的一个可能，不敢骗你说结局一定会这样。可你问我“${message}”，我想先陪你把它变小一点：找一个接下来七天就能看见的信号。它出现了，我们就多相信这条路一点；没有出现，也可以停下来重新选。未来不是来催你的，是来告诉你——你始终还有选择。`;
  } else {
    const stageId = Number(stageKey.replace('stage-', ''));
    const stage = await database()
      .prepare('SELECT title, memory, value, stage_type FROM life_stages WHERE id = ? AND profile_id = ?')
      .bind(stageId, profile.id)
      .first<{ title: string; memory: string; value: string; stage_type: string }>();
    if (!stage) return Response.json({ error: '找不到这个人生阶段' }, { status: 404 });
    const boundary = stage.stage_type === 'past' ? '我只记得那时的我们，不知道你后来又一个人走过了多少路。' : '我就是此刻的你，所以我知道你已经撑了很久。';
    reply = `${boundary}可站在「${stage.title}」这段人生里，听见你问“${message}”，我想对你说：${focusFor(message, stage.value)}我不会替你决定，只想把你那时没有弄丢的那点光，再递回给你。`;
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
