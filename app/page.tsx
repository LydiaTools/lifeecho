'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type Stage = {
  id?: number;
  ageLabel: string;
  title: string;
  memory: string;
  value: string;
  stageType?: string;
};

type Profile = {
  id: number;
  name: string;
  currentAge: number;
  createdAt: string;
  updatedAt: string;
  stages: Stage[];
};

type CouncilResponse = {
  id: string;
  label: string;
  role: string;
  kind: string;
  statement: string;
  source: string;
};

type CouncilTurn = {
  id: number;
  stageKey: string;
  userMessage: string;
  stageReply: string;
  createdAt: string;
};

type Council = {
  id: string;
  question: string;
  category: string;
  responses: CouncilResponse[];
  synthesis: { common: string; conflict: string; missing: string; decisionFrame: string };
  action: string;
  createdAt: string;
  turns: CouncilTurn[];
};

type Screen = 'loading' | 'ask' | 'setup' | 'creating' | 'council' | 'settings';

const prompts = ['要不要辞职？', '该换一座城市吗？', '这段关系还要继续吗？'];
const dangerPattern = /(自杀|自残|不想活|结束生命|伤害自己|活不下去)/;

const stageBlueprints = [
  {
    eyebrow: '过去 · 第一个转折',
    question: '18 岁左右，哪次选择让你第一次按自己的想法走？',
    hint: '一句话就够：发生了什么，你当时做了什么。',
    title: '第一次为自己选择',
    ageLabel: '18',
    values: ['自由', '勇气', '被看见', '可能性', '家人', '安全感'],
  },
  {
    eyebrow: '过去 · 一次改变',
    question: '后来哪次经历，改变了你对稳定或成功的看法？',
    hint: '可以是一份工作、一段关系、一次离开或低谷。',
    title: '一次重要转弯',
    ageLabel: '25',
    values: ['成长', '稳定', '尊严', '关系', '独立', '成就感'],
  },
  {
    eyebrow: '现在 · 真实处境',
    question: '此刻，你最不想再继续忍受的是什么？',
    hint: '不用写得漂亮，只写最真实的那一句。',
    title: '现在的拉扯',
    ageLabel: '现在',
    values: ['自主', '安心', '投入感', '边界', '归属', '真实'],
  },
];

function getDeviceToken() {
  const key = 'lifeecho-visitor-token';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function timeAgo(date: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
  if (days === 0) return '今天';
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function Logo() {
  return <span className="lite-logo"><b>回</b><span>回声</span><small>轻量版</small></span>;
}

export default function Home() {
  const [token] = useState(() => typeof window === 'undefined' ? '' : getDeviceToken());
  const [screen, setScreen] = useState<Screen>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [council, setCouncil] = useState<Council | null>(null);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  function track(eventName: string, payload: Record<string, unknown> = {}) {
    if (!token) return;
    void fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, eventName, payload }),
    });
  }

  useEffect(() => {
    const id = token || getDeviceToken();
    Promise.all([
      fetch(`/api/profile?visitorToken=${encodeURIComponent(id)}`).then((response) => response.json()),
      fetch(`/api/council?visitorToken=${encodeURIComponent(id)}`).then((response) => response.json()),
    ])
      .then(([profileData, councilData]) => {
        setProfile(profileData.profile ?? null);
        setCouncil(councilData.council ?? null);
        setScreen('ask');
        void fetch('/api/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorToken: id, eventName: 'light_entry', payload: { returning: Boolean(profileData.profile) } }),
        });
      })
      .catch(() => {
        setError('暂时无法连接，请刷新后重试。');
        setScreen('ask');
      });
  }, [token]);

  async function begin(event?: FormEvent) {
    event?.preventDefault();
    const cleanQuestion = question.trim();
    if (cleanQuestion.length < 4) {
      setError('再具体一点点，例如“我该不该离开现在的工作？”');
      return;
    }
    if (dangerPattern.test(cleanQuestion)) {
      setError('这已经超出选择工具能安全支持的范围。请先联系身边可信任的人或专业机构；如有立即危险，请拨打 120 或 110。你不必独自处理。');
      return;
    }
    setError('');
    track('question_started', { hasProfile: Boolean(profile) });
    if (!profile) {
      setEditing(false);
      setScreen('setup');
      return;
    }
    await createCouncil();
  }

  async function createCouncil() {
    setScreen('creating');
    setError('');
    try {
      const response = await fetch('/api/council', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken: token, question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '生成失败，请重试。');
      setCouncil(data.council);
      setScreen('council');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失败，请重试。');
      setScreen('ask');
    }
  }

  if (screen === 'loading') return <LoadingScreen label="正在找回你的人生线…" />;
  if (screen === 'creating') return <CreatingScreen question={question} />;

  if (screen === 'setup') {
    return (
      <SetupFlow
        token={token}
        existing={editing ? profile : null}
        onTrack={track}
        onCancel={profile ? () => setScreen('settings') : () => setScreen('ask')}
        onSaved={async (saved) => {
          setProfile(saved);
          if (editing) {
            setEditing(false);
            setScreen('ask');
          } else {
            await createCouncil();
          }
        }}
      />
    );
  }

  if (screen === 'settings' && profile) {
    return (
      <Settings
        token={token}
        profile={profile}
        onBack={() => setScreen('ask')}
        onEdit={() => { setEditing(true); setScreen('setup'); }}
        onDeleted={() => {
          window.localStorage.removeItem('lifeecho-visitor-token');
          window.location.reload();
        }}
      />
    );
  }

  if (screen === 'council' && council && profile) {
    return (
      <CouncilChat
        council={council}
        token={token}
        onTrack={track}
        onBack={() => setScreen('ask')}
      />
    );
  }

  return (
    <AskScreen
      profile={profile}
      council={council}
      question={question}
      error={error}
      onQuestion={setQuestion}
      onBegin={begin}
      onOpenCouncil={() => council && setScreen('council')}
      onSettings={() => profile && setScreen('settings')}
    />
  );
}

