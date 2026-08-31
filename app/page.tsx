'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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

type Council = {
  id: string;
  question: string;
  category: string;
  responses: CouncilResponse[];
  synthesis: { common: string; conflict: string; missing: string; decisionFrame: string };
  action: string;
  createdAt: string;
};

type Screen = 'loading' | 'onboarding' | 'home' | 'council' | 'settings';

const prompts = ['要不要辞职？', '要不要换一座城市？', '这段关系该继续吗？'];

const emptyStages: Stage[] = [
  { ageLabel: '18', title: '', memory: '', value: '', stageType: 'past' },
  { ageLabel: '25', title: '', memory: '', value: '', stageType: 'past' },
  { ageLabel: '现在', title: '', memory: '', value: '', stageType: 'present' },
];

function deviceToken() {
  const key = 'lifeecho-visitor-token';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function ageOf(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return '今天';
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

function Brand({ onHome }: { onHome: () => void }) {
  return (
    <button className="brand brand-button" onClick={onHome} aria-label="回声首页">
      <span className="brand-mark">回</span>
      <span>回声</span>
    </button>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [token] = useState(() => typeof window === 'undefined' ? '' : deviceToken());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [council, setCouncil] = useState<Council | null>(null);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const id = token || deviceToken();
    Promise.all([
      fetch(`/api/profile?visitorToken=${encodeURIComponent(id)}`).then((response) => response.json()),
      fetch(`/api/council?visitorToken=${encodeURIComponent(id)}`).then((response) => response.json()),
    ])
      .then(([profileData, councilData]) => {
        const loaded = profileData.profile as Profile | null;
        setProfile(loaded);
        setCouncil(councilData.council ?? null);
        setScreen(loaded ? 'home' : 'onboarding');
      })
      .catch(() => {
        setError('暂时无法连接，请刷新后重试。');
        setScreen('onboarding');
      });
  }, [token]);

  async function startCouncil(event?: FormEvent) {
    event?.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    setError('');
    const response = await fetch('/api/council', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, question }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setError(data.error ?? '生成失败，请重试。');
      return;
    }
    setCouncil(data.council);
    setScreen('council');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (screen === 'loading') {
    return (
      <main className="app-shell centered-screen">
        <div className="echo-loader"><span>回</span></div>
        <p>正在找回你的人生线…</p>
      </main>
    );
  }

  if (screen === 'onboarding') {
    return (
      <Onboarding
        token={token}
        existing={editing ? profile : null}
        onCancel={profile ? () => { setEditing(false); setScreen('home'); } : undefined}
        onSaved={(saved) => {
          setProfile(saved);
          setEditing(false);
          setScreen('home');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    );
  }

  if (screen === 'settings' && profile) {
    return (
      <Settings
        token={token}
        profile={profile}
        onBack={() => setScreen('home')}
        onEdit={() => { setEditing(true); setScreen('onboarding'); }}
        onDeleted={() => {
          window.localStorage.removeItem('lifeecho-visitor-token');
          window.location.reload();
        }}
      />
    );
  }

  if (screen === 'council' && council && profile) {
    return <CouncilView council={council} profile={profile} token={token} onBack={() => setScreen('home')} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand onHome={() => setScreen('home')} />
        <button className="profile-button" onClick={() => setScreen('settings')} aria-label="打开个人资料">
          {profile?.name.slice(0, 1) ?? '我'}
        </button>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow"><span /> 你的 {profile?.stages.length ?? 0} 段人生已经点亮</div>
        <h1>今天，想和哪一段<br />自己谈谈？</h1>
        <p>把一个真实选择带进来。过去的你、现在的你和两种可能的未来，会一起帮你看清取舍。</p>

        <form className="question-card" onSubmit={startCouncil}>
          <label htmlFor="question">我正在纠结</label>
          <div className="question-row">
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="例如：我该不该离开现在这份工作？"
              rows={2}
              maxLength={180}
            />
            <button className="start-button" disabled={!question.trim() || busy}>
              {busy ? '生成中' : '开始'}<span>→</span>
            </button>
          </div>
          <div className="prompt-list" aria-label="问题示例">
            {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="privacy-note"><span>◇</span> 只有你能看到。系统不替你做决定，未来内容是情景推演。</div>
        </form>
      </section>

      <section className="timeline-section" aria-labelledby="timeline-title">
        <div className="section-heading">
          <div><span className="kicker">MY TIMELINE</span><h2 id="timeline-title">我的人生线</h2></div>
          <button className="text-button" onClick={() => { setEditing(true); setScreen('onboarding'); }}>管理记忆 <span>→</span></button>
        </div>
        <div className="timeline-track" role="list">
          {profile?.stages.map((stage, index) => (
            <article role="listitem" key={stage.id ?? `${stage.ageLabel}-${index}`} className={`stage-card ${['amber', 'plum', 'blue'][index % 3]}`}>
              <span className="stage-age">{stage.ageLabel}</span>
              <span className="stage-title">{stage.title}</span>
              <span className="stage-note">{stage.value}</span>
              <span className="stage-status">真实记忆 · 可追溯</span>
            </article>
          ))}
          <article className="stage-card future" role="listitem">
            <span className="stage-age">+3年</span>
            <span className="stage-title">两种可能</span>
            <span className="stage-note">不是预言，是情景推演</span>
            <span className="stage-status">情景分支</span>
          </article>
        </div>
      </section>

      <section className="recent-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <div><span className="kicker">LAST COUNCIL</span><h2 id="recent-title">上一次议会</h2></div>
          {council && <span className="date-label">{ageOf(council.createdAt)}</span>}
        </div>
        {council ? (
          <article className="decision-card">
            <AvatarRow />
            <div className="decision-copy">
              <h3>“{council.question}”</h3>
              <p>{council.synthesis.conflict}</p>
            </div>
            <div className="action-pill"><span>7 天实验</span>{council.action}</div>
            <button className="review-button" onClick={() => setScreen('council')}>查看并记录实际发生了什么 <span>→</span></button>
          </article>
        ) : (
          <div className="empty-card"><span>第一场议会还没开始</span><p>答案不会凭空出现，它会引用你刚刚写下的真实记忆。</p></div>
        )}
      </section>

      <BottomNav onHome={() => setScreen('home')} onNew={() => document.getElementById('question')?.focus()} onCouncil={() => council && setScreen('council')} onSettings={() => setScreen('settings')} />
    </main>
  );
}

function Onboarding({ token, existing, onSaved, onCancel }: {
  token: string;
  existing: Profile | null;
  onSaved: (profile: Profile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [age, setAge] = useState(existing?.currentAge ? String(existing.currentAge) : '');
  const [stages, setStages] = useState<Stage[]>(existing?.stages.map((stage) => ({ ...stage })) ?? emptyStages.map((stage) => ({ ...stage })));
  const [consent, setConsent] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function updateStage(index: number, field: keyof Stage, value: string) {
    setStages((current) => current.map((stage, position) => position === index ? { ...stage, [field]: value } : stage));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, name, currentAge: Number(age), stages, consent }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) return setError(data.error ?? '保存失败，请检查后重试。');
    onSaved(data.profile);
  }

  return (
    <main className="app-shell onboarding-shell">
      <header className="topbar">
        <Brand onHome={() => onCancel?.()} />
        <span className="beta-chip">30 人内测</span>
      </header>
      <section className="onboarding-intro">
        <span className="kicker">8 MIN · LIFE MAP</span>
        <h1>{existing ? '更新你的人生线' : '先让“过去的你”有据可依'}</h1>
        <p>参考 Future You 的结构化建档、Rosebud 的记忆追问与 Day One 的时间线：只收集会影响回答的最少信息。</p>
      </section>

      <form className="onboarding-form" onSubmit={save}>
        <section className="form-section identity-grid">
          <label><span>怎么称呼你</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：小林" maxLength={24} required /></label>
          <label><span>现在的年龄</span><input type="number" min="18" max="100" value={age} onChange={(event) => setAge(event.target.value)} placeholder="28" required /></label>
        </section>

        <div className="form-heading">
          <h2>三个真实阶段</h2>
          <p>每段只写一件对你产生过影响的事。过去的阶段不会知道后来才发生的内容。</p>
        </div>

        {stages.map((stage, index) => (
          <section className={`memory-form-card tone-${index}`} key={index}>
            <div className="memory-card-head">
              <span className="step-number">0{index + 1}</span>
              <div><strong>{index === stages.length - 1 ? '现在的我' : '过去的我'}</strong><small>{index === 0 ? '一次离开、选择或觉醒' : index === 1 ? '一次低谷、转折或承担' : '此刻最在意的处境'}</small></div>
            </div>
            <div className="two-fields">
              <label><span>当时年龄</span><input value={stage.ageLabel} onChange={(event) => updateStage(index, 'ageLabel', event.target.value)} maxLength={12} required /></label>
              <label><span>给这段人生一个标题</span><input value={stage.title} onChange={(event) => updateStage(index, 'title', event.target.value)} placeholder="例如：第一次离开家" maxLength={40} required /></label>
            </div>
            <label><span>一段会影响今天选择的真实记忆</span><textarea value={stage.memory} onChange={(event) => updateStage(index, 'memory', event.target.value)} placeholder="发生了什么？你当时做了什么？它怎样改变了你？" rows={4} maxLength={600} required /></label>
            <label><span>那时最想守住什么</span><input value={stage.value} onChange={(event) => updateStage(index, 'value', event.target.value)} placeholder="例如：自由、被看见、家人、安全感" maxLength={60} required /></label>
          </section>
        ))}

        <section className="boundary-card">
          <strong>使用边界</strong>
          <p>这是人生选择反思工具，不是心理咨询、医疗建议或未来预测。系统会保存你主动填写的资料，只有持有本设备凭证的人能访问；你可以随时导出或删除。</p>
          <label className="check-row">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>我已满 18 岁，并同意以上边界与资料处理方式</span>
          </label>
        </section>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="form-actions">
          {onCancel && <button type="button" className="secondary-button" onClick={onCancel}>取消</button>}
          <button className="primary-button" disabled={busy || !consent}>{busy ? '正在保存…' : existing ? '保存人生线' : '点亮我的人生线 →'}</button>
        </div>
      </form>
    </main>
  );
}

function CouncilView({ council, profile, token, onBack }: { council: Council; profile: Profile; token: string; onBack: () => void }) {
  const [active, setActive] = useState(0);
  const [score, setScore] = useState(0);
  const [wouldReturn, setWouldReturn] = useState(true);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = council.responses[active];

  async function saveFeedback(event: FormEvent) {
    event.preventDefault();
    if (!score) return;
    setBusy(true);
    const response = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorToken: token, councilId: council.id, helpfulness: score, wouldReturn, note }),
    });
    setBusy(false);
    if (response.ok) setSaved(true);
  }

  return (
    <main className="app-shell council-shell">
      <header className="topbar">
        <button className="back-button" onClick={onBack}>← 返回</button>
        <span className="trust-label">结构化推演 · 非预测</span>
      </header>
      <section className="council-hero">
        <span className="kicker">SELF COUNCIL · {council.category}</span>
        <h1>“{council.question}”</h1>
        <p>{profile.name}，每个阶段只引用你提供的经历；未来分支都明确标为假设。</p>
      </section>

      <section className="voices-section">
        <div className="voice-tabs" role="tablist" aria-label="人生阶段观点">
          {council.responses.map((response, index) => (
            <button key={response.id} role="tab" aria-selected={active === index} className={active === index ? 'active' : ''} onClick={() => setActive(index)}>
              {response.kind === 'future' ? '+3' : response.label.replace(' 岁的我', '').replace('现在的我', '今')}
            </button>
          ))}
        </div>
        <article className={`voice-card ${current.kind === 'future' ? 'future-voice' : ''}`}>
          <div className="voice-heading"><div><span>{current.label}</span><h2>{current.role}</h2></div><span className="voice-kind">{current.kind === 'future' ? '假设情景' : '你的记忆'}</span></div>
          <blockquote>{current.statement}</blockquote>
          <div className="source-note"><span>来源</span>{current.source}</div>
        </article>
        <div className="voice-progress">{active + 1} / {council.responses.length}</div>
      </section>

      <section className="synthesis-card">
        <span className="kicker">COUNCIL NOTES</span>
        <h2>议会没有替你投票，它找到了拉扯</h2>
        <dl>
          <div><dt>共同在保护</dt><dd>{council.synthesis.common}</dd></div>
          <div><dt>真正的冲突</dt><dd>{council.synthesis.conflict}</dd></div>
          <div><dt>还缺的证据</dt><dd>{council.synthesis.missing}</dd></div>
          <div><dt>怎么判断</dt><dd>{council.synthesis.decisionFrame}</dd></div>
        </dl>
      </section>

      <section className="experiment-card">
        <div className="experiment-top"><span>7</span><div><small>DAY EXPERIMENT</small><h2>先做一个可逆实验</h2></div></div>
        <p>{council.action}</p>
        <div className="experiment-rule">目标不是证明某个答案正确，而是获得一块现实证据。</div>
      </section>

      <form className="feedback-card" onSubmit={saveFeedback}>
        <span className="kicker">PRIVATE BETA FEEDBACK</span>
        <h2>这次议会真的帮到你了吗？</h2>
        <p>你的反馈会直接决定这个产品是否继续开发。</p>
        <div className="score-row" aria-label="帮助程度评分">
          {[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} className={score === value ? 'active' : ''} onClick={() => setScore(value)}>{value}</button>)}
        </div>
        <label className="toggle-row"><input type="checkbox" checked={wouldReturn} onChange={(event) => setWouldReturn(event.target.checked)} /><span>下次遇到重大选择，我还会回来用</span></label>
        <label><span>7 天后发生了什么 / 哪里不像你</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="可现在写，也可以做完实验后再回来更新" maxLength={800} /></label>
        <button className="primary-button" disabled={!score || busy || saved}>{saved ? '已保存，谢谢你' : busy ? '保存中…' : '保存反馈'}</button>
      </form>
      <button className="plain-footer-button" onClick={onBack}>回到今天</button>
    </main>
  );
}

