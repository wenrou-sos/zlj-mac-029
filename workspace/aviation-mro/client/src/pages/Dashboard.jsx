import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge } from '../components/Badges';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert alert-error">无法连接后端服务：{error}</div>;
  if (!data) return <div className="loading">加载中…</div>;

  const stat = (list, key) => list.find((x) => x.status === key)?.count || 0;
  const fleetTotal = data.fleetByStatus.reduce((s, x) => s + x.count, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">维修驾驶舱</div>
          <div className="page-sub">机队状态与维修生产实时概览</div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">机队规模</div>
          <div className="stat-value">{fleetTotal}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">在役飞机</div>
          <div className="stat-value green">{stat(data.fleetByStatus, '在役')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">进行中工卡</div>
          <div className="stat-value blue">{stat(data.cardsByStatus, '进行中')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">缺件挂起</div>
          <div className="stat-value amber">{stat(data.cardsByStatus, '缺件挂起')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">待放行</div>
          <div className="stat-value red">{stat(data.cardsByStatus, '待放行')}</div>
        </div>
      </div>

      <div className="grid-3-2">
        <div>
          <div className="card">
            <div className="card-title">⚠️ 紧急工卡（AOG / 加急）</div>
            {data.urgentCards.length === 0 ? (
              <div className="empty">当前无紧急工卡</div>
            ) : (
              <table>
                <thead>
                  <tr><th>工卡号</th><th>飞机</th><th>标题</th><th>优先级</th><th>状态</th><th>期限</th></tr>
                </thead>
                <tbody>
                  {data.urgentCards.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">
                        <Link to={`/workcards/${c.id}`} className="back-link">{c.card_no}</Link>
                      </td>
                      <td>{c.registration}</td>
                      <td>{c.title}</td>
                      <td><PriorityBadge value={c.priority} /></td>
                      <td><StatusBadge value={c.status} /></td>
                      <td className="muted">{c.due_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-title">📦 待航材缺件</div>
            {data.pendingParts.length === 0 ? (
              <div className="empty">当前无待航材缺件</div>
            ) : (
              <table>
                <thead>
                  <tr><th>件号</th><th>件名</th><th>数量</th><th>关联工卡</th><th>飞机</th></tr>
                </thead>
                <tbody>
                  {data.pendingParts.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.part_no}</td>
                      <td>{p.part_name}</td>
                      <td>× {p.quantity}</td>
                      <td className="mono">
                        <Link to={`/workcards/${p.work_card_id}`} className="back-link">{p.card_no}</Link>
                      </td>
                      <td>{p.registration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-title">🕒 最新动态</div>
          <div className="timeline">
            {data.recentLogs.map((l) => (
              <div className="timeline-item" key={l.id}>
                <div className="timeline-action">
                  {l.action} · <span className="mono">{l.card_no}</span>
                </div>
                <div className="timeline-detail">{l.actor} — {l.detail}</div>
                <div className="timeline-time">{l.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
