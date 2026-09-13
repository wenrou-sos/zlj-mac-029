const express = require('express');
const { db, addLog } = require('../db');

const router = express.Router();

// 机队列表（含每架飞机未关闭工卡数）
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM work_cards w
        WHERE w.aircraft_id = a.id AND w.status != '已放行') AS open_cards
    FROM aircraft a ORDER BY a.registration
  `).all();
  res.json(rows);
});

// 单机档案：基本信息 + 工卡历史
router.get('/:id', (req, res) => {
  const ac = db.prepare('SELECT * FROM aircraft WHERE id = ?').get(req.params.id);
  if (!ac) return res.status(404).json({ error: '飞机不存在' });
  const cards = db.prepare(`
    SELECT w.*, t.name AS assignee_name
    FROM work_cards w LEFT JOIN technicians t ON t.id = w.assigned_to
    WHERE w.aircraft_id = ? ORDER BY w.created_at DESC
  `).all(req.params.id);
  res.json({ ...ac, work_cards: cards });
});

// 新增飞机
router.post('/', (req, res) => {
  const { registration, model, msn, airline, manufacture_date, delivery_date,
    total_flight_hours, total_cycles, next_check_type, next_check_date, base } = req.body;
  if (!registration || !model || !msn) {
    return res.status(400).json({ error: '注册号、机型、MSN 为必填项' });
  }
  try {
    const info = db.prepare(`
      INSERT INTO aircraft (registration, model, msn, airline, manufacture_date, delivery_date,
        total_flight_hours, total_cycles, next_check_type, next_check_date, base)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(registration, model, msn, airline || '祥云航空', manufacture_date, delivery_date,
      total_flight_hours || 0, total_cycles || 0, next_check_type, next_check_date, base || 'PEK');
    res.status(201).json(db.prepare('SELECT * FROM aircraft WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: `注册号 ${registration} 已存在` });
    }
    throw e;
  }
});

// 更新飞机状态 / 飞行数据
router.patch('/:id', (req, res) => {
  const ac = db.prepare('SELECT * FROM aircraft WHERE id = ?').get(req.params.id);
  if (!ac) return res.status(404).json({ error: '飞机不存在' });
  const fields = ['status', 'total_flight_hours', 'total_cycles', 'next_check_type', 'next_check_date', 'base'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: '没有可更新的字段' });
  const sql = `UPDATE aircraft SET ${updates.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...updates.map(f => req.body[f]), req.params.id);
  res.json(db.prepare('SELECT * FROM aircraft WHERE id = ?').get(req.params.id));
});

module.exports = router;
