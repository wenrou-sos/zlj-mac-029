// 状态 → 徽章样式映射
const STATUS_STYLE = {
  '待派工': 'badge-gray',
  '进行中': 'badge-blue',
  '缺件挂起': 'badge-amber',
  '待放行': 'badge-purple',
  '已放行': 'badge-green',
  '已作废': 'badge-dark',
  '在役': 'badge-green',
  '停场维修': 'badge-red',
  '定检中': 'badge-blue',
  '待航材': 'badge-amber',
  '已到货': 'badge-green',
  '待执行': 'badge-gray',
  '已签署': 'badge-green',
};

const PRIORITY_STYLE = {
  'AOG': 'badge-red',
  '加急': 'badge-amber',
  '正常': 'badge-gray',
};

export function StatusBadge({ value }) {
  return <span className={`badge ${STATUS_STYLE[value] || 'badge-gray'}`}>{value}</span>;
}

export function PriorityBadge({ value }) {
  return <span className={`badge ${PRIORITY_STYLE[value] || 'badge-gray'}`}>{value}</span>;
}