function Settings({ token, profile, onBack, onEdit, onDeleted }: { token: string; profile: Profile; onBack: () => void; onEdit: () => void; onDeleted: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const initials = useMemo(() => profile.name.slice(0, 1), [profile.name]);

  async function exportData() {
    const response = await fetch(`/api/data?visitorToken=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `回声-我的数据-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
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
    <main className="app-shell settings-shell">
      <header className="topbar"><button className="back-button" onClick={onBack}>← 返回</button><span className="trust-label">资料控制</span></header>
      <section className="profile-summary"><div className="profile-large">{initials}</div><h1>{profile.name}</h1><p>{profile.currentAge} 岁 · {profile.stages.length} 段人生记忆</p></section>
      <section className="settings-list">
        <button onClick={onEdit}><span><strong>编辑人生线</strong><small>修改阶段、记忆与价值</small></span><b>→</b></button>
        <button onClick={exportData}><span><strong>导出我的资料</strong><small>下载可读的 JSON 文件</small></span><b>↓</b></button>
      </section>
      <section className="boundary-card settings-boundary"><strong>隐私与安全</strong><p>资料存放在产品数据库，浏览器只保存随机设备凭证。未来情景不是预测；本产品不提供医疗或心理咨询。</p></section>
      <section className="danger-zone">
        <h2>删除所有资料</h2>
        <p>将永久删除人生阶段、历次议会、反馈和匿名事件，无法恢复。</p>
        <button onClick={deleteData} disabled={busy} className={confirmDelete ? 'confirm' : ''}>{busy ? '正在删除…' : confirmDelete ? '再次点击，永久删除' : '删除我的全部资料'}</button>
        {confirmDelete && <button className="cancel-delete" onClick={() => setConfirmDelete(false)}>取消</button>}
      </section>
    </main>
  );
}

function AvatarRow() {
  return <div className="council-avatars" aria-hidden="true"><span>18</span><span>25</span><span>今</span><span>+3</span></div>;
}

function BottomNav({ onHome, onNew, onCouncil, onSettings }: { onHome: () => void; onNew: () => void; onCouncil: () => void; onSettings: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="主要导航">
      <button className="selected" onClick={onHome}><span>⌂</span>今天</button>
      <button onClick={() => document.getElementById('timeline-title')?.scrollIntoView()}><span>◌</span>人生线</button>
      <button aria-label="新议会" onClick={onNew}><span>＋</span></button>
      <button onClick={onCouncil}><span>□</span>决策</button>
      <button onClick={onSettings}><span>·</span>我的</button>
    </nav>
  );
}
