import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge } from '../components/Badges';

const AC_STATUSES = ['在役', '停场维修', '定检中'];

export default function AircraftDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ac, setAc] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get(`/aircraft/${id}`).then(setAc).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  const changeStatus = async (status) => {
    try {
      await api.patch(`/aircraft/${id}`, { status });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!ac) return <div className="loading">加载中…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/aircraft" className="back-link">← 返回机队列表</Link>
          <div className="page-title" style={{ marginTop: 6 }}>
            {ac.registration} <span className="muted" style={{ fontSize: 15 }}>{ac.model}</span>{' '}
            <StatusBadge value={ac.status} />
          </div>
        </div>
        <div className="action-bar">
          {AC_STATUSES.filter((s) => s !== ac.status).map((s) => (
            <button key={s} className="btn" onClick={() => changeStatus(s)}>转为{s}</button>
          ))}
          <button className="btn btn-primary" onClick={() => navigate(`/workcards?new=1&aircraft=${ac.id}`)}>
            ＋ 创建工卡
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">✈️ 基本信息</div>
        <div className="detail-meta">
          <div className="meta-item"><div className="k">注册号</div><div className="v">{ac.registration}</div></div>
          <div className="meta-item"><div className="k">机型</div><div className="v">{ac.model}</div></div>
          <div className="meta-item"><div className="k">MSN</div><div className="v mono">{ac.msn}</div></div>
          <div className="meta-item"><div className="k">运营人</div><div className="v">{ac.airline}</div></div>
          <div className="meta-item"><div className="k">出厂日期</div><div className="v">{ac.manufacture_date || '—'}</div></div>
          <div className="meta-item"><div className="k">交付日期</div><div className="v">{ac.delivery_date || '—'}</div></div>
          <div className="meta-item"><div className="k">总飞行小时</div><div className="v">{ac.total_flight_hours.toLocaleString()} FH</div></div>
          <div className="meta-item"><div className="k">总循环</div><div className="v">{ac.total_cycles.toLocaleString()} CY</div></div>
          <div className="meta-item"><div className="k">下次定检</div><div className="v">{ac.next_check_type} / {ac.next_check_date}</div></div>
          <div className="meta-item"><div className="k">主基地</div><div className="v">{ac.base}</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🔧 维修工卡记录（{ac.work_cards.length}）</div>
        {ac.work_cards.length === 0 ? (
          <div className="empty">暂无工卡记录</div>
        ) : (
          <table>
            <thead>
              <tr><th>工卡号</th><th>标题</th><th>类型</th><th>优先级</th><th>状态</th><th>负责人</th><th>期限</th></tr>
            </thead>
            <tbody>
              {ac.work_cards.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => navigate(`/workcards/${c.id}`)}>
                  <td className="mono">{c.card_no}</td>
                  <td>{c.title}</td>
                  <td>{c.type}</td>
                  <td><PriorityBadge value={c.priority} /></td>
                  <td><StatusBadge value={c.status} /></td>
                  <td>{c.assignee_name || <span className="muted">未派工</span>}</td>
                  <td className="muted">{c.due_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
