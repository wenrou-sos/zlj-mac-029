import { useEffect, useState, createContext, useContext } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import AircraftList from './pages/AircraftList';
import AircraftDetail from './pages/AircraftDetail';
import WorkCardList from './pages/WorkCardList';
import WorkCardDetail from './pages/WorkCardDetail';
import TechnicianList from './pages/TechnicianList';

// 当前操作人（模拟登录态）
const UserContext = createContext(null);
export const useCurrentUser = () => useContext(UserContext);

const CONTROLLER = { id: 0, name: '郑海', role: '生产控制', employee_no: 'PC01' };

export default function App() {
  const [technicians, setTechnicians] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('mro_user');
    return saved ? JSON.parse(saved) : CONTROLLER;
  });

  useEffect(() => {
    api.get('/technicians').then(setTechnicians).catch(console.error);
  }, []);

  const switchUser = (u) => {
    setCurrentUser(u);
    localStorage.setItem('mro_user', JSON.stringify(u));
  };

  return (
    <UserContext.Provider value={currentUser}>
      <div className="layout">
        <aside className="sidebar">
          <div className="logo">
            <span className="logo-icon">✈</span>
            <div>
              <div className="logo-title">祥云航空</div>
              <div className="logo-sub">机务维修管理系统</div>
            </div>
          </div>
          <nav>
            <NavLink to="/" end>📊 维修驾驶舱</NavLink>
            <NavLink to="/aircraft">🛩 飞机档案</NavLink>
            <NavLink to="/workcards">🔧 维修工卡</NavLink>
            <NavLink to="/technicians">👷 维修人员</NavLink>
          </nav>
          <div className="sidebar-footer">MRO System v1.0</div>
        </aside>

        <div className="main">
          <header className="topbar">
            <div className="topbar-title">维修生产管理平台</div>
            <div className="user-switch">
              <span className="muted">当前操作人：</span>
              <select
                value={currentUser.employee_no}
                onChange={(e) => {
                  const no = e.target.value;
                  if (no === 'PC01') switchUser(CONTROLLER);
                  else {
                    const t = technicians.find((t) => t.employee_no === no);
                    if (t) switchUser(t);
                  }
                }}
              >
                <option value="PC01">郑海 · 生产控制</option>
                {technicians.map((t) => (
                  <option key={t.employee_no} value={t.employee_no}>
                    {t.name} · {t.role}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <main className="content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/aircraft" element={<AircraftList />} />
              <Route path="/aircraft/:id" element={<AircraftDetail />} />
              <Route path="/workcards" element={<WorkCardList />} />
              <Route path="/workcards/:id" element={<WorkCardDetail />} />
              <Route path="/technicians" element={<TechnicianList />} />
            </Routes>
          </main>
        </div>
      </div>
    </UserContext.Provider>
  );
}
