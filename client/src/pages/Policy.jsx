import { useState, useEffect, useId, useCallback } from 'react';
import api from '../services/api';
import { StyledSelect } from '../components/StyledSelect';
import { Modal } from '../components/Modal';
import { Shield, Plus, Trash2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { showSuccess, showError } from '../utils/toast';
import { formatDateTime } from '../utils/date';
import { getApiError } from '../utils/apiError';
import { confirmDialog } from '../utils/confirm';

const SUBJECT_TYPE_OPTIONS = [
  { value: '*', label: 'Everyone' },
  { value: 'role', label: 'Role' },
  { value: 'group', label: 'Group' },
  { value: 'user', label: 'Specific user' },
];

// The engine itself treats resourceType/action as free strings on purpose
// (see policy.js) so any future resource can adopt it with zero engine
// changes. These lists are just the resource types/actions actually wired
// into a call site today - scoping the dropdown to them prevents the
// silent-no-op failure mode of a rule that never matches anything because
// of a typo (e.g. "toooools"). CUSTOM_OPTION keeps the free-string
// escape hatch available for a resource type added later but not yet
// listed here.
const RESOURCE_TYPE_OPTIONS = [
  { value: 'tool', label: 'Tool' },
  { value: 'session_context', label: 'Session Context' },
  { value: 'session_channel', label: 'Session Channel' },
  { value: '*', label: 'Everyone (all resource types)' },
];

const ACTIONS_BY_RESOURCE_TYPE = {
  tool: ['execute'],
  session_context: ['read', 'write', 'delete'],
  session_channel: ['read', 'write', 'delete', 'subscribe'],
};

const CUSTOM_OPTION = { value: '__custom__', label: 'Other (custom)...' };

function getActionOptions(resourceType) {
  const known = resourceType === '*'
    ? [...new Set(Object.values(ACTIONS_BY_RESOURCE_TYPE).flat())]
    : (ACTIONS_BY_RESOURCE_TYPE[resourceType] || []);
  return [{ value: '*', label: 'All actions' }, ...known.map(a => ({ value: a, label: a })), CUSTOM_OPTION];
}

// Whatever the current value is, show it as its matching known option, or
// fall back to the custom sentinel - this is also what makes switching
// resourceType safely self-correcting: if the current action doesn't apply
// to the newly-picked resource type, it just reappears as "Other (custom)"
// with its value intact, rather than being silently reset or hidden.
function selectedOrCustom(options, value) {
  return options.find(o => o.value === value) || CUSTOM_OPTION;
}

const EFFECT_OPTIONS = [
  { value: 'allow', label: 'Allow' },
  { value: 'deny', label: 'Deny' },
  { value: 'limit', label: 'Rate limit' },
];

const EFFECT_BADGE_CLASS = { allow: 'badge-success', deny: 'badge-danger', limit: 'badge-warning' };

const emptyForm = {
  resourceType: 'tool',
  resourceMatch: '*',
  action: '*',
  subjectType: '*',
  subjectId: '',
  effect: 'deny',
  maxPerHour: '',
  maxPerDay: '',
  priority: 0,
  isActive: true,
  description: '',
};

function RulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const isActiveCheckboxId = useId();

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const params = resourceTypeFilter ? { resourceType: resourceTypeFilter } : {};
      const res = await api.get('/policy/rules', { params });
      setRules(res.data);
    } catch (err) {
      showError(`Failed to fetch policy rules: ${getApiError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [resourceTypeFilter]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setEditingRule(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      resourceType: rule.resourceType,
      resourceMatch: rule.resourceMatch,
      action: rule.action,
      subjectType: rule.subjectType,
      subjectId: rule.subjectId || '',
      effect: rule.effect,
      maxPerHour: rule.limitConfig?.maxPerHour ?? '',
      maxPerDay: rule.limitConfig?.maxPerDay ?? '',
      priority: rule.priority,
      isActive: rule.isActive,
      description: rule.description || '',
    });
    setShowModal(true);
  };

  const buildPayload = () => {
    const payload = {
      resourceType: form.resourceType.trim(),
      resourceMatch: form.resourceMatch.trim() || '*',
      action: form.action.trim() || '*',
      subjectType: form.subjectType,
      subjectId: form.subjectType === '*' ? '' : form.subjectId.trim(),
      effect: form.effect,
      priority: Number(form.priority) || 0,
      isActive: form.isActive,
      description: form.description.trim(),
    };
    if (form.effect === 'limit') {
      payload.limitConfig = {
        ...(form.maxPerHour !== '' && { maxPerHour: Number(form.maxPerHour) }),
        ...(form.maxPerDay !== '' && { maxPerDay: Number(form.maxPerDay) }),
      };
    } else {
      payload.limitConfig = null;
    }
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (editingRule) {
        const res = await api.put(`/policy/rules/${editingRule.id}`, payload);
        setRules(rules.map(r => r.id === editingRule.id ? res.data : r));
        showSuccess('Policy rule updated');
      } else {
        const res = await api.post('/policy/rules', payload);
        setRules([res.data, ...rules]);
        showSuccess('Policy rule created');
      }
      setShowModal(false);
    } catch (err) {
      showError(`Failed to save policy rule: ${getApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rule) => {
    const ok = await confirmDialog(
      `Delete policy rule "${rule.description || rule.id}"?`,
      { danger: true, confirmLabel: 'Delete' }
    );
    if (!ok) return;
    setDeletingId(rule.id);
    try {
      await api.delete(`/policy/rules/${rule.id}`);
      setRules(rules.filter(r => r.id !== rule.id));
      showSuccess('Policy rule deleted');
    } catch (err) {
      showError(`Failed to delete policy rule: ${getApiError(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const toggleActive = async (rule) => {
    try {
      const res = await api.put(`/policy/rules/${rule.id}`, { isActive: !rule.isActive });
      setRules(rules.map(r => r.id === rule.id ? res.data : r));
    } catch (err) {
      showError(`Failed to update rule: ${getApiError(err)}`);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Filter by resource type (e.g. tool)"
          value={resourceTypeFilter}
          onChange={e => setResourceTypeFilter(e.target.value)}
          style={{ maxWidth: '260px', padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
        />
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} /> New Rule
        </button>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Match</th>
                <th>Action</th>
                <th>Subject</th>
                <th>Effect</th>
                <th>Priority</th>
                <th>Active</th>
                <th style={{ width: '110px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>{rule.resourceType}</td>
                  <td><code>{rule.resourceMatch}</code></td>
                  <td><code>{rule.action}</code></td>
                  <td>{rule.subjectType === '*' ? 'Everyone' : `${rule.subjectType}: ${rule.subjectId}`}</td>
                  <td><span className={`badge ${EFFECT_BADGE_CLASS[rule.effect]}`}>{rule.effect}</span></td>
                  <td>{rule.priority}</td>
                  <td>
                    <button className={`btn btn-small ${rule.isActive ? 'btn-secondary' : ''}`} onClick={() => toggleActive(rule)}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-small btn-secondary" onClick={() => openEdit(rule)}>Edit</button>
                      <button className="btn btn-small btn-danger" onClick={() => handleDelete(rule)} disabled={deletingId === rule.id} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No policy rules defined - all requests default-allow</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal
          title={editingRule ? 'Edit Policy Rule' : 'New Policy Rule'}
          onClose={() => setShowModal(false)}
          size="md"
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" form="policy-rule-form" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : (editingRule ? 'Update' : 'Create')}
              </button>
            </>
          )}
        >
          <form id="policy-rule-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Resource type</label>
              <StyledSelect
                options={[...RESOURCE_TYPE_OPTIONS, CUSTOM_OPTION]}
                value={selectedOrCustom(RESOURCE_TYPE_OPTIONS, form.resourceType)}
                onChange={opt => setForm({ ...form, resourceType: opt.value === CUSTOM_OPTION.value ? '' : opt.value })}
                isSearchable={false}
              />
              {selectedOrCustom(RESOURCE_TYPE_OPTIONS, form.resourceType).value === CUSTOM_OPTION.value && (
                <input
                  type="text"
                  value={form.resourceType}
                  onChange={e => setForm({ ...form, resourceType: e.target.value })}
                  placeholder="custom_resource_type"
                  required
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>
            <div className="form-group">
              <label>Resource match (name, or * for all)</label>
              <input type="text" value={form.resourceMatch} onChange={e => setForm({ ...form, resourceMatch: e.target.value })} placeholder="*" />
            </div>
            <div className="form-group">
              <label>Action</label>
              <StyledSelect
                options={getActionOptions(form.resourceType)}
                value={selectedOrCustom(getActionOptions(form.resourceType), form.action)}
                onChange={opt => setForm({ ...form, action: opt.value === CUSTOM_OPTION.value ? '' : opt.value })}
                isSearchable={false}
              />
              {selectedOrCustom(getActionOptions(form.resourceType), form.action).value === CUSTOM_OPTION.value && (
                <input
                  type="text"
                  value={form.action}
                  onChange={e => setForm({ ...form, action: e.target.value })}
                  placeholder="custom_action"
                  style={{ marginTop: '0.5rem' }}
                />
              )}
            </div>
            <div className="form-group">
              <label>Subject</label>
              <StyledSelect
                options={SUBJECT_TYPE_OPTIONS}
                value={SUBJECT_TYPE_OPTIONS.find(o => o.value === form.subjectType)}
                onChange={opt => setForm({ ...form, subjectType: opt.value, subjectId: opt.value === '*' ? '' : form.subjectId })}
                isSearchable={false}
              />
            </div>
            {form.subjectType !== '*' && (
              <div className="form-group">
                <label>
                  {form.subjectType === 'role' ? 'Role name (e.g. user, admin)'
                    : form.subjectType === 'group' ? 'Group ID'
                    : 'User ID'}
                </label>
                <input type="text" value={form.subjectId} onChange={e => setForm({ ...form, subjectId: e.target.value })} required />
              </div>
            )}
            <div className="form-group">
              <label>Effect</label>
              <StyledSelect
                options={EFFECT_OPTIONS}
                value={EFFECT_OPTIONS.find(o => o.value === form.effect)}
                onChange={opt => setForm({ ...form, effect: opt.value })}
                isSearchable={false}
              />
            </div>
            {form.effect === 'limit' && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Max per hour</label>
                  <input type="number" min="1" value={form.maxPerHour} onChange={e => setForm({ ...form, maxPerHour: e.target.value })} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Max per day</label>
                  <input type="number" min="1" value={form.maxPerDay} onChange={e => setForm({ ...form, maxPerDay: e.target.value })} />
                </div>
              </div>
            )}
            <div className="form-group">
              <label>Priority (higher wins on tie-break before deny-wins default)</label>
              <input type="number" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input id={isActiveCheckboxId} type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor={isActiveCheckboxId} style={{ marginBottom: 0 }}>Active</label>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function DecisionsTab() {
  const [decisions, setDecisions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const [filters, setFilters] = useState({ resourceType: '', decision: '' });
  const [chainStatus, setChainStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (filters.resourceType) params.resourceType = filters.resourceType;
      if (filters.decision) params.decision = filters.decision;
      const res = await api.get('/policy/decisions', { params });
      setDecisions(res.data.decisions);
      setTotal(res.data.total);
    } catch (err) {
      showError(`Failed to fetch policy decisions: ${getApiError(err)}`);
    } finally {
      setLoading(false);
    }
  }, [offset, filters]);

  useEffect(() => { fetchDecisions(); }, [fetchDecisions]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    setChainStatus(null);
    try {
      const res = await api.get('/policy/decisions/verify-chain');
      setChainStatus(res.data);
      if (res.data.valid) showSuccess(`Chain verified - ${res.data.checked} records intact`);
      else showError(`Chain integrity broken at record ${res.data.brokenAtId}`);
    } catch (err) {
      showError(`Failed to verify chain: ${getApiError(err)}`);
    } finally {
      setVerifying(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Filter by resource type"
            value={filters.resourceType}
            onChange={e => { setOffset(0); setFilters({ ...filters, resourceType: e.target.value }); }}
            style={{ padding: '0.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }}
          />
          <div style={{ width: '150px' }}>
            <StyledSelect
              options={[{ value: 'allow', label: 'Allow' }, { value: 'deny', label: 'Deny' }]}
              value={filters.decision ? { value: filters.decision, label: filters.decision } : null}
              onChange={opt => { setOffset(0); setFilters({ ...filters, decision: opt?.value || '' }); }}
              placeholder="All decisions"
              isClearable
              isSearchable={false}
            />
          </div>
        </div>
        <button className="btn btn-secondary" onClick={handleVerifyChain} disabled={verifying}>
          <ShieldCheck size={16} /> {verifying ? 'Verifying...' : 'Verify Chain Integrity'}
        </button>
      </div>

      {chainStatus && (
        <div
          className="card"
          style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: chainStatus.valid ? 'var(--success-bg)' : 'var(--error-bg)',
            color: chainStatus.valid ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {chainStatus.valid ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          {chainStatus.valid
            ? `Chain intact - ${chainStatus.checked} of ${chainStatus.total} records verified`
            : `Tampering detected at record ${chainStatus.brokenAtId}: ${chainStatus.reason}`}
        </div>
      )}

      {loading ? (
        <div className="loading-overlay"><div className="spinner"></div></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Resource</th>
                <th>Action</th>
                <th>Decision</th>
                <th>Matched Rule</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map(d => (
                <tr key={d.id}>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(d.createdAt)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{d.user?.email || '-'}</td>
                  <td>{d.resourceType}: <code>{d.resourceId}</code></td>
                  <td><code>{d.action}</code></td>
                  <td><span className={`badge ${d.decision === 'allow' ? 'badge-success' : 'badge-danger'}`}>{d.decision}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{d.matchedRule?.description || (d.matchedRuleId ? d.matchedRuleId : '-')}</td>
                  <td style={{ fontSize: '0.85rem' }}>{d.reason}</td>
                </tr>
              ))}
              {decisions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-light)' }}>No policy decisions recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
        <button className="btn" style={{ padding: '0.25rem 0.75rem' }} onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</button>
        <span style={{ padding: '0.25rem 0.75rem' }}>Page {currentPage} of {pageCount} ({total} total)</span>
        <button className="btn" style={{ padding: '0.25rem 0.75rem' }} onClick={() => setOffset(offset + limit)} disabled={currentPage >= pageCount}>Next</button>
      </div>
    </div>
  );
}

function Policy() {
  const [activeTab, setActiveTab] = useState('rules');

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} /> Policy
          </h1>
          <p className="page-subtitle">Control who can access what, and audit every decision with a tamper-evident log</p>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: '1.5rem', gap: '0.5rem' }}>
        <div className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
          Rules
        </div>
        <div className={`tab ${activeTab === 'decisions' ? 'active' : ''}`} onClick={() => setActiveTab('decisions')} style={{ padding: '0.6rem 1rem', cursor: 'pointer' }}>
          Decisions
        </div>
      </div>

      {activeTab === 'rules' ? <RulesTab /> : <DecisionsTab />}
    </div>
  );
}

export default Policy;
