/**
 * 本地模拟机队数据初始化
 * 用法: node seed.js  (重复执行会先清空旧数据)
 */
const { db, initDb } = require('./db');

async function main() {
  await initDb();

  const seed = db.transaction(() => {
  db.exec(`
    DELETE FROM work_logs;
    DELETE FROM release_records;
    DELETE FROM parts_requests;
    DELETE FROM work_card_steps;
    DELETE FROM work_cards;
    DELETE FROM technicians;
    DELETE FROM aircraft;
    DELETE FROM sqlite_sequence;
  `);

  // ---------- 机队 ----------
  const aircraft = [
    ['B-5301', 'B737-800', 'MSN 40211', '2013-05-18', '2013-06-02', 28650.5, 15230, '在役', 'C检', '2026-11-20', 'PEK'],
    ['B-5302', 'B737-800', 'MSN 40212', '2013-08-11', '2013-08-25', 27412.0, 14588, '在役', 'A检', '2026-09-28', 'PEK'],
    ['B-1688', 'A320neo',  'MSN 10875', '2022-03-04', '2022-03-30', 6120.3, 3455, '定检中', 'A检', '2026-09-15', 'PEK'],
    ['B-2066', 'A321neo',  'MSN 11209', '2023-01-20', '2023-02-14', 4210.8, 2102, '在役', 'A检', '2026-12-05', 'SHA'],
    ['B-7890', 'B787-9',   'MSN 63315', '2019-09-12', '2019-10-01', 15890.2, 3012, '在役', 'C检', '2027-02-14', 'PEK'],
    ['B-651C', 'ARJ21-700','MSN 10188', '2021-06-30', '2021-07-22', 5230.6, 4180, '停场维修', 'A检', '2026-09-20', 'CTU'],
    ['B-3215', 'A320neo',  'MSN 10551', '2021-11-08', '2021-12-01', 8102.4, 4520, '在役', 'A检', '2026-10-11', 'SHA'],
  ];
  const insAircraft = db.prepare(`
    INSERT INTO aircraft (registration, model, msn, manufacture_date, delivery_date,
      total_flight_hours, total_cycles, status, next_check_type, next_check_date, base)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of aircraft) insAircraft.run(...a);

  // ---------- 维修人员 ----------
  const technicians = [
    ['M001', '王建国', '放行人员', 'TA-3701-2015-0118', 'B737-800,A320neo,A321neo', '13801010001'],
    ['M002', '李文静', '放行人员', 'TA-3701-2017-0245', 'B787-9,ARJ21-700', '13801010002'],
    ['M003', '张伟',   '技术员',   'TA-3701-2019-0502', 'B737-800,A320neo', '13801010003'],
    ['M004', '陈晓东', '机械员',   null, 'B737-800', '13801010004'],
    ['M005', '刘洋',   '机械员',   null, 'A320neo,A321neo', '13801010005'],
    ['M006', '赵敏',   '检验员',   'TA-3701-2016-0331', 'B737-800,A320neo,B787-9', '13801010006'],
    ['M007', '孙立军', '技术员',   'TA-3701-2020-0617', 'ARJ21-700', '13801010007'],
    ['M008', '周婷',   '机械员',   null, 'B787-9', '13801010008'],
  ];
  const insTech = db.prepare(`
    INSERT INTO technicians (employee_no, name, role, license_no, quals, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const t of technicians) insTech.run(...t);

  // ---------- 工卡 + 步骤 ----------
  // status: 待派工 / 进行中 / 缺件挂起 / 待放行 / 已放行
  const cards = [
    {
      card_no: 'WC-2026-0901', aircraft: 'B-1688', title: 'A检 - 前起落架减震支柱检查',
      type: '定检', priority: '正常', status: '进行中', assigned: 'M003',
      due: '2026-09-16', desc: '按 AMM 32-21-00 执行前起落架减震支柱镜面高度检查及渗漏检查。',
      steps: [
        ['顶升飞机前机身并安装安全锁', 'AMM 07-11-00', 1],
        ['检查减震支柱镜面高度，标准值 280±10mm', 'AMM 32-21-00-200-001', 1],
        ['检查支柱镀铬层有无划伤、腐蚀', 'AMM 32-21-00-200-002', 1],
        ['检查上下轴承腔有无液压油渗漏', 'AMM 32-21-00-200-003', 0],
        ['恢复飞机至正常状态，撤除安全设备', 'AMM 07-11-00', 0],
      ],
    },
    {
      card_no: 'WC-2026-0902', aircraft: 'B-651C', title: '右发滑油泵更换',
      type: '故障排除', priority: 'AOG', status: '缺件挂起', assigned: 'M007',
      due: '2026-09-14', desc: '机组报告右发滑油压力低，测试确认滑油泵内部磨损，需更换。',
      steps: [
        ['断开右发滑油泵电插头并挂警告牌', 'AMM 79-21-00', 1],
        ['拆卸滑油泵供油/回油管路并封堵', 'AMM 79-21-00', 1],
        ['拆下旧滑油泵，检查驱动轴花键', 'AMM 79-21-00', 1],
        ['安装新滑油泵并恢复管路', 'AMM 79-21-00', 0],
        ['慢车试车 5 分钟，检查滑油压力及渗漏', 'AMM 71-00-00', 0],
      ],
      parts: [
        ['79-2100-A01', '发动机滑油泵', 1, '待航材'],
      ],
    },
    {
      card_no: 'WC-2026-0903', aircraft: 'B-5301', title: '客舱 12ABC 座椅靠背调节失效',
      type: '航线维修', priority: '正常', status: '待派工',
      due: '2026-09-18', desc: '乘务员报告 12 排 ABC 三个座椅靠背无法调节，影响旅客舒适度。',
      steps: [
        ['检查座椅靠背调节钢索及作动机构', 'AMM 25-21-00', 0],
        ['视情更换调节作动筒', 'AMM 25-21-00', 0],
        ['功能测试靠背调节 10 个循环', 'AMM 25-21-00', 0],
      ],
    },
    {
      card_no: 'WC-2026-0904', aircraft: 'B-7890', title: '左主轮刹车组件更换',
      type: '时控件更换', priority: '正常', status: '待放行', assigned: 'M008',
      due: '2026-09-13', desc: '左主轮 2 号位刹车组件磨损到限（剩余 3mm），按寿命件管理要求更换。',
      steps: [
        ['顶升主起落架并拆卸机轮', 'AMM 32-45-00', 1],
        ['拆卸旧刹车组件，检查扭力管', 'AMM 32-45-11', 1],
        ['安装新刹车组件并磅力矩', 'AMM 32-45-11', 1],
        ['装机轮，刹车磨合测试', 'AMM 32-45-00', 1],
      ],
    },
    {
      card_no: 'WC-2026-0905', aircraft: 'B-5302', title: '航后检查 - 整机绕机检查',
      type: '航线维修', priority: '正常', status: '已放行', assigned: 'M004',
      due: '2026-09-12', desc: '执行航后例行绕机检查工卡。',
      steps: [
        ['检查机身蒙皮、天线、放电刷外观', 'AMM 05-51-00', 1],
        ['检查发动机进气道、尾喷管', 'AMM 05-51-00', 1],
        ['检查起落架、轮胎磨损及气压', 'AMM 05-51-00', 1],
        ['检查液压油量、滑油量并视情勤务', 'AMM 12-00-00', 1],
      ],
      released_by: 'M001', release_remarks: '航后检查正常，飞机适航。',
    },
    {
      card_no: 'WC-2026-0906', aircraft: 'B-3215', title: 'APU 滑油勤务及磁堵检查',
      type: '航线维修', priority: '正常', status: '进行中', assigned: 'M005',
      due: '2026-09-14', desc: 'APU 滑油量低于标准，执行勤务并检查磁堵有无金属屑。',
      steps: [
        ['APU 停车冷却 30 分钟', 'AMM 49-00-00', 1],
        ['检查磁堵有无金属屑并拍照记录', 'AMM 49-90-00', 1],
        ['加注滑油至标准位', 'AMM 12-13-49', 0],
        ['APU 运转测试，确认滑油量稳定', 'AMM 49-00-00', 0],
      ],
    },
    {
      card_no: 'WC-2026-0907', aircraft: 'B-2066', title: 'EFB 软件版本升级',
      type: '改装', priority: '加急', status: '待派工',
      due: '2026-09-15', desc: '按厂家 SB 将 EFB 软件升级至 V4.2.1，涉及性能计算模块更新。',
      steps: [
        ['备份当前 EFB 配置数据', 'SB EFB-2026-018', 0],
        ['上传并安装 V4.2.1 软件包', 'SB EFB-2026-018', 0],
        ['验证性能计算结果与纸质手册一致', 'SB EFB-2026-018', 0],
      ],
    },
    {
      card_no: 'WC-2026-0908', aircraft: 'B-1688', title: 'A检 - 应急滑梯压力检查',
      type: '定检', priority: '正常', status: '缺件挂起', assigned: 'M003',
      due: '2026-09-17', desc: '检查各舱门应急滑梯气瓶压力，左前门气瓶压力低于绿区需更换。',
      steps: [
        ['解除各舱门滑梯预位', 'AMM 25-60-00', 1],
        ['检查并记录各气瓶压力', 'AMM 25-62-00', 1],
        ['更换左前门滑梯气瓶', 'AMM 25-62-11', 0],
        ['恢复滑梯预位并做互检', 'AMM 25-60-00', 0],
      ],
      parts: [
        ['25-6211-B07', '应急滑梯充气气瓶', 1, '待航材'],
      ],
    },
    {
      card_no: 'WC-2026-0909', aircraft: 'B-5301', title: '气象雷达收发机故障排除',
      type: '故障排除', priority: '加急', status: '进行中', assigned: 'M003',
      due: '2026-09-13', desc: '机组反映气象雷达图像间歇性丢失，BITE 指向收发机。',
      steps: [
        ['执行雷达 BITE 测试并记录故障代码', 'AMM 34-41-00', 1],
        ['更换气象雷达收发机', 'AMM 34-41-11', 0],
        ['系统测试并签署故障关闭', 'AMM 34-41-00', 0],
      ],
    },
    {
      card_no: 'WC-2026-0910', aircraft: 'B-7890', title: 'C检准备 - 工卡包预审',
      type: '定检', priority: '正常', status: '待派工',
      due: '2026-09-25', desc: '对明年 2 月 C 检工卡包进行预审，核对时控件清单。',
      steps: [
        ['核对 C 检工卡包清单完整性', 'MPD', 0],
        ['梳理时控件到期清单并下单备件', 'MPD', 0],
        ['输出预审报告', 'MPD', 0],
      ],
    },
  ];

  const insCard = db.prepare(`
    INSERT INTO work_cards (card_no, aircraft_id, title, type, priority, status, description,
      created_by, assigned_to, due_date, created_at, completed_at)
    VALUES (?, (SELECT id FROM aircraft WHERE registration = ?), ?, ?, ?, ?, ?, '生产控制-郑海',
      (SELECT id FROM technicians WHERE employee_no = ?), ?, ?, ?)
  `);
  const insStep = db.prepare(`
    INSERT INTO work_card_steps (work_card_id, seq, content, standard, status, signed_by, signed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insPart = db.prepare(`
    INSERT INTO parts_requests (work_card_id, part_no, part_name, quantity, status, requested_by, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insRelease = db.prepare(`
    INSERT INTO release_records (work_card_id, released_by, released_at, remarks)
    VALUES (?, (SELECT id FROM technicians WHERE employee_no = ?), ?, ?)
  `);

  let day = 10;
  for (const c of cards) {
    const createdAt = `2026-09-${String(Math.min(day, 12)).padStart(2, '0')} 08:30:00`;
    const completedAt = c.status === '已放行' ? '2026-09-12 17:40:00' : null;
    insCard.run(c.card_no, c.aircraft, c.title, c.type, c.priority, c.status,
      c.desc, c.assigned || null, c.due, createdAt, completedAt);
    const cardId = db.prepare('SELECT id FROM work_cards WHERE card_no = ?').get(c.card_no).id;

    c.steps.forEach((s, i) => {
      const signed = s[2] === 1;
      insStep.run(
        cardId, i + 1, s[0], s[1],
        signed ? '已签署' : '待执行',
        signed ? db.prepare('SELECT id FROM technicians WHERE employee_no = ?').get(c.assigned).id : null,
        signed ? `2026-09-12 ${String(9 + i).padStart(2, '0')}:15:00` : null
      );
    });

    if (c.parts) {
      for (const p of c.parts) {
        insPart.run(cardId, p[0], p[1], p[2], p[3], '生产控制-郑海', '2026-09-12 10:05:00');
      }
    }

    if (c.released_by) {
      insRelease.run(cardId, c.released_by, '2026-09-12 17:40:00', c.release_remarks);
    }
    day++;
  }

  // ---------- 操作日志 ----------
  const logs = [
    ['WC-2026-0901', '生产控制-郑海', '创建工卡', 'A检工卡包下发'],
    ['WC-2026-0901', '生产控制-郑海', '派工', '派工给 张伟(M003)'],
    ['WC-2026-0901', '张伟', '步骤签署', '步骤1-3 已签署'],
    ['WC-2026-0902', '生产控制-郑海', '创建工卡', 'AOG 故障工卡'],
    ['WC-2026-0902', '生产控制-郑海', '派工', '派工给 孙立军(M007)'],
    ['WC-2026-0902', '孙立军', '缺件挂起', '滑油泵 79-2100-A01 无库存，已挂起待航材'],
    ['WC-2026-0904', '生产控制-郑海', '派工', '派工给 周婷(M008)'],
    ['WC-2026-0904', '周婷', '步骤签署', '全部步骤签署完成，提交放行'],
    ['WC-2026-0905', '王建国', '放行', '航后检查正常，飞机适航'],
    ['WC-2026-0908', '孙立军', '缺件挂起', '滑梯气瓶 25-6211-B07 待航材'],
  ];
  const insLog = db.prepare(`
    INSERT INTO work_logs (work_card_id, actor, action, detail, created_at)
    VALUES ((SELECT id FROM work_cards WHERE card_no = ?), ?, ?, ?, ?)
  `);
  logs.forEach((l, i) => {
    insLog.run(l[0], l[1], l[2], l[3], `2026-09-12 ${String(8 + i).padStart(2, '0')}:30:00`);
  });
  });

  seed();

  const counts = {
    aircraft: db.prepare('SELECT COUNT(*) c FROM aircraft').get().c,
    technicians: db.prepare('SELECT COUNT(*) c FROM technicians').get().c,
    work_cards: db.prepare('SELECT COUNT(*) c FROM work_cards').get().c,
    steps: db.prepare('SELECT COUNT(*) c FROM work_card_steps').get().c,
    parts: db.prepare('SELECT COUNT(*) c FROM parts_requests').get().c,
  };
  console.log('✅ 模拟数据初始化完成:', counts);
}

main().catch((e) => {
  console.error('初始化失败:', e);
  process.exit(1);
});
