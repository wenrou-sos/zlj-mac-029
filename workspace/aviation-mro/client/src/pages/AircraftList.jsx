import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge } from '../components/Badges';
import Modal from '../components/Modal';

const EMPTY_FORM = {
  registration: '', model: '', msn: '', airline: '祥云航空',
  manufacture_date: '', delivery_date: '', total_flight_hours: 0,
  total_cycles: 0, next_check_type: 'A检', next_check_date: '', base: 'PEK',
};

export default function AircraftList() {
  const [fleet, setFleet] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => api.get('/aircraft').then(setFleet).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setError('');
    try {
      await api.post('/aircraft', form);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!fleet) return <div className="loading">加载中…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">飞机档案</div>
          <div className="page-sub">机队共 {fleet.length} 架飞机</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>＋ 新增飞机</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>注册号</th><th>机型</th><th>MSN</th><th>飞行小时</th><th>循环</th>
              <th>状态</th><th>下次定检</th><th>基地</th><th>未关闭工卡</th>
            </tr>
          </thead>
          <tbody>
            {fleet.map((a) => (
              <tr key={a.id} className="clickable" onClick={() => navigate(`/aircraft/${a.id}`)}>
                <td><strong>{a.registration}</strong></td>
                <td>{a.model}</td>
                <td className="mono">{a.msn}</td>
                <td>{a.total_flight_hours.toLocaleString()} FH</td>
                <td>{a.total_cycles.toLocaleString()} CY</td>
                <td><StatusBadge value={a.status} /></td>
                <td>{a.next_check_type} <span className="muted">{a.next_check_date}</span></td>
                <td>{a.base}</td>
                <td>{a.open_cards > 0 ? <span className="badge badge-amber">{a.open_cards}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="新增飞机档案" onClose={() => setShowAdd(false)}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-grid">
            <div className="form-row">
              <label>注册号 *</label>
              <input value={form.registration} placeholder="B-XXXX"
                onChange={(e) => setForm({ ...form, registration: e.target.value })} />
            </div>
            <div className="form-row">
              <label>机型 *</label>
              <input value={form.model} placeholder="如 A320neo"
                onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="form-row">
              <label>MSN *</label>
              <input value={form.msn} placeholder="制造商序列号"
                onChange={(e) => setForm({ ...form, msn: e.target.value })} />
            </div>
            <div className="form-row">
              <label>主基地</label>
              <input value={form.base}
                onChange={(e) => setForm({ ...form, base: e.target.value })} />
            </div>
            <div className="form-row">
              <label>出厂日期</label>
              <input type="date" value={form.manufacture_date}
                onChange={(e) => setForm({ ...form, manufacture_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label>交付日期</label>
              <input type="date" value={form.delivery_date}
                onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} />
            </div>
            <div className="form-row">
              <label>总飞行小时</label>
              <input type="number" value={form.total_flight_hours}
                onChange={(e) => setForm({ ...form, total_flight_hours: Number(e.target.value) })} />
            </div>
            <div className="form-row">
              <label>总循环</label>
              <input type="number" value={form.total_cycles}
                onChange={(e) => setForm({ ...form, total_cycles: Number(e.target.value) })} />
            </div>
            <div className="form-row">
              <label>下次定检级别</label>
              <select value={form.next_check_type}
                onChange={(e) => setForm({ ...form, next_check_type: e.target.value })}>
                <option>A检</option><option>C检</option><option>D检</option>
              </select>
            </div>
            <div className="form-row">
              <label>下次定检日期</label>
              <input type="date" value={form.next_check_date}
                onChange={(e) => setForm({ ...form, next_check_date: e.target.value })} />
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setShowAdd(false)}>取消</button>
            <button className="btn btn-primary" onClick={submit}>保存</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
