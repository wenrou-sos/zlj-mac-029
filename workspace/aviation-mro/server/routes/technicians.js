const express = require('express');
const { db } = require('../db');

const router = express.Router();

// 维修人员列表（含当前在手任务数）
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM work_cards w
        WHERE w.assigned_to = t.id AND w.status IN ('进行中', '缺件挂起')) AS active_tasks
    FROM technicians t ORDER BY t.employee_no
  `).all();
  res.json(rows);
});

module.exports = router;