function AskScreen({ profile, council, question, error, onQuestion, onBegin, onOpenCouncil, onSettings }: {
  profile: Profile | null;
  council: Council | null;
  question: string;
  error: string;
  onQuestion: (value: string) => void;
  onBegin: (event: FormEvent) => void;
  onOpenCouncil: () => void;
  onSettings: () => void;
}) {
  return (
    <main className="phone-app ask-screen">
      <header className="lite-topbar">
        <Logo />
        {profile ? <button className="round-icon" onClick={onSettings} aria-label="打开我的资料">{profile.name.slice(0, 1)}</button> : <span className="beta-pill">30 人内测</span>}
      </header>

      <section className="ask-main">
        <div className="time-chip"><span />无需注册 · 约 2 分钟</div>
        <h1>{profile ? `${profile.name}，现在最难决定的，` : '把一个现在的难题，'}<br />说出来。</h1>
        <p>过去的你、现在的你和两种可能的未来，会围绕这一个问题开场对话。</p>

        <form className="ask-card" onSubmit={onBegin}>
          <label htmlFor="life-question">我正在纠结</label>
          <textarea
            id="life-question"
            value={question}
            onChange={(event) => onQuestion(event.target.value)}
            placeholder="例如：我该不该离开现在这份工作？"
            rows={4}
            maxLength={180}
            autoFocus
          />
          <div className="suggestion-row" aria-label="问题示例">
            {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onQuestion(prompt)}>{prompt}</button>)}
          </div>
          {error && <p className="lite-error" role="alert">{error}</p>}
          <button className="main-cta" disabled={question.trim().length < 4}>开始自我议会 <span>→</span></button>
        </form>

        <div className="trust-strip">
          <span>◇ 记忆可追溯</span><span>◇ 未来非预测</span><span>◇ 随时可删除</span>
        </div>
      </section>

      {council && (
        <button className="recent-mini" onClick={onOpenCouncil}>
          <span><small>{timeAgo(council.createdAt)}的议会</small><strong>“{council.question}”</strong></span>
          <b>继续 →</b>
        </button>
      )}
    </main>
  );
}

