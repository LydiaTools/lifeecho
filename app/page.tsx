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

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const prompts = ['我已经很努力，为什么还是想逃？', '这段关系让我越来越不像自己', '我想重新开始，又怕来不及'];
const feelings = [
  { label: '有点累', tone: 'coral' },
  { label: '很委屈', tone: 'rose' },
  { label: '舍不得', tone: 'butter' },
  { label: '没方向', tone: 'sky' },
  { label: '想改变', tone: 'sage' },
];
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
  return <span className="lite-logo"><strong>回声</strong><small>人生中的每一个我</small></span>;
}

export default function Home() {
  const [token] = useState(() => typeof window === 'undefined' ? '' : getDeviceToken());
  const [screen, setScreen] = useState<Screen>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [council, setCouncil] = useState<Council | null>(null);
  const [question, setQuestion] = useState('');
  const [feeling, setFeeling] = useState('');
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

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

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
    track('question_started', { hasProfile: Boolean(profile), feeling: feeling || '未选择' });
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
        body: JSON.stringify({ visitorToken: token, question, feeling }),
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
      feeling={feeling}
      error={error}
      onQuestion={setQuestion}
      onFeeling={setFeeling}
      onBegin={begin}
      onOpenCouncil={() => council && setScreen('council')}
      onSettings={() => profile && setScreen('settings')}
    />
  );
}

