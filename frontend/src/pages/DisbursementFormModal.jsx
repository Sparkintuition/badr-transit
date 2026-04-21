import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const labelClass = 'block text-xs font-medium text-[#A1A1AA] mb-1';

const CASH_AUTO_SIGN_THRESHOLD_MAD = 500;

export default function DisbursementFormModal({ onClose, onSaved, initialJobId = null, mode = 'create', disbursement = null }) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const jobDropdownRef = useRef(null);
  const typeDropdownRef = useRef(null);

  const [form, setForm] = useState({
    job_id: disbursement?.job?.id ?? initialJobId ?? '',
    job_label: disbursement ? `${disbursement.job.dossier_number} — ${disbursement.job.client.name}` : '',
    client_name: disbursement?.job?.client?.name ?? '',
    type: disbursement?.type ?? '',
    description: disbursement?.description ?? '',
    amount_mad: disbursement ? String(disbursement.amount_cents / 100) : '',
    payment_method: disbursement?.payment_method ?? 'check',
    payment_reference: disbursement?.payment_reference ?? '',
    paid_date: disbursement?.paid_date ?? new Date().toISOString().slice(0, 10),
    no_receipt_expected: disbursement?.no_receipt_expected ?? false,
    no_receipt_reason: disbursement?.no_receipt_reason ?? '',
  });

  useEffect(() => {
    api.get('/jobs', { params: { status: 'open', page_size: 200 } })
      .then((r) => {
        setJobs(r.data.items || []);
        if (initialJobId && !disbursement) {
          const j = (r.data.items || []).find((j) => j.id === initialJobId);
          if (j) {
            setForm((f) => ({
              ...f,
              job_id: j.id,
              job_label: `${j.dossier_number} — ${j.client.name}`,
              client_name: j.client.name,
            }));
          }
        }
      })
      .catch(() => {});

    api.get('/disbursements/suggestions')
      .then((r) => setSuggestions(r.data || []))
      .catch(() => {});
  }, [initialJobId, disbursement]);

  useEffect(() => {
    function handleClick(e) {
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(e.target)) setShowJobDropdown(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target)) setShowTypeDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredJobs = jobs.filter((j) => {
    const q = jobSearch.toLowerCase();
    return j.dossier_number.toLowerCase().includes(q) || j.client.name.toLowerCase().includes(q);
  }).slice(0, 20);

  const filteredSuggestions = suggestions.filter((s) =>
    s.toLowerCase().includes(form.type.toLowerCase())
  ).slice(0, 10);

  const isCash = form.payment_method === 'cash';
  const isCheckMethod = form.payment_method === 'check';
  const needsReference = form.payment_method === 'check' || form.payment_method === 'transfer';
  const referenceLabel = form.payment_method === 'transfer' ? 'Référence virement' : 'N° Chèque';
  const amountCents = Math.round(parseFloat(form.amount_mad || '0') * 100);
  const needsSignature = form.payment_method !== 'cash' || amountCents > CASH_AUTO_SIGN_THRESHOLD_MAD * 100;
  const canAutoSign = isCash && amountCents > 0 && amountCents <= CASH_AUTO_SIGN_THRESHOLD_MAD * 100 && ['admin', 'accountant'].includes(user?.role);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  }

  function selectJob(job) {
    set('job_id', job.id);
    set('job_label', `${job.dossier_number} — ${job.client.name}`);
    set('client_name', job.client.name);
    setJobSearch('');
    setShowJobDropdown(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const newErrors = {};
    if (!form.job_id) newErrors.job_id = 'Dossier requis.';
    if (!form.type.trim()) newErrors.type = 'Type requis.';
    if (!form.amount_mad || isNaN(amountCents) || amountCents < 1) newErrors.amount_mad = 'Montant invalide.';
    if (needsReference && !form.payment_reference.trim()) newErrors.payment_reference = 'Requis.';
    if (isCash && form.no_receipt_expected && !form.no_receipt_reason.trim()) {
      newErrors.no_receipt_reason = 'Motif requis.';
    }

    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

    setSaving(true);
    try {
      const payload = {
        job_id: form.job_id,
        type: form.type.trim(),
        description: form.description.trim() || null,
        amount_cents: amountCents,
        payment_method: form.payment_method,
        payment_reference: needsReference ? form.payment_reference.trim() : null,
        paid_date: form.paid_date || null,
        no_receipt_expected: isCash && form.no_receipt_expected ? 1 : 0,
        no_receipt_reason: isCash && form.no_receipt_expected ? form.no_receipt_reason.trim() : null,
      };

      if (mode === 'edit') {
        await api.put(`/disbursements/${disbursement.id}`, payload);
        toast.success('Décaissement mis à jour.');
      } else {
        await api.post('/disbursements', payload);
        toast.success('Décaissement créé.');
      }
      onSaved?.();
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setErrors(data.errors);
      else toast.error(data?.error || "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-[#333333] flex items-center justify-between sticky top-0 bg-[#242424] z-10">
          <h2 className="text-base font-semibold text-[#FAFAFA]">
            {mode === 'edit' ? 'Modifier le décaissement' : 'Nouveau décaissement'}
          </h2>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Signature banner */}
          {needsSignature && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 text-xs text-amber-300">
              Ce décaissement nécessitera la validation du CEO avant d'être considéré comme payé.
            </div>
          )}

          {/* Dossier */}
          <div ref={jobDropdownRef} className="relative">
            <label className={labelClass}>Dossier <span className="text-red-400">*</span></label>
            {mode === 'edit' ? (
              <div className={`${inputClass} text-[#A1A1AA] cursor-not-allowed`}>{form.job_label || '—'}</div>
            ) : (
              <>
                <input
                  type="text"
                  value={showJobDropdown ? jobSearch : form.job_label}
                  onChange={(e) => { setJobSearch(e.target.value); setShowJobDropdown(true); }}
                  onFocus={() => { setJobSearch(''); setShowJobDropdown(true); }}
                  placeholder="Rechercher par N° dossier ou client…"
                  className={inputClass}
                  autoComplete="off"
                />
                {showJobDropdown && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-[#333333] rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {filteredJobs.length === 0
                      ? <p className="px-4 py-3 text-xs text-[#A1A1AA]">Aucun dossier ouvert trouvé.</p>
                      : filteredJobs.map((j) => (
                        <button key={j.id} type="button"
                          onClick={() => selectJob(j)}
                          className="w-full text-left px-4 py-2.5 hover:bg-[#2A2A2A] transition-colors">
                          <span className="text-sm font-mono text-[#FAFAFA]">{j.dossier_number}</span>
                          <span className="text-xs text-[#A1A1AA] ml-2">{j.client.name}</span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </>
            )}
            {errors.job_id && <p className="text-xs text-red-400 mt-1">{errors.job_id}</p>}
          </div>

          {/* Client (read-only) */}
          {form.client_name && (
            <div>
              <label className={labelClass}>Client</label>
              <div className={`${inputClass} text-[#A1A1AA] cursor-default`}>{form.client_name}</div>
            </div>
          )}

          {/* Type */}
          <div ref={typeDropdownRef} className="relative">
            <label className={labelClass}>Type <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.type}
              onChange={(e) => { set('type', e.target.value); setShowTypeDropdown(true); }}
              onFocus={() => setShowTypeDropdown(true)}
              placeholder="Ex: Droits de douane, Frais de port…"
              className={inputClass}
              autoComplete="off"
            />
            {showTypeDropdown && filteredSuggestions.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-[#1A1A1A] border border-[#333333] rounded-lg shadow-xl">
                {filteredSuggestions.map((s) => (
                  <button key={s} type="button"
                    onClick={() => { set('type', s); setShowTypeDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#2A2A2A] transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {errors.type && <p className="text-xs text-red-400 mt-1">{errors.type}</p>}
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Ex: Droits de douane DUM 300.10-32267"
              className={inputClass}
            />
          </div>

          {/* Amount */}
          <div>
            <label className={labelClass}>Montant <span className="text-red-400">*</span></label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amount_mad}
                onChange={(e) => set('amount_mad', e.target.value)}
                placeholder="0,00"
                className={`${inputClass} pr-12`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">MAD</span>
            </div>
            {errors.amount_mad && <p className="text-xs text-red-400 mt-1">{errors.amount_mad}</p>}
          </div>

          {/* Payment method */}
          <div>
            <label className={labelClass}>Moyen de paiement <span className="text-red-400">*</span></label>
            <div className="flex gap-3">
              {['check', 'cash', 'transfer'].map((m) => {
                const labels = { check: 'Chèque', cash: 'Espèces', transfer: 'Virement' };
                return (
                  <label key={m} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm cursor-pointer transition-colors ${
                    form.payment_method === m
                      ? 'border-[#3B5BDB] bg-[#3B5BDB]/20 text-[#FAFAFA]'
                      : 'border-[#333333] text-[#A1A1AA] hover:border-[#555555]'
                  }`}>
                    <input type="radio" name="payment_method" value={m} checked={form.payment_method === m}
                      onChange={() => set('payment_method', m)} className="sr-only" />
                    {labels[m]}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Payment reference (check number or transfer ref) */}
          {needsReference && (
            <div>
              <label className={labelClass}>{referenceLabel} <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.payment_reference}
                onChange={(e) => set('payment_reference', e.target.value)}
                placeholder={form.payment_method === 'transfer' ? 'Ex: VIR-2024-001' : '123456'}
                className={inputClass}
              />
              {errors.payment_reference && <p className="text-xs text-red-400 mt-1">{errors.payment_reference}</p>}
            </div>
          )}

          {/* Paid date */}
          <div>
            <label className={labelClass}>Date de paiement</label>
            <input
              type="date"
              value={form.paid_date}
              onChange={(e) => set('paid_date', e.target.value)}
              className={inputClass}
            />
            {needsReference && (
              <p className="text-xs text-[#A1A1AA] mt-1">Pour un chèque, la date peut être fixée à la validation.</p>
            )}
          </div>

          {/* No receipt expected — cash only */}
          {isCash && (
            <div className="border border-[#333333] rounded-lg p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.no_receipt_expected}
                  onChange={(e) => set('no_receipt_expected', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-[#FAFAFA]">Aucun reçu ne sera remis</span>
              </label>
              {form.no_receipt_expected && (
                <div>
                  <label className={labelClass}>Motif <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.no_receipt_reason}
                    onChange={(e) => set('no_receipt_reason', e.target.value)}
                    placeholder="Ex: Prestataire informel, pas de reçu disponible"
                    className={inputClass}
                  />
                  {errors.no_receipt_reason && <p className="text-xs text-red-400 mt-1">{errors.no_receipt_reason}</p>}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
              {saving ? 'Enregistrement…' : canAutoSign ? 'Enregistrer' : 'Enregistrer et envoyer pour validation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
