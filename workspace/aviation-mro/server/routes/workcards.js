const express = require('express');
const { db, addLog } = require('../db');

const router = express.Router();

const CARD_DETAIL_SQL = `
  SELECT w.*, a.registration, a.model, a.base,
         t.name AS assignee_name, t.employee_no AS assignee_no, t.role AS assignee_role
  FROM work_cards w
  JOIN aircraft a ON a.id = w.aircraft_id
  LEFT JOIN technicians t ON t.id = w.assigned_to
`;

function getCardFull(id) {
  const card = db.prepare(CARD_DETAIL_SQL + ' WHERE w.id = ?').get(id);
  if (!card) return null;
  card.steps = db.prepare(`
    SELECT s.*, t.name AS signer_name, t.employee_no AS signer_no
    FROM work_card_steps s LEFT JOIN technicians t ON t.id = s.signed_by
    WHERE s.work_card_id = ? ORDER BY s.seq
  `).all(id);
  card.parts = db.prepare('SELECT * FROM parts_requests WHERE work_card_id = ? ORDER BY id').all(id);
  card.release = db.prepare(`
    SELECT r.*, t.name AS releaser_name, t.license_no
    FROM release_records r JOIN technicians t ON t.id = r.released_by
    WHERE r.work_card_id = ?
  `).get(id);
  card.logs = db.prepare('SELECT * FROM work_logs WHERE work_card_id = ? ORDER BY created_at DESC, id DESC').all(id);
  return card;
}

// 工卡列表，支持 ?status= &aircraft_id= &priority= 过滤
router.get('/', (req, res) => {
  const { status, aircraft_id, priority } = req.query;
  let sql = CARD_DETAIL_SQL + ' WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND w.status = ?'; params.push(status); }
  if (aircraft_id) { sql += ' AND w.aircraft_id = ?'; params.push(aircraft_id); }
  if (priority) { sql += ' AND w.priority = ?'; params.push(priority); }
  sql += ' ORDER BY CASE w.priority WHEN \'AOG\' THEN 0 WHEN \'加急\' THEN 1 ELSE 2 END, w.due_date';
  res.json(db.prepare(sql).all(...params));
});

// 工卡详情
router.get('/:id', (req, res) => {
  const card = getCardFull(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  res.json(card);
});

// 创建工卡（含步骤）
router.post('/', (req, res) => {
  const { aircraft_id, title, type, priority, description, due_date, steps, created_by } = req.body;
  if (!aircraft_id || !title || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: '飞机、标题、至少一个步骤为必填项' });
  }
  const ac = db.prepare('SELECT * FROM aircraft WHERE id = ?').get(aircraft_id);
  if (!ac) return res.status(404).json({ error: '飞机不存在' });

  const tx = db.transaction(() => {
    const seq = db.prepare("SELECT COUNT(*) c FROM work_cards WHERE card_no LIKE 'WC-2026-%'").get().c + 1;
    const cardNo = `WC-2026-${String(900 + seq).padStart(4, '0')}`;
    const info = db.prepare(`
      INSERT INTO work_cards (card_no, aircraft_id, title, type, priority, status, description, created_by, due_date)
      VALUES (?, ?, ?, ?, ?, '待派工', ?, ?, ?)
    `).run(cardNo, aircraft_id, title, type || '航线维修', priority || '正常',
      description || '', created_by || '生产控制', due_date || null);
    const cardId = info.lastInsertRowid;
    const insStep = db.prepare('INSERT INTO work_card_steps (work_card_id, seq, content, standard) VALUES (?, ?, ?, ?)');
    steps.forEach((s, i) => insStep.run(cardId, i + 1, s.content, s.standard || ''));
    addLog(cardId, created_by || '生产控制', '创建工卡', `${type || '航线维修'} / ${priority || '正常'}`);
    if (priority === 'AOG') {
      db.prepare("UPDATE aircraft SET status = '停场维修' WHERE id = ?").run(aircraft_id);
      addLog(cardId, '系统', '状态联动', `AOG 工卡，${ac.registration} 转为停场维修`);
    }
    return cardId;
  });
  const cardId = tx();
  res.status(201).json(getCardFull(cardId));
});

