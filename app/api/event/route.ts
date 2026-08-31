import { findProfile, recordEvent, visitorHash } from '@/lib/db-runtime';

const allowedEvents = new Set([
  'light_entry',
  'question_started',
  'setup_step_completed',
  'action_shared',
]);

export async function POST(request: Request) {
  const body = await request.json() as {
    visitorToken?: string;
    eventName?: string;
    payload?: Record<string, unknown>;
  };
  const token = String(body.visitorToken ?? '').trim().slice(0, 200);
  const eventName = String(body.eventName ?? '').trim();
  if (token.length < 20 || !allowedEvents.has(eventName)) {
    return Response.json({ error: '无效事件' }, { status: 400 });
  }

  const hash = await visitorHash(token);
  const profile = await findProfile(hash);
  const payload = body.payload && typeof body.payload === 'object'
    ? Object.fromEntries(Object.entries(body.payload).slice(0, 12).map(([key, value]) => [key.slice(0, 40), String(value).slice(0, 120)]))
    : {};
  await recordEvent(hash, eventName, payload, profile?.id);
  return Response.json({ ok: true });
}