function AskScreen({ profile, council, question, feeling, error, onQuestion, onFeeling, onBegin, onOpenCouncil, onSettings }: {
  profile: Profile | null;
  council: Council | null;
  question: string;
  feeling: string;
  error: string;
  onQuestion: (value: string) => void;
  onFeeling: (value: string) => void;
  onBegin: (event: FormEvent) => void;
  onOpenCouncil: () => void;
  onSettings: () => void;
}) {
  const [previewStage, setPreviewStage] = useState(profile ? 2 : 0);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }
  const lifeMoments = profile ? [
    ...profile.stages.slice(0, 3).map((stage, index) => ({
      age: stage.ageLabel,
      role: index === 2 ? '此刻的我' : stage.title,
      whisper: stage.memory,
    })),
    { age: '+3', role: '还没见面的我', whisper: '我不替你预测结局，只陪你看见另一种可能。' },
  ] : [
    { age: '18', role: '敢出发的我', whisper: '还记得吗？你第一次按自己的心意做了选择。' },
    { age: '25', role: '学会失去的我', whisper: '有些离开没有让你变坏，只让你更知道自己要什么。' },
    { age: '今', role: '正在撑住的我', whisper: '你已经走了很远，今晚可以先不用表现得很坚强。' },
    { age: '+3', role: '还没见面的我', whisper: '我没有标准答案，但我知道你比想象中更有力量。' },
  ];
  const currentMoment = lifeMoments[Math.min(previewStage, lifeMoments.length - 1)];

  return (
    <main className="phone-app ask-screen">
      <header className="lite-topbar">
        <Logo />
        {profile ? <button className="round-icon" onClick={onSettings} aria-label="打开我的记忆匣">{profile.name.slice(0, 1)}</button> : <span className="beta-pill">仅你可见</span>}
      </header>

      <section className="ask-main">
        <section className="emotional-hero">
          <div className="hero-image" aria-hidden="true" />
          <div className="hero-copy">
            <div className="time-chip"><span />写给一路走到今天的你</div>
            <h1>{profile ? `${profile.name}，` : ''}你不是突然<br />走到今天的。</h1>
            <p>你曾经勇敢过，也曾一个人熬过很长的夜。那些一路走来的你，没有离开。</p>
          </div>
          <div className="hero-stage-trail" aria-hidden="true"><span>18</span><i /><span>25</span><i /><span>现在</span><i /><span>以后</span></div>
        </section>

        <div className="opening-note"><span>今晚，让她们回来陪你说说话。</span><p>有些答案，不在别人那里。它藏在你曾经作过的选择、失去过的人和重新站起来的时刻里。</p></div>

        <section className="life-thread-card" aria-label="我的人生阶段">
          <div className="thread-heading"><span>她们一直在这里</span><small>轻触，听见她</small></div>
          <div className="life-thread">
            <i className="thread-line" aria-hidden="true" />
            {lifeMoments.map((moment, index) => (
              <button
                type="button"
                key={`${moment.age}-${index}`}
                className={`life-stage tone-${index} ${previewStage === index ? 'selected' : ''}`}
                aria-pressed={previewStage === index}
                onClick={() => setPreviewStage(index)}
              >
                <span className="stage-orb"><i /><b>{moment.age}</b></span>
                <small>{moment.role}</small>
              </button>
            ))}
          </div>
          <p className="stage-whisper" key={currentMoment.age}><span>{currentMoment.age === '今' || currentMoment.age === '现在' ? '现在的你' : currentMoment.age.startsWith('+') ? '三年后的你' : `${currentMoment.age} 岁的你`}</span>“{currentMoment.whisper}”</p>
        </section>

        <form className="ask-card" onSubmit={onBegin}>
          <div className="ask-card-intro"><span>今晚想说的话</span><strong>不用想清楚，先把它说出来。</strong></div>
          <fieldset className="feeling-picker">
            <legend>这一刻，你的心更接近哪一种？</legend>
            <div>{feelings.map((item) => (
              <button type="button" key={item.label} className={`${item.tone} ${feeling === item.label ? 'selected' : ''}`} onClick={() => onFeeling(feeling === item.label ? '' : item.label)} aria-pressed={feeling === item.label}>
                <i />{item.label}
              </button>
            ))}</div>
          </fieldset>
          <label htmlFor="life-question">把最放不下的那件事，交给她们</label>
          <textarea
            id="life-question"
            value={question}
            onChange={(event) => onQuestion(event.target.value)}
            placeholder="不用组织语言。就从“其实我……”开始。"
            rows={3}
            maxLength={180}
          />
          <div className="suggestion-row" aria-label="问题示例">
            {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => onQuestion(prompt)}>{prompt}</button>)}
          </div>
          {error && <p className="lite-error" role="alert">{error}</p>}
          <button className="main-cta" disabled={question.trim().length < 4}>让她们来见我 <span>→</span></button>
        </form>

        <div className="trust-strip">
          <span>无需注册</span><i /> <span>只有你看得到</span><i /> <span>约 2 分钟</span>
        </div>
        {installPrompt && (
          <button className="install-prompt" type="button" onClick={installApp}>
            <span><strong>安装“回声”到手机</strong><small>添加到安卓桌面，下次直接打开</small></span>
            <b>安装</b>
          </button>
        )}
      </section>

      {council && (
        <button className="recent-mini" onClick={onOpenCouncil}>
          <span><small>{timeAgo(council.createdAt)}，你们聊过</small><strong>“{council.question}”</strong></span>
          <b>再听听她们 →</b>
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
          <span className="flow-kicker">开始重逢前 · 20 秒</span>
          <h1>先让我知道，<br />该怎么叫你。</h1>
          <p>不需要注册。你留在这里的故事，只属于你。</p>
          <div className="compact-fields">
            <label><span>怎么称呼你</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="我" /></label>
            <label><span>现在年龄</span><input type="number" min="18" max="100" value={age} onChange={(event) => setAge(event.target.value)} inputMode="numeric" placeholder="28" /></label>
          </div>
          <label className="consent-card">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span><strong>我已满 18 岁，也愿意照顾好自己的边界</strong><small>这里陪你整理感受与选择，不替代心理咨询、医疗建议，也不预测未来。你可以随时带走或删除资料。</small></span>
          </label>
        </section>
      ) : (
        <section className="setup-panel memory-panel">
          <span className="flow-kicker">{blueprint.eyebrow}</span>
          <h1>{blueprint.question}</h1>
          <p>{blueprint.hint}</p>
          <label className="memory-input">
            <span>把那天留给她</span>
            <textarea value={stage.memory} onChange={(event) => patchStage(stageIndex, { memory: event.target.value })} rows={6} maxLength={600} placeholder="我记得……" autoFocus />
          </label>
          {stageIndex < 2 && (
            <label className="age-inline"><span>那时大约</span><input value={stage.ageLabel} onChange={(event) => patchStage(stageIndex, { ageLabel: event.target.value })} maxLength={12} /><span>岁</span></label>
          )}
          <fieldset className="value-picker">
            <legend>那时的你，最想守住什么？</legend>
            <div>{blueprint.values.map((value) => <button type="button" key={value} className={stage.value === value ? 'selected' : ''} onClick={() => patchStage(stageIndex, { value })}>{value}</button>)}</div>
            <input value={blueprint.values.includes(stage.value) ? '' : stage.value} onChange={(event) => patchStage(stageIndex, { value: event.target.value })} placeholder="或自己写一个词" maxLength={60} />
          </fieldset>
        </section>
      )}

      <footer className="flow-footer">
        {error && <p className="lite-error" role="alert">{error}</p>}
        <button className="main-cta" onClick={next} disabled={busy}>{busy ? '正在把记忆轻轻收好…' : step === 3 ? '让她们来见我 →' : '继续，想起下一段 →'}</button>
        <small>{step === 0 ? '只有这台设备能打开你的记忆匣' : '每一个过去的你，都只会记得她真正经历过的事'}</small>
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
    const text = `今晚，我和不同年龄的自己聊了一会儿。\n\n我终于说出口：${council.question}\n\n接下来七天，我想为自己做一件小事：${council.action}\n\n答案可以慢一点来，但我不会再把自己的声音弄丢。`;
    try {
      if (navigator.share) await navigator.share({ title: '今晚的回声', text });
      else {
        await navigator.clipboard.writeText(text);
        setShareState('已复制，愿意的话，可以分享到小红书');
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
        <span><strong>来自不同年龄的回信</strong><small>{council.category} · 今晚只听真实的声音</small></span>
        <button className="summary-icon" onClick={() => setShowSummary(true)} aria-label="查看今晚想带走的话">带走</button>
      </header>

      <section className="chat-scroll">
        <div className="user-question"><span>你</span><p>{council.question}</p></div>
        <p className="system-note">她们从你的真实记忆里来 · 三年后的她只代表一种可能</p>

        <div className="stage-switcher" role="tablist" aria-label="选择人生阶段">
          {council.responses.map((response, index) => (
            <button key={response.id} role="tab" aria-selected={active === index} className={active === index ? 'selected' : ''} onClick={() => { setActive(index); setMessage(''); setError(''); }}>
              <b>{response.kind === 'future' ? '+3' : response.label.replace(' 岁的我', '').replace('现在的我', '今')}</b>
              <small>{response.kind === 'future' ? (index === council.responses.length - 2 ? '改变' : '维持') : response.role.slice(0, 6)}</small>
            </button>
          ))}
        </div>

        <article className={`stage-message ${current.kind === 'future' ? 'future-message' : ''}`}>
          <div className="letter-tape" aria-hidden="true" />
          <header><span><b>{current.label}</b><small>{current.role}</small></span><em>{current.kind === 'future' ? '写自一种可能' : '写自你的记忆'}</em></header>
          <p>{current.statement}</p>
          <details><summary>她为什么会这样说</summary><div>{current.source}</div></details>
        </article>

        {currentTurns.map((turn) => (
          <div className="turn-pair" key={turn.id}>
            <div className="turn-user">{turn.userMessage}</div>
            <div className="turn-stage"><span>{current.label}</span>{turn.stageReply}</div>
          </div>
        ))}

        <button className="summary-teaser" onClick={() => setShowSummary(true)}>
          <span><small>她们都说完了</small><strong>把今晚最重要的一句话带走</strong></span><b>→</b>
        </button>
        <div id="chat-end" />
      </section>

      <form className="chat-composer" onSubmit={ask}>
        {error && <p className="composer-error">{error}</p>}
        <div><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder={`回${current.label}一句…`} maxLength={400} /><button aria-label="寄出这句话" disabled={busy || message.trim().length < 2}>{busy ? '…' : '↑'}</button></div>
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
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="写给今晚的我">
      <section className="summary-sheet">
        <button className="sheet-close" onClick={onClose} aria-label="关闭">×</button>
        <span className="flow-kicker">写给今晚的我</span>
        <h2>你不是没有答案，<br />只是太久没听见自己。</h2>
        <div className="summary-points">
          <p><span>她们都在护着</span>{council.synthesis.common}</p>
          <p><span>让你舍不得的</span>{council.synthesis.conflict}</p>
          <p><span>此刻还不用急</span>{council.synthesis.missing}</p>
        </div>
        <article className="action-share-card">
          <header><b>7</b><span><small>给自己七天</small><strong>明天开始的一小步</strong></span></header>
          <p>{council.action}</p>
          <small>不需要立刻做对。只需要为自己多找一小块真实的证据。</small>
          <button onClick={onShare}>收藏 / 分享给未来的我 ↗</button>
          {shareState && <em>{shareState}</em>}
        </article>

        <div className="micro-feedback">
          <strong>今晚，你有更靠近自己一点吗？</strong>
          <div className="score-buttons">{[1, 2, 3, 4, 5].map((value) => <button key={value} className={score === value ? 'selected' : ''} onClick={() => setScore(value)}>{value}</button>)}</div>
          <label><input type="checkbox" checked={wouldReturn} onChange={(event) => setWouldReturn(event.target.checked)} />下一次心里很乱时，我愿意再回来坐一会儿</label>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="想给七天后的自己留一句什么？" maxLength={800} />
          <button className="feedback-save" onClick={saveFeedback} disabled={!score || saved}>{saved ? '这句话已经替你收好' : '替我收好这句话'}</button>
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
      <header className="simple-topbar"><button onClick={onBack}>←</button><strong>我的记忆匣</strong><span /></header>
      <section className="profile-lite"><div>{profile.name.slice(0, 1)}</div><h1>{profile.name}</h1><p>{profile.currentAge} 岁 · {stageCount} 段真实记忆</p></section>
      <section className="settings-actions">
        <button onClick={onEdit}><span><strong>补充我的人生线</strong><small>有些故事，想起来以后还可以慢慢加</small></span><b>→</b></button>
        <button onClick={exportData}><span><strong>带走我的故事</strong><small>下载一份只属于你的完整记录</small></span><b>↓</b></button>
      </section>
      <section className="privacy-lite"><strong>你的故事，永远属于你</strong><p>浏览器只保留随机设备凭证。未来情景不是预测；这里也不替代心理咨询或医疗服务。</p></section>
      <section className="delete-lite">
        <strong>删除全部资料</strong><p>人生阶段、议会、对话和反馈会被永久删除，无法恢复。</p>
        <button className={confirmDelete ? 'confirm' : ''} onClick={deleteData} disabled={busy}>{busy ? '正在删除…' : confirmDelete ? '再次点击，永久删除' : '删除我的全部资料'}</button>
        {confirmDelete && <button className="cancel" onClick={() => setConfirmDelete(false)}>取消</button>}
      </section>
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <main className="phone-app center-state"><div className="pulse-logo">回</div><p>{label}</p><small>那些走过的路，都没有白费</small></main>;
}

function CreatingScreen({ question }: { question: string }) {
  return (
    <main className="phone-app center-state creating-state">
      <div className="chapter-loading" aria-hidden="true"><span>18</span><i /><span>25</span><i /><span>今</span><i /><span>+3</span></div>
      <h1>正在整理你一路走来的声音。</h1>
      <p>“{question}”</p>
      <small>过去只带来她经历过的事 · 未来只是一种可能</small>
    </main>
  );
}