// 派工
router.post('/:id/assign', (req, res) => {
  const { technician_id, operator } = req.body;
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status !== '待派工') return res.status(409).json({ error: `当前状态为「${card.status}」，不能派工` });
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technician_id);
  if (!tech) return res.status(404).json({ error: '维修人员不存在' });

  db.prepare("UPDATE work_cards SET assigned_to = ?, status = '进行中' WHERE id = ?").run(technician_id, card.id);
  addLog(card.id, operator || '生产控制', '派工', `派工给 ${tech.name}(${tech.employee_no})`);
  res.json(getCardFull(card.id));
});

// 步骤签署
router.post('/:id/steps/:stepId/sign', (req, res) => {
  const { technician_id } = req.body;
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status === '缺件挂起') return res.status(409).json({ error: '工卡处于缺件挂起状态，航材到货后才能继续施工' });
  if (card.status !== '进行中') return res.status(409).json({ error: `当前状态为「${card.status}」，不能签署步骤` });
  if (card.assigned_to !== Number(technician_id)) {
    return res.status(403).json({ error: '只有被派工人才能签署本工卡步骤' });
  }
  const step = db.prepare('SELECT * FROM work_card_steps WHERE id = ? AND work_card_id = ?').get(req.params.stepId, card.id);
  if (!step) return res.status(404).json({ error: '步骤不存在' });
  if (step.status === '已签署') return res.status(409).json({ error: '该步骤已签署' });
  const prevUnsigned = db.prepare(
    "SELECT COUNT(*) c FROM work_card_steps WHERE work_card_id = ? AND seq < ? AND status = '待执行'"
  ).get(card.id, step.seq).c;
  if (prevUnsigned > 0) return res.status(409).json({ error: '请按顺序签署，前序步骤尚未完成' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE work_card_steps SET status = '已签署', signed_by = ?, signed_at = datetime('now','localtime') WHERE id = ?")
      .run(technician_id, step.id);
    const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technician_id);
    addLog(card.id, tech.name, '步骤签署', `步骤${step.seq}：${step.content}`);
    const remaining = db.prepare(
      "SELECT COUNT(*) c FROM work_card_steps WHERE work_card_id = ? AND status = '待执行'"
    ).get(card.id).c;
    if (remaining === 0) {
      db.prepare("UPDATE work_cards SET status = '待放行' WHERE id = ?").run(card.id);
      addLog(card.id, '系统', '状态变更', '全部步骤签署完成，转入待放行');
    }
  });
  tx();
  res.json(getCardFull(card.id));
});

// 追加步骤（待派工 / 进行中 / 缺件挂起 可追加；待放行、已放行禁止）
router.post('/:id/steps', (req, res) => {
  const { steps, operator } = req.body;
  if (!Array.isArray(steps) || steps.length === 0 || steps.some((s) => !s.content || !s.content.trim())) {
    return res.status(400).json({ error: '至少填写一个步骤内容' });
  }
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status === '待放行' || card.status === '已放行') {
    return res.status(409).json({ error: `当前状态为「${card.status}」，不能再追加步骤` });
  }

  const tx = db.transaction(() => {
    const maxSeq = db.prepare(
      'SELECT COALESCE(MAX(seq), 0) m FROM work_card_steps WHERE work_card_id = ?'
    ).get(card.id).m;
    const ins = db.prepare('INSERT INTO work_card_steps (work_card_id, seq, content, standard) VALUES (?, ?, ?, ?)');
    steps.forEach((s, i) => ins.run(card.id, maxSeq + i + 1, s.content.trim(), (s.standard || '').trim()));
    const summary = steps.map((s) => s.content.trim()).join('；');
    addLog(card.id, operator || '维修人员', '追加步骤', `新增 ${steps.length} 个步骤：${summary}`);
    // 追加后必存在未签署步骤，工卡不可能处于待放行，无需状态联动
  });
  tx();
  res.json(getCardFull(card.id));
});