function SetupFlow({ token, existing, onSaved, onCancel, onTrack }: {
  token: string;
  existing: Profile | null;
  onSaved: (profile: Profile) => void | Promise<void>;
  onCancel: () => void;
  onTrack: (name: string, payload?: Record<string, unknown>) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.name ?? '我');
  const [age, setAge] = useState(existing ? String(existing.currentAge) : '');
  const [consent, setConsent] = useState(Boolean(existing));
  const [stages, setStages] = useState<Stage[]>(existing?.stages.map((stage) => ({ ...stage })) ?? stageBlueprints.map((item, index) => ({
    ageLabel: item.ageLabel,
    title: item.title,
    memory: '',
    value: '',
    stageType: index === 2 ? 'present' : 'past',
  })));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isMemoryStep = step > 0;
  const stageIndex = step - 1;
  const stage = stages[stageIndex];
  const blueprint = stageBlueprints[stageIndex];

  function patchStage(index: number, patch: Partial<Stage>) {
    setStages((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
  }

  function next() {
    setError('');
    if (step === 0) {
      const numericAge = Number(age);
      if (!Number.isInteger(numericAge) || numericAge < 18 || numericAge > 100) return setError('请输入真实年龄，本次内测仅限 18 岁以上。');
      if (!consent) return setError('请先确认使用边界与资料处理方式。');
      const secondAge = String(Math.max(19, numericAge - 5));
      setStages((current) => current.map((item, index) => index === 1 && item.ageLabel === '25' ? { ...item, ageLabel: secondAge } : item));
      onTrack('setup_step_completed', { step: 'identity' });
      setStep(1);
      return;
    }
    if (stage.memory.trim().length < 8) return setError('再多写一点点，至少让未来的回答能引用一件真实发生的事。');
    if (!stage.value) return setError('请选择这段人生当时最想守住的东西。');
    onTrack('setup_step_completed', { step: stageIndex + 1 });
    if (step < 3) setStep((current) => current + 1);
    else void save();
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorToken: token, name: name.trim() || '我', currentAge: Number(age), stages, consent }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '保存失败，请重试。');
      await onSaved(data.profile);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : '保存失败，请重试。');
    }
  }

  return (
    <main className="phone-app setup-screen">
      <header className="flow-topbar">
        <button onClick={step === 0 ? onCancel : () => setStep((current) => current - 1)} aria-label="返回">←</button>
        <div className="progress-track"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
        <small>{step + 1}/4</small>
      </header>

      {!isMemoryStep ? (
        <section className="setup-panel identity-panel">
          <span className="flow-kicker">开始前 · 20 秒</span>
          <h1>先确认是谁在<br />参加这场议会。</h1>
          <p>无需注册账号。浏览器只保存一个随机设备凭证。</p>
          <div className="compact-fields">
            <label><span>怎么称呼你</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="我" /></label>
            <label><span>现在年龄</span><input type="number" min="18" max="100" value={age} onChange={(event) => setAge(event.target.value)} inputMode="numeric" placeholder="28" /></label>
          </div>
          <label className="consent-card">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span><strong>我已满 18 岁并了解使用边界</strong><small>这是人生选择反思工具，不是心理咨询、医疗建议或未来预测。资料可随时导出或删除。</small></span>
          </label>
        </section>
      ) : (
        <section className="setup-panel memory-panel">
          <span className="flow-kicker">{blueprint.eyebrow}</span>
          <h1>{blueprint.question}</h1>
          <p>{blueprint.hint}</p>
          <label className="memory-input">
            <span>一件真实发生的事</span>
            <textarea value={stage.memory} onChange={(event) => patchStage(stageIndex, { memory: event.target.value })} rows={6} maxLength={600} placeholder="我记得……" autoFocus />
          </label>
          {stageIndex < 2 && (
            <label className="age-inline"><span>那时大约</span><input value={stage.ageLabel} onChange={(event) => patchStage(stageIndex, { ageLabel: event.target.value })} maxLength={12} /><span>岁</span></label>
          )}
          <fieldset className="value-picker">
            <legend>当时最想守住什么？</legend>
            <div>{blueprint.values.map((value) => <button type="button" key={value} className={stage.value === value ? 'selected' : ''} onClick={() => patchStage(stageIndex, { value })}>{value}</button>)}</div>
            <input value={blueprint.values.includes(stage.value) ? '' : stage.value} onChange={(event) => patchStage(stageIndex, { value: event.target.value })} placeholder="或自己写一个词" maxLength={60} />
          </fieldset>
        </section>
      )}

      <footer className="flow-footer">
        {error && <p className="lite-error" role="alert">{error}</p>}
        <button className="main-cta" onClick={next} disabled={busy}>{busy ? '正在点亮…' : step === 3 ? '召集我的自我议会 →' : '下一步 →'}</button>
        <small>{step === 0 ? '只有你能通过本设备凭证查看' : '过去的阶段不会知道后来才发生的事'}</small>
      </footer>
    </main>
  );
}

