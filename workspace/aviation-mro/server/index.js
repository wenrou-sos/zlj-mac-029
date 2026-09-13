const express = require('express');
const cors = require('cors');
const { db, initDb, reloadIfChanged } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 每个请求前检查数据文件是否被外部更新（如 npm run seed），是则热加载，
// 避免内存中的旧副本在下次落盘时覆盖外部变更
app.use((req, res, next) => {
  reloadIfChanged();
  next();
});

app.use('/api/aircraft', require('./routes/aircraft'));
app.use('/api/workcards', require('./routes/workcards'));
app.use('/api/technicians', require('./routes/technicians'));

// 仪表盘统计
app.get('/api/dashboard', (req, res) => {
  const fleetByStatus = db.prepare('SELECT status, COUNT(*) count FROM aircraft GROUP BY status').all();
  const cardsByStatus = db.prepare('SELECT status, COUNT(*) count FROM work_cards GROUP BY status').all();
  const cardsByType = db.prepare('SELECT type, COUNT(*) count FROM work_cards GROUP BY type').all();
  const pendingParts = db.prepare(`
    SELECT p.*, w.card_no, w.title AS card_title, a.registration
    FROM parts_requests p
    JOIN work_cards w ON w.id = p.work_card_id
    JOIN aircraft a ON a.id = w.aircraft_id
    WHERE p.status = '待航材' AND w.status != '已作废' ORDER BY p.requested_at
  `).all();
  const urgentCards = db.prepare(`
    SELECT w.id, w.card_no, w.title, w.priority, w.status, w.due_date, a.registration
    FROM work_cards w JOIN aircraft a ON a.id = w.aircraft_id
    WHERE w.status NOT IN ('已放行', '已作废') AND w.priority IN ('AOG', '加急')
    ORDER BY CASE w.priority WHEN 'AOG' THEN 0 ELSE 1 END, w.due_date
  `).all();
  const recentLogs = db.prepare(`
    SELECT l.*, w.card_no FROM work_logs l
    JOIN work_cards w ON w.id = l.work_card_id
    ORDER BY l.created_at DESC, l.id DESC LIMIT 12
  `).all();
  res.json({ fleetByStatus, cardsByStatus, cardsByType, pendingParts, urgentCards, recentLogs });
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3001;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`✈️  航空机务维修管理系统 API 已启动: http://localhost:${PORT}`);
  });
}).catch((e) => {
  console.error('数据库初始化失败:', e);
  process.exit(1);
});
