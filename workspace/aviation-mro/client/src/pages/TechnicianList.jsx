import { useEffect, useState } from 'react';
import { api } from '../api';

const ROLE_STYLE = {
  '放行人员': 'badge-purple',
  '检验员': 'badge-blue',
  '技术员': 'badge-green',
  '机械员': 'badge-gray',
};

export default function TechnicianList() {
  const [techs, setTechs] = useState(null);

  useEffect(() => {
    api.get('/technicians').then(setTechs).catch(console.error);
  }, []);

  if (!techs) return <div className="loading">加载中…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">维修人员</div>
          <div className="page-sub">共 {techs.length} 名持证/在岗人员</div>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>工号</th><th>姓名</th><th>岗位</th><th>执照号</th><th>机型签署</th><th>联系电话</th><th>在手任务</th></tr>
          </thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id}>
                <td className="mono">{t.employee_no}</td>
                <td><strong>{t.name}</strong></td>
                <td><span className={`badge ${ROLE_STYLE[t.role] || 'badge-gray'}`}>{t.role}</span></td>
                <td className="mono">{t.license_no || <span className="muted">—</span>}</td>
                <td>{t.quals}</td>
                <td className="mono">{t.phone}</td>
                <td>{t.active_tasks > 0 ? <span className="badge badge-blue">{t.active_tasks}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