function CouncilChat({ council, token, onBack, onTrack }: {
  council: Council;
  token: string;
  onBack: () => void;
  onTrack: (name: string, payload?: Record<string, unknown>) => void;
}) {
  const [active, setActive] = useState(0);
  const [turns, setTurns] = useState<CouncilTurn[]>(council.turns ?? []);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [shareState, setShareState] = useState('');
  const current = council.responses[active];
  const currentTurns = turns.filter((turn) => turn.stageKey === current.id);

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (message.trim().length < 2 || busy) return;
    if (dangerPattern.test(message)) {
      setError('这已经超出本工具能安全支持的范围。请联系可信任的人或专业机构；如有立即危险，请拨打 120 或 110。');
      return;
    }
    setBusy(true);
    setError('');
    const response = await fetch('/api/dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, councilId: council.id, stageKey: current.id, message }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error ?? '追问失败，请重试。');
    setTurns((existing) => [...existing, data.turn]);
    setMessage('');
    setTimeout(() => document.getElementById('chat-end')?.scrollIntoView({ behavior: 'smooth' }), 30);
  }

  async function shareAction() {
    const text = `我的回声行动卡\n\n我正在面对：${council.question}\n\n7 天小实验：${council.action}\n\n未来不是预测，先用现实证据再决定。`;
    try {
      if (navigator.share) await navigator.share({ title: '我的回声行动卡', text });
      else {
        await navigator.clipboard.writeText(text);
        setShareState('已复制，可以粘贴到小红书');
      }
      onTrack('action_shared', { category: council.category });
    } catch {
      setShareState('分享已取消');
    }
  }

  return (
    <main className="phone-app chat-screen">
      <header className="chat-topbar">
        <button onClick={onBack} aria-label="返回">←</button>
        <span><strong>本次自我议会</strong><small>{council.category} · 未来非预测</small></span>
        <button className="summary-icon" onClick={() => setShowSummary(true)} aria-label="查看议会结论">结论</button>
      </header>

      <section className="chat-scroll">
        <div className="user-question"><span>你</span><p>{council.question}</p></div>
        <p className="system-note">过去的阶段只依据你当时的真实记忆；+3 年是情景推演。</p>

        <div className="stage-switcher" role="tablist" aria-label="选择人生阶段">
          {council.responses.map((response, index) => (
            <button key={response.id} role="tab" aria-selected={active === index} className={active === index ? 'selected' : ''} onClick={() => { setActive(index); setMessage(''); setError(''); }}>
              <b>{response.kind === 'future' ? '+3' : response.label.replace(' 岁的我', '').replace('现在的我', '今')}</b>
              <small>{response.kind === 'future' ? (index === council.responses.length - 2 ? '改变' : '维持') : response.role.slice(0, 6)}</small>
            </button>
          ))}
        </div>

        <article className={`stage-message ${current.kind === 'future' ? 'future-message' : ''}`}>
          <header><span><b>{current.label}</b><small>{current.role}</small></span><em>{current.kind === 'future' ? '假设情景' : '真实记忆'}</em></header>
          <p>{current.statement}</p>
          <details><summary>查看依据</summary><div>{current.source}</div></details>
        </article>

        {currentTurns.map((turn) => (
          <div className="turn-pair" key={turn.id}>
            <div className="turn-user">{turn.userMessage}</div>
            <div className="turn-stage"><span>{current.label}</span>{turn.stageReply}</div>
          </div>
        ))}

        <button className="summary-teaser" onClick={() => setShowSummary(true)}>
          <span><small>五个阶段已经说完</small><strong>看共同结论和 7 天实验</strong></span><b>→</b>
        </button>
        <div id="chat-end" />
      </section>

      <form className="chat-composer" onSubmit={ask}>
        {error && <p className="composer-error">{error}</p>}
        <div><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`继续问${current.label}…`} maxLength={400} /><button disabled={busy || message.trim().length < 2}>{busy ? '…' : '↑'}</button></div>
      </form>

      {showSummary && (
        <SummarySheet
          council={council}
          token={token}
          shareState={shareState}
          onClose={() => setShowSummary(false)}
          onShare={shareAction}
        />
      )}
    </main>
  );
}

