import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { StatusBadge, PriorityBadge } from '../components/Badges';
import Modal from '../components/Modal';
import { useCurrentUser } from '../App';

export default function WorkCardDetail() {
  const { id } = useParams();
  const currentUser = useCurrentUser();
  const [card, setCard] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // assign | hold | release | append
  const [editingStep, setEditingStep] = useState(null);

  const load = () => api.get(`/workcards/${id}`).then(setCard).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api.get('/technicians').then(setTechnicians);
  }, [id]);

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      setModal(null);
      setEditingStep(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !card) return <div className="alert alert-error">{error}</div>;
  if (!card) return <div className="loading">加载中…</div>;

  const isAssignee = currentUser.id === card.assigned_to;
  const signedCount = card.steps.filter((s) => s.status === '已签署').length;
  // 待放行 / 已放行 后步骤冻结，之前可追加、修改、删除未签署步骤
  const canEditSteps = card.status !== '待放行' && card.status !== '已放行';

  const removeStep = (step) => {
    if (!window.confirm(`确认删除步骤${step.seq}「${step.content}」？`)) return;
    act(() => api.del(`/workcards/${card.id}/steps/${step.id}?operator=${encodeURIComponent(currentUser.name)}`));
  };

  return (
    <div>
      <Link to="/workcards" className="back-link">← 返回工卡列表</Link>

      <div className="card" style={{ marginTop: 10 }}>
        <div className="detail-header">
          <div>
            <div className="detail-title">
              <span className="mono">{card.card_no}</span>
              <StatusBadge value={card.status} />
              <PriorityBadge value={card.priority} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{card.title}</div>
          </div>
          <div className="action-bar">
            {card.status === '待派工' && (
              <button className="btn btn-primary" onClick={() => setModal('assign')}>👷 派工</button>
            )}
            {(card.status === '进行中' || card.status === '缺件挂起') && (
              <button className="btn btn-danger" onClick={() => setModal('hold')}>
                📦 {card.status === '缺件挂起' ? '追加缺件' : '缺件挂起'}
              </button>
            )}
            {card.status === '待放行' && (
              <button className="btn btn-primary" onClick={() => setModal('release')}>✅ 放行确认</button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: 14 }}>{error}</div>}
        {card.status === '缺件挂起' && (
          <div className="alert alert-warn" style={{ marginTop: 14 }}>
            ⏸ 工卡已因缺件挂起，航材到货确认后方可继续签署步骤。
          </div>
        )}

        <div className="detail-meta">
          <div className="meta-item">
            <div className="k">飞机</div>
            <div className="v">
              <Link to={`/aircraft/${card.aircraft_id}`} className="back-link">
                {card.registration} · {card.model}
              </Link>
            </div>
          </div>
          <div className="meta-item"><div className="k">工卡类型</div><div className="v">{card.type}</div></div>
          <div className="meta-item">
            <div className="k">负责人</div>
            <div className="v">{card.assignee_name ? `${card.assignee_name}（${card.assignee_no}）` : '未派工'}</div>
          </div>
          <div className="meta-item"><div className="k">完成期限</div><div className="v">{card.due_date || '—'}</div></div>
          <div className="meta-item"><div className="k">创建人</div><div className="v">{card.created_by}</div></div>
          <div className="meta-item"><div className="k">创建时间</div><div className="v">{card.created_at}</div></div>
          <div className="meta-item"><div className="k">步骤进度</div><div className="v">{signedCount} / {card.steps.length}</div></div>
          {card.completed_at && (
            <div className="meta-item"><div className="k">完成时间</div><div className="v">{card.completed_at}</div></div>
          )}
        </div>
        {card.description && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: 13 }}>
            <span className="muted">工作说明：</span>{card.description}
          </div>
        )}
      </div>

      <div className="grid-3-2">
        <div>
          {/* 施工步骤 */}
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📝 施工步骤签署</span>
              {canEditSteps && (
                <button className="btn btn-sm" onClick={() => setModal('append')}>＋ 追加步骤</button>
              )}
            </div>
            {card.steps.map((s) => (
              <div className="step-row" key={s.id}>
                <div className={`step-seq ${s.status === '已签署' ? 'done' : ''}`}>
                  {s.status === '已签署' ? '✓' : s.seq}
                </div>
                <div className="step-content">
                  <div className={`step-text ${s.status === '已签署' ? 'signed' : ''}`}>{s.content}</div>
                  {s.standard && <div className="step-standard">依据：{s.standard}</div>}
                  {s.status === '已签署' && (
                    <div className="step-sign">✍ {s.signer_name} 签署于 {s.signed_at}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {s.status === '待执行' && card.status === '进行中' && (
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={!isAssignee}
                      title={isAssignee ? '' : '只有被派工人可签署'}
                      onClick={() => act(() => api.post(`/workcards/${card.id}/steps/${s.id}/sign`, { technician_id: currentUser.id }))}
                    >
                      签署
                    </button>
                  )}
                  {s.status === '待执行' && canEditSteps && (
                    <>
                      <button className="btn btn-sm" onClick={() => setEditingStep(s)}>修改</button>
                      <button className="btn btn-sm btn-danger" onClick={() => removeStep(s)}>删除</button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {card.status === '进行中' && !isAssignee && (
              <div className="alert alert-info" style={{ marginTop: 12 }}>
                当前操作人不是被派工人（{card.assignee_name}），可在右上角切换身份后签署。
              </div>
            )}
          </div>

          {/* 缺件记录 */}
          {card.parts.length > 0 && (
            <div className="card">
              <div className="card-title">📦 航材缺件记录</div>
              <table>
                <thead>
                  <tr><th>件号</th><th>件名</th><th>数量</th><th>状态</th><th>申请时间</th><th></th></tr>
                </thead>
                <tbody>
                  {card.parts.map((p) => (
                    <tr key={p.id}>
                      <td className="mono">{p.part_no}</td>
                      <td>{p.part_name}</td>
                      <td>× {p.quantity}</td>
                      <td><StatusBadge value={p.status} /></td>
                      <td className="muted">{p.requested_at}</td>
                      <td>
                        {p.status === '待航材' && (
                          <button className="btn btn-sm"
                            onClick={() => act(() => api.post(`/workcards/${card.id}/parts/${p.id}/arrive`, { operator: currentUser.name }))}>
                            确认到货
                          </button>
                        )}
                        {p.status === '已到货' && <span className="muted" style={{ fontSize: 12 }}>{p.arrived_at}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 放行记录 */}
          {card.release && (
            <div className="card" style={{ borderColor: '#a7f3d0', background: '#f0fdf9' }}>
              <div className="card-title">✅ 放行证明</div>
              <div className="detail-meta">
                <div className="meta-item"><div className="k">放行人员</div><div className="v">{card.release.releaser_name}</div></div>
                <div className="meta-item"><div className="k">执照号</div><div className="v mono">{card.release.license_no}</div></div>
                <div className="meta-item"><div className="k">放行时间</div><div className="v">{card.release.released_at}</div></div>
              </div>
              {card.release.remarks && (
                <div style={{ marginTop: 10, fontSize: 13 }}><span className="muted">放行备注：</span>{card.release.remarks}</div>
              )}
            </div>
          )}
        </div>

        {/* 操作日志 */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-title">🕒 操作记录</div>
          <div className="timeline">
            {card.logs.map((l) => (
              <div className="timeline-item" key={l.id}>
                <div className="timeline-action">{l.action}</div>
                <div className="timeline-detail">{l.actor} — {l.detail}</div>
                <div className="timeline-time">{l.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal === 'assign' && (
        <AssignModal
          technicians={technicians}
          onClose={() => setModal(null)}
          onSubmit={(technician_id) => act(() =>
            api.post(`/workcards/${card.id}/assign`, { technician_id, operator: `生产控制-${currentUser.name}` }))}
        />
      )}
      {modal === 'hold' && (
        <HoldModal
          isAppend={card.status === '缺件挂起'}
          onClose={() => setModal(null)}
          onSubmit={(data) => act(() =>
            api.post(`/workcards/${card.id}/hold`, { ...data, operator: currentUser.name }))}
        />
      )}
      {modal === 'release' && (
        <ReleaseModal
          currentUser={currentUser}
          onClose={() => setModal(null)}
          onSubmit={(remarks) => act(() =>
            api.post(`/workcards/${card.id}/release`, { technician_id: currentUser.id, remarks }))}
        />
      )}
      {modal === 'append' && (
        <AppendStepsModal
          onClose={() => setModal(null)}
          onSubmit={(steps) => act(() =>
            api.post(`/workcards/${card.id}/steps`, { steps, operator: currentUser.name }))}
        />
      )}
      {editingStep && (
        <EditStepModal
          step={editingStep}
          onClose={() => setEditingStep(null)}
          onSubmit={(data) => act(() =>
            api.patch(`/workcards/${card.id}/steps/${editingStep.id}`, { ...data, operator: currentUser.name }))}
        />
      )}
    </div>
  );
}

function AssignModal({ technicians, onClose, onSubmit }) {
  const [techId, setTechId] = useState('');
  return (
    <Modal title="工卡派工" onClose={onClose}>
      <div className="form-row">
        <label>选择维修人员</label>
        <select value={techId} onChange={(e) => setTechId(e.target.value)}>
          <option value="">请选择</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.employee_no}）· {t.role} · 在手任务 {t.active_tasks}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={!techId} onClick={() => onSubmit(Number(techId))}>确认派工</button>
      </div>
    </Modal>
  );
}

function HoldModal({ isAppend, onClose, onSubmit }) {
  const [form, setForm] = useState({ part_no: '', part_name: '', quantity: 1 });
  const valid = form.part_no.trim() && form.part_name.trim();
  return (
    <Modal title={isAppend ? '追加缺件登记' : '缺件挂起申请'} onClose={onClose}>
      <div className="alert alert-warn">
        {isAppend
          ? '工卡已处于缺件挂起状态，本次登记将追加一条缺件记录，全部航材到货后自动恢复施工。'
          : '挂起后工卡将暂停施工，航材到货确认后自动恢复。'}
      </div>
      <div className="form-row">
        <label>件号 *</label>
        <input value={form.part_no} placeholder="如 79-2100-A01"
          onChange={(e) => setForm({ ...form, part_no: e.target.value })} />
      </div>
      <div className="form-row">
        <label>件名 *</label>
        <input value={form.part_name} placeholder="如 发动机滑油泵"
          onChange={(e) => setForm({ ...form, part_name: e.target.value })} />
      </div>
      <div className="form-row">
        <label>数量</label>
        <input type="number" min="1" value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-danger" disabled={!valid} onClick={() => onSubmit(form)}>
          {isAppend ? '确认登记' : '确认挂起'}
        </button>
      </div>
    </Modal>
  );
}

function AppendStepsModal({ onClose, onSubmit }) {
  const [steps, setSteps] = useState([{ content: '', standard: '' }]);
  const [err, setErr] = useState('');

  const setStep = (i, key, val) => {
    const next = [...steps];
    next[i] = { ...next[i], [key]: val };
    setSteps(next);
  };

  const submit = () => {
    const valid = steps.filter((s) => s.content.trim());
    if (valid.length === 0) return setErr('请至少填写一个步骤内容');
    onSubmit(valid);
  };

  return (
    <Modal title="追加施工步骤" onClose={onClose}>
      <div className="alert alert-info">
        新步骤追加到末尾并按顺序签署；新增步骤全部签署完成后，工卡才能进入待放行。
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="form-row">
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input style={{ flex: 3 }} placeholder="新步骤内容"
              value={s.content} onChange={(e) => setStep(i, 'content', e.target.value)} />
            <input style={{ flex: 2 }} placeholder="依据标准（如 AMM 章节）"
              value={s.standard} onChange={(e) => setStep(i, 'standard', e.target.value)} />
            <button className="btn btn-sm btn-danger" type="button"
              onClick={() => setSteps(steps.filter((_, j) => j !== i))}
              disabled={steps.length === 1}>删</button>
          </div>
        ))}
        <button className="btn btn-sm" type="button"
          onClick={() => setSteps([...steps, { content: '', standard: '' }])}>
          ＋ 再添加一条
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={submit}>确认追加</button>
      </div>
    </Modal>
  );
}

function EditStepModal({ step, onClose, onSubmit }) {
  const [content, setContent] = useState(step.content);
  const [standard, setStandard] = useState(step.standard || '');
  return (
    <Modal title={`修改步骤 ${step.seq}`} onClose={onClose}>
      <div className="form-row">
        <label>步骤内容 *</label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="form-row">
        <label>依据标准</label>
        <input value={standard} placeholder="如 AMM 32-21-00"
          onChange={(e) => setStandard(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={!content.trim()}
          onClick={() => onSubmit({ content, standard })}>保存修改</button>
      </div>
    </Modal>
  );
}

function ReleaseModal({ currentUser, onClose, onSubmit }) {
  const [remarks, setRemarks] = useState('');
  const authorized = currentUser.role === '放行人员';
  return (
    <Modal title="放行确认" onClose={onClose}>
      {authorized ? (
        <div className="alert alert-info">
          放行人员：{currentUser.name}（执照号 {currentUser.license_no}）。放行即确认本工卡全部工作已完成，飞机适航。
        </div>
      ) : (
        <div className="alert alert-error">
          当前操作人「{currentUser.name}」无放行授权，请在右上角切换至放行人员（王建国 / 李文静）。
        </div>
      )}
      <div className="form-row">
        <label>放行备注</label>
        <textarea value={remarks} placeholder="如：全部工作完成，测试正常，飞机适航。"
          onChange={(e) => setRemarks(e.target.value)} />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={!authorized} onClick={() => onSubmit(remarks)}>确认放行</button>
      </div>
    </Modal>
  );
}