// 修改未签署步骤（内容 / 依据标准）
router.patch('/:id/steps/:stepId', (req, res) => {
  const { content, standard, operator } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '步骤内容不能为空' });
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status === '待放行' || card.status === '已放行') {
    return res.status(409).json({ error: `当前状态为「${card.status}」，不能修改步骤` });
  }
  const step = db.prepare('SELECT * FROM work_card_steps WHERE id = ? AND work_card_id = ?').get(req.params.stepId, card.id);
  if (!step) return res.status(404).json({ error: '步骤不存在' });
  if (step.status === '已签署') return res.status(409).json({ error: `步骤${step.seq}已签署，不能修改` });

  const tx = db.transaction(() => {
    db.prepare('UPDATE work_card_steps SET content = ?, standard = ? WHERE id = ?')
      .run(content.trim(), (standard || '').trim(), step.id);
    addLog(card.id, operator || '维修人员', '修改步骤',
      `步骤${step.seq}：「${step.content}」→「${content.trim()}」`);
  });
  tx();
  res.json(getCardFull(card.id));
});

// 删除未签署步骤（删除后剩余步骤重排序号）
router.delete('/:id/steps/:stepId', (req, res) => {
  const operator = req.query.operator || '维修人员';
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status === '待放行' || card.status === '已放行') {
    return res.status(409).json({ error: `当前状态为「${card.status}」，不能删除步骤` });
  }
  const step = db.prepare('SELECT * FROM work_card_steps WHERE id = ? AND work_card_id = ?').get(req.params.stepId, card.id);
  if (!step) return res.status(404).json({ error: '步骤不存在' });
  if (step.status === '已签署') return res.status(409).json({ error: `步骤${step.seq}已签署，不能删除` });
  const total = db.prepare('SELECT COUNT(*) c FROM work_card_steps WHERE work_card_id = ?').get(card.id).c;
  if (total <= 1) return res.status(409).json({ error: '工卡至少保留一个步骤，不能删除' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM work_card_steps WHERE id = ?').run(step.id);
    // 剩余步骤按原顺序重排为 1..n
    const rest = db.prepare('SELECT id FROM work_card_steps WHERE work_card_id = ? ORDER BY seq').all(card.id);
    const upd = db.prepare('UPDATE work_card_steps SET seq = ? WHERE id = ?');
    rest.forEach((r, i) => upd.run(i + 1, r.id));
    addLog(card.id, operator, '删除步骤', `删除步骤${step.seq}：${step.content}`);
    // 若删除后进行中工卡的全部步骤均已签署，转入待放行
    if (card.status === '进行中') {
      const remaining = db.prepare(
        "SELECT COUNT(*) c FROM work_card_steps WHERE work_card_id = ? AND status = '待执行'"
      ).get(card.id).c;
      if (remaining === 0) {
        db.prepare("UPDATE work_cards SET status = '待放行' WHERE id = ?").run(card.id);
        addLog(card.id, '系统', '状态变更', '全部步骤签署完成，转入待放行');
      }
    }
  });
  tx();
  res.json(getCardFull(card.id));
});

// 缺件挂起（进行中）/ 追加缺件（已挂起）
router.post('/:id/hold', (req, res) => {
  const { part_no, part_name, quantity, operator } = req.body;
  if (!part_no || !part_name) return res.status(400).json({ error: '件号和件名为必填项' });
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status !== '进行中' && card.status !== '缺件挂起') {
    return res.status(409).json({ error: `当前状态为「${card.status}」，不能登记缺件` });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO parts_requests (work_card_id, part_no, part_name, quantity, requested_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(card.id, part_no, part_name, quantity || 1, operator || '维修人员');
    if (card.status === '进行中') {
      db.prepare("UPDATE work_cards SET status = '缺件挂起' WHERE id = ?").run(card.id);
      addLog(card.id, operator || '维修人员', '缺件挂起', `${part_name}(${part_no}) × ${quantity || 1} 待航材`);
    } else {
      addLog(card.id, operator || '维修人员', '追加缺件', `${part_name}(${part_no}) × ${quantity || 1} 待航材`);
    }
  });
  tx();
  res.json(getCardFull(card.id));
});

