import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge } from '../components/Badges';
import Modal from '../components/Modal';
import { useCurrentUser } from '../App';

const STATUSES = ['待派工', '进行中', '缺件挂起', '待放行', '已放行', '已作废'];
const TYPES = ['航线维修', '定检', '时控件更换', '故障排除', '改装'];

export default function WorkCardList() {
  const [cards, setCards] = useState(null);
  const [fleet, setFleet] = useState([]);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const load = () => {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (priority) q.set('priority', priority);
    api.get(`/workcards?${q}`).then(setCards).catch(console.error);
  };
  useEffect(load, [status, priority]);
  useEffect(() => {
    api.get('/aircraft').then(setFleet);
    if (searchParams.get('new') === '1') setShowNew(true);
  }, []);

  if (!cards) return <div className="loading">加载中…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">维修工卡</div>
          <div className="page-sub">共 {cards.length} 张工卡</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>＋ 创建工卡</button>
      </div>

      <div className="card">
        <div className="filters" style={{ marginBottom: 14 }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">全部（不含已作废）</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">全部优先级</option>
            <option>AOG</option><option>加急</option><option>正常</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>工卡号</th><th>飞机</th><th>标题</th><th>类型</th>
              <th>优先级</th><th>状态</th><th>负责人</th><th>期限</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => navigate(`/workcards/${c.id}`)}>
                <td className="mono">{c.card_no}</td>
                <td><strong>{c.registration}</strong></td>
                <td>{c.title}</td>
                <td>{c.type}</td>
                <td><PriorityBadge value={c.priority} /></td>
                <td><StatusBadge value={c.status} /></td>
                <td>{c.assignee_name || <span className="muted">未派工</span>}</td>
                <td className="muted">{c.due_date}</td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr><td colSpan={8}><div className="empty">没有符合条件的工卡</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCardModal
          fleet={fleet}
          defaultAircraft={searchParams.get('aircraft') || ''}
          onClose={() => setShowNew(false)}
          onCreated={(card) => navigate(`/workcards/${card.id}`)}
        />
      )}
    </div>
  );
}

function NewCardModal({ fleet, defaultAircraft, onClose, onCreated }) {
  const currentUser = useCurrentUser();
  const [form, setForm] = useState({
    aircraft_id: defaultAircraft, title: '', type: '航线维修',
    priority: '正常', due_date: '', description: '',
  });
  const [steps, setSteps] = useState([{ content: '', standard: '' }]);
  const [error, setError] = useState('');

  const setStep = (i, key, val) => {
    const next = [...steps];
    next[i] = { ...next[i], [key]: val };
    setSteps(next);
  };

  const submit = async () => {
    setError('');
    const validSteps = steps.filter((s) => s.content.trim());
    if (!form.aircraft_id || !form.title.trim() || validSteps.length === 0) {
      return setError('请填写飞机、标题，并至少填写一个步骤');
    }
    try {
      const card = await api.post('/workcards', {
        ...form,
        steps: validSteps,
        created_by: currentUser.role === '生产控制' ? `生产控制-${currentUser.name}` : currentUser.name,
      });
      onCreated(card);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Modal title="创建维修工卡" onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        <div className="form-row">
          <label>飞机 *</label>
          <select value={form.aircraft_id} onChange={(e) => setForm({ ...form, aircraft_id: e.target.value })}>
            <option value="">请选择</option>
            {fleet.map((a) => (
              <option key={a.id} value={a.id}>{a.registration} · {a.model}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>工卡类型</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label>优先级</label>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option>正常</option><option>加急</option><option>AOG</option>
          </select>
        </div>
        <div className="form-row">
          <label>完成期限</label>
          <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>
      </div>
      <div className="form-row">
        <label>工卡标题 *</label>
        <input value={form.title} placeholder="如：左发滑油泵更换"
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="form-row">
        <label>故障描述 / 工作说明</label>
        <textarea value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>

      <div className="form-row">
        <label>施工步骤 *</label>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ flex: 3 }} placeholder={`步骤 ${i + 1} 内容`}
              value={s.content} onChange={(e) => setStep(i, 'content', e.target.value)} />
            <input style={{ flex: 2 }} placeholder="依据标准（如 AMM 章节）"
              value={s.standard} onChange={(e) => setStep(i, 'standard', e.target.value)} />
            <button className="btn btn-sm btn-danger" type="button"
              onClick={() => setSteps(steps.filter((_, j) => j !== i))}
              disabled={steps.length === 1}>删</button>
          </div>
        ))}
        <button className="btn btn-sm" type="button"
          onClick={() => setSteps([...steps, { content: '', standard: '' }])}>
          ＋ 添加步骤
        </button>
      </div>

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit}>创建工卡</button>
      </div>
    </Modal>
  );
}