function SummarySheet({ council, token, shareState, onClose, onShare }: {
  council: Council;
  token: string;
  shareState: string;
  onClose: () => void;
  onShare: () => void;
}) {
  const [score, setScore] = useState(0);
  const [wouldReturn, setWouldReturn] = useState(true);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);

  async function saveFeedback() {
    if (!score) return;
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, councilId: council.id, helpfulness: score, wouldReturn, note }),
    });
    if (response.ok) setSaved(true);
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="议会结论">
      <section className="summary-sheet">
        <button className="sheet-close" onClick={onClose} aria-label="关闭">×</button>
        <span className="flow-kicker">COUNCIL NOTES</span>
        <h2>不是替你投票，<br />而是找到真正的拉扯。</h2>
        <div className="summary-points">
          <p><span>共同在保护</span>{council.synthesis.common}</p>
          <p><span>真正的冲突</span>{council.synthesis.conflict}</p>
          <p><span>还缺的证据</span>{council.synthesis.missing}</p>
        </div>
        <article className="action-share-card">
          <header><b>7</b><span><small>DAY EXPERIMENT</small><strong>一个可逆的小实验</strong></span></header>
          <p>{council.action}</p>
          <small>目标不是证明答案正确，而是获得一块现实证据。</small>
          <button onClick={onShare}>分享行动卡 ↗</button>
          {shareState && <em>{shareState}</em>}
        </article>

        <div className="micro-feedback">
          <strong>这次真的帮到你了吗？</strong>
          <div className="score-buttons">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={score === value ? 'selected' : ''} onClick={() => setScore(value)}>{value}</button>)}</div>
          <label><input type="checkbox" checked={wouldReturn} onChange={(event) => setWouldReturn(event.target.checked)} />下次遇到重大选择，我还会回来</label>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="7 天后发生了什么？可回来更新" maxLength={800} />
          <button className="feedback-save" onClick={saveFeedback} disabled={!score || saved}>{saved ? '已保存，谢谢你' : '保存反馈'}</button>
        </div>
      </section>
    </div>
  );
}

function Settings({ token, profile, onBack, onEdit, onDeleted }: {
  token: string;
  profile: Profile;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const stageCount = useMemo(() => profile.stages.length, [profile.stages.length]);

  async function exportData() {
    const response = await fetch(`/api/data?visitorToken=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `回声-我的资料-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteData() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    const response = await fetch(`/api/data?visitorToken=${encodeURIComponent(token)}`, { method: 'DELETE' });
    if (response.ok) onDeleted();
    else setBusy(false);
  }

  return (
    <main className="phone-app settings-screen">
      <header className="simple-topbar"><button onClick={onBack}>←</button><strong>我的资料</strong><span /></header>
      <section className="profile-lite"><div>{profile.name.slice(0, 1)}</div><h1>{profile.name}</h1><p>{profile.currentAge} 岁 · {stageCount} 段真实记忆</p></section>
      <section className="settings-actions">
        <button onClick={onEdit}><span><strong>补充人生线</strong><small>修改年龄、记忆和价值</small></span><b>→</b></button>
        <button onClick={exportData}><span><strong>导出我的资料</strong><small>下载完整可读文件</small></span><b>↓</b></button>
      </section>
      <section className="privacy-lite"><strong>资料与边界</strong><p>资料保存在产品数据库，浏览器只保留随机设备凭证。未来情景不是预测；本产品不替代心理咨询或医疗服务。</p></section>
      <section className="delete-lite">
        <strong>删除全部资料</strong><p>人生阶段、议会、对话和反馈会被永久删除，无法恢复。</p>
        <button className={confirmDelete ? 'confirm' : ''} onClick={deleteData} disabled={busy}>{busy ? '正在删除…' : confirmDelete ? '再次点击，永久删除' : '删除我的全部资料'}</button>
        {confirmDelete && <button className="cancel" onClick={() => setConfirmDelete(false)}>取消</button>}
      </section>
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="phone-app center-state"><div className="pulse-logo">回</div><p>{label}</p></main>;
}

function CreatingScreen({ question }: { question: string }) {
  return (
    <main className="phone-app center-state creating-state">
      <div className="orbit"><span>18</span><span>25</span><span>今</span><span>+3</span><b>回</b></div>
      <h1>正在召集<br />不同阶段的你</h1>
      <p>“{question}”</p>
      <small>过去只引用真实记忆 · 未来只是情景推演</small>
    </main>
  );
}