// 航材到货
router.post('/:id/parts/:partId/arrive', (req, res) => {
  const { operator } = req.body;
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  const part = db.prepare('SELECT * FROM parts_requests WHERE id = ? AND work_card_id = ?').get(req.params.partId, card.id);
  if (!part) return res.status(404).json({ error: '缺件记录不存在' });
  if (part.status === '已到货') return res.status(409).json({ error: '该航材已到货' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE parts_requests SET status = '已到货', arrived_at = datetime('now','localtime') WHERE id = ?").run(part.id);
    addLog(card.id, operator || '航材库', '航材到货', `${part.part_name}(${part.part_no}) 已到货`);
    const pending = db.prepare(
      "SELECT COUNT(*) c FROM parts_requests WHERE work_card_id = ? AND status = '待航材'"
    ).get(card.id).c;
    if (pending === 0 && card.status === '缺件挂起') {
      db.prepare("UPDATE work_cards SET status = '进行中' WHERE id = ?").run(card.id);
      addLog(card.id, '系统', '状态变更', '缺件全部到货，恢复施工');
    }
  });
  tx();
  res.json(getCardFull(card.id));
});

// 放行确认
router.post('/:id/release', (req, res) => {
  const { technician_id, remarks } = req.body;
  const card = db.prepare('SELECT * FROM work_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: '工卡不存在' });
  if (card.status !== '待放行') return res.status(409).json({ error: `当前状态为「${card.status}」，不能放行` });
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(technician_id);
  if (!tech) return res.status(404).json({ error: '放行人员不存在' });
  if (tech.role !== '放行人员') return res.status(403).json({ error: `${tech.name} 无放行授权（需放行人员资质）` });

  const unsignedSteps = db.prepare(
    "SELECT COUNT(*) c FROM work_card_steps WHERE work_card_id = ? AND status = '待执行'"
  ).get(card.id).c;
  if (unsignedSteps > 0) return res.status(409).json({ error: `还有 ${unsignedSteps} 个步骤未签署，不能放行` });
  const pendingParts = db.prepare(
    "SELECT COUNT(*) c FROM parts_requests WHERE work_card_id = ? AND status = '待航材'"
  ).get(card.id).c;
  if (pendingParts > 0) return res.status(409).json({ error: '存在未到货航材，不能放行' });

  const tx = db.transaction(() => {
    db.prepare("UPDATE work_cards SET status = '已放行', completed_at = datetime('now','localtime') WHERE id = ?").run(card.id);
    db.prepare('INSERT INTO release_records (work_card_id, released_by, remarks) VALUES (?, ?, ?)')
      .run(card.id, technician_id, remarks || '');
    addLog(card.id, tech.name, '放行', remarks || '工卡放行，飞机适航');
    // 若该飞机无其他未关闭工卡且处于停场/定检状态，恢复在役
    const openCards = db.prepare(
      "SELECT COUNT(*) c FROM work_cards WHERE aircraft_id = ? AND status != '已放行'"
    ).get(card.aircraft_id).c;
    const ac = db.prepare('SELECT * FROM aircraft WHERE id = ?').get(card.aircraft_id);
    if (openCards === 0 && ac.status !== '在役') {
      db.prepare("UPDATE aircraft SET status = '在役' WHERE id = ?").run(card.aircraft_id);
      addLog(card.id, '系统', '状态联动', `${ac.registration} 所有工卡关闭，恢复在役`);
    }
  });
  tx();
  res.json(getCardFull(card.id));
});

module.exports = router;
