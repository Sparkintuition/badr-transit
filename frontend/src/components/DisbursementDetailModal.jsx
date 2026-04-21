import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import ConfirmDialog from './ConfirmDialog';
import DisbursementFormModal from '../pages/DisbursementFormModal';
import { formatDate, formatDateTime, formatMAD, DISBURSEMENT_METHOD_LABEL, DISBURSEMENT_STATUS_LABEL } from '../utils/format';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ d }) {
  const map = {
    pending_signature: 'bg-blue-900/40 text-blue-300 border border-blue-800',
    signed:            'bg-amber-900/40 text-amber-300 border border-amber-800',
    invoiced:          'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
    reimbursed:        'bg-emerald-700/60 text-white border border-emerald-600',
    cancelled:         'bg-red-900/40 text-red-300 border border-red-800',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${map[d.status] || 'bg-zinc-700 text-zinc-300'}`}>
      {DISBURSEMENT_STATUS_LABEL[d.status] || d.status}
      {d.is_red_flag_invoice && <span title="Non facturé depuis trop longtemps">🔴</span>}
      {d.is_red_flag_receipt && <span title="Reçu manquant depuis trop longtemps">🟡</span>}
    </span>
  );
}

// ─── Info field ───────────────────────────────────────────────────────────────

function InfoField({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-[#A1A1AA] uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-[#FAFAFA]">{value || <span className="text-[#555555]">—</span>}</dd>
    </div>
  );
}

// ─── File section ─────────────────────────────────────────────────────────────

function FileSection({ label, endpoint, hasFile, canUpload, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Fichier téléchargé.');
      onUploaded?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur de téléchargement.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#A1A1AA]">{label}</span>
        {hasFile ? (
          <a href={`/api${endpoint}`} target="_blank" rel="noreferrer"
            className="text-xs text-[#60A5FA] hover:underline">
            Voir le fichier
          </a>
        ) : (
          <span className="text-xs text-[#555555]">Aucun fichier</span>
        )}
      </div>
      {canUpload && (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs px-3 py-1.5 border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors disabled:opacity-50"
          >
            {uploading ? 'Envoi…' : hasFile ? 'Remplacer' : 'Ajouter'}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFile} />
        </>
      )}
    </div>
  );
}

// ─── No receipt toggle ────────────────────────────────────────────────────────

function NoReceiptToggle({ d, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');

  if (d.no_receipt_expected) {
    return (
      <div className="bg-zinc-800/50 rounded-lg px-4 py-3">
        <p className="text-xs font-medium text-[#A1A1AA] mb-0.5">Aucun reçu attendu</p>
        {d.no_receipt_reason && <p className="text-sm text-[#FAFAFA]">{d.no_receipt_reason}</p>}
        <button
          onClick={async () => {
            setSaving(true);
            try {
              await api.post(`/disbursements/${d.id}/no-receipt`, { no_receipt_expected: false });
              onUpdated();
            } catch (err) {
              toast.error(err.response?.data?.error || 'Erreur.');
            } finally { setSaving(false); }
          }}
          disabled={saving}
          className="mt-2 text-xs text-[#60A5FA] hover:underline disabled:opacity-50"
        >
          Annuler — marquer comme reçu attendu
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
      >
        + Marquer « aucun reçu ne sera remis »
      </button>
    );
  }

  return (
    <div className="bg-zinc-800/50 rounded-lg px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-[#A1A1AA]">Aucun reçu ne sera remis</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Motif (prestataire informel, pas de reçu disponible…)"
        className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-xs text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none resize-none"
      />
      <div className="flex gap-2 items-center">
        <button onClick={() => { setShowForm(false); setReason(''); }} className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA]">Annuler</button>
        <button
          onClick={async () => {
            if (!reason.trim()) return;
            setSaving(true);
            try {
              await api.post(`/disbursements/${d.id}/no-receipt`, { no_receipt_expected: true, reason: reason.trim() });
              onUpdated();
              setShowForm(false);
            } catch (err) {
              toast.error(err.response?.data?.error || 'Erreur.');
            } finally { setSaving(false); }
          }}
          disabled={saving || !reason.trim()}
          className="text-xs px-3 py-1.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? '…' : 'Confirmer'}
        </button>
      </div>
    </div>
  );
}

// ─── Sign with proof dialog (check / transfer) ────────────────────────────────

function SignWithProofDialog({ d, onClose, onSigned }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [paidDate, setPaidDate] = useState(d.paid_date || new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [fileErr, setFileErr] = useState('');

  async function handleSubmit() {
    if (!file) { setFileErr('Copie du moyen de paiement requise.'); return; }
    setSaving(true);
    const fd = new FormData();
    fd.append('payment_proof', file);
    if (paidDate) fd.append('paid_date', paidDate);
    try {
      await api.post(`/disbursements/${d.id}/validate`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Décaissement validé ✓');
      onSigned();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la validation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-1">Valider ce décaissement</h2>
        <p className="text-xs text-[#A1A1AA] mb-4">
          {formatMAD(d.amount_cents)} — {d.job.client.name} — {d.job.dossier_number}
        </p>

        <div className="mb-4 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
          <p className="text-xs text-amber-300">
            Paiement par {DISBURSEMENT_METHOD_LABEL[d.payment_method]} — une copie du moyen de paiement est obligatoire.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
              Copie du moyen de paiement (Ex: Chèque) <span className="text-red-400">*</span>
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer border border-dashed border-[#555555] rounded-lg px-4 py-3 text-center hover:border-[#888888] transition-colors"
            >
              {file
                ? <p className="text-sm text-emerald-400">{file.name}</p>
                : <p className="text-xs text-[#A1A1AA]">Cliquer pour choisir un fichier (PDF, JPG, PNG…)</p>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] || null); setFileErr(''); }}
            />
            {fileErr && <p className="text-xs text-red-400 mt-1">{fileErr}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-1">Date de paiement</label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? '…' : 'Valider'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cancel modal ─────────────────────────────────────────────────────────────

function CancelModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (reason.trim().length < 5) { setErr('Minimum 5 caractères.'); return; }
    setSaving(true);
    try { await onConfirm(reason.trim()); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-3">Annuler ce décaissement</h2>
        <label className="block text-xs text-[#A1A1AA] mb-1">Raison <span className="text-red-400">*</span></label>
        <textarea
          value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }}
          rows={3} placeholder="Motif de l'annulation…"
          className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] resize-none"
        />
        {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">Retour</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? '…' : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function DisbursementDetailModal({ disbursementId, onClose, onUpdated }) {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [signConfirm, setSignConfirm] = useState(false);
  const [signProofDialog, setSignProofDialog] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isAccountant = user?.role === 'accountant';

  function load() {
    setLoading(true);
    api.get(`/disbursements/${disbursementId}`)
      .then((r) => setD(r.data))
      .catch(() => toast.error('Impossible de charger le décaissement.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [disbursementId]);

  function openSign() {
    if (d.payment_method === 'cash') {
      setSignConfirm(true);
    } else {
      setSignProofDialog(true);
    }
  }

  async function handleSignCash() {
    try {
      await api.post(`/disbursements/${d.id}/validate`, {});
      toast.success('Décaissement validé ✓');
      load();
      onUpdated?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la validation.');
    } finally {
      setSignConfirm(false);
    }
  }

  async function handleCancel(reason) {
    try {
      await api.post(`/disbursements/${d.id}/cancel`, { reason });
      toast.success('Décaissement annulé.');
      setCancelModal(false);
      load();
      onUpdated?.();
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de l'annulation.");
      throw err;
    }
  }

  const canUploadFiles = isAdmin || isAccountant || (d?.created_by_user?.id === user?.id);
  const canEdit = d?.status === 'pending_signature' && (isAdmin || isAccountant || d?.created_by_user?.id === user?.id);
  const canCancelAdmin = isAdmin && ['pending_signature', 'signed'].includes(d?.status);
  const canCancelAccountant = isAccountant && d?.status === 'pending_signature';
  const showPaymentProof = d && ['check', 'transfer'].includes(d.payment_method);
  const showNoReceiptToggle = d
    && ['signed', 'invoiced', 'reimbursed'].includes(d.status)
    && !d.has_receipt
    && (isAdmin || isAccountant);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#333333] flex items-start justify-between sticky top-0 bg-[#242424] z-10">
          <div>
            {d && (
              <>
                <div className="text-2xl font-bold text-[#FAFAFA]">{formatMAD(d.amount_cents)}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge d={d} />
                  <Link to={`/app/dossiers/${d.job.id}`} onClick={onClose}
                    className="text-xs text-[#60A5FA] hover:underline font-mono">
                    {d.job.dossier_number}
                  </Link>
                  <span className="text-xs text-[#A1A1AA]">{d.job.client.name}</span>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="text-[#A1A1AA] hover:text-[#FAFAFA] text-xl leading-none ml-4">×</button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#A1A1AA] text-sm">Chargement…</div>
        ) : !d ? (
          <div className="py-16 text-center text-[#A1A1AA] text-sm">Décaissement introuvable.</div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Invoice red flag banner */}
            {d.is_red_flag_invoice && (
              <div className="bg-red-900/30 border border-red-700/50 rounded-lg px-4 py-3 text-sm text-red-300 font-medium">
                ⚠ Payé depuis {d.days_since_paid} jours — non facturé
              </div>
            )}

            {/* Receipt alert banner */}
            {d.is_red_flag_receipt && (
              <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 text-sm text-amber-300 font-medium">
                ⚠ Reçu du tiers manquant depuis {d.days_since_paid} jours
              </div>
            )}

            {/* Cancelled banner */}
            {d.status === 'cancelled' && d.cancelled_reason && (
              <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3">
                <p className="text-xs text-red-400 font-medium mb-1">Annulé — motif :</p>
                <p className="text-sm text-[#FAFAFA]">{d.cancelled_reason}</p>
              </div>
            )}

            {/* Info grid */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoField label="Client" value={d.job.client.name} />
              <InfoField label="Dossier" value={d.job.dossier_number} />
              <InfoField label="Type" value={d.type} />
              <InfoField label="Moyen" value={DISBURSEMENT_METHOD_LABEL[d.payment_method]} />
              {(d.payment_method === 'check' || d.payment_method === 'transfer') && (
                <InfoField
                  label={d.payment_method === 'transfer' ? 'Référence virement' : 'N° Chèque'}
                  value={d.payment_reference}
                />
              )}
              <InfoField label="Date paiement" value={formatDate(d.paid_date)} />
              {d.description && <div className="col-span-2"><InfoField label="Description" value={d.description} /></div>}
              <InfoField label="Demandé par" value={d.created_by_user?.name} />
              <InfoField label="Demandé le" value={formatDateTime(d.requested_at)} />
              {d.signed_at && (
                <>
                  <InfoField label="Validé par" value={d.signed_by_user?.name} />
                  <InfoField label="Validé le" value={formatDateTime(d.signed_at)} />
                </>
              )}
              {d.invoice_facture_number && (
                <InfoField label="Facture N°" value={d.invoice_facture_number} />
              )}
            </dl>

            {/* Files */}
            <div className="border-t border-[#333333] pt-4">
              <p className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wide mb-3">Fichiers</p>

              {/* Payment proof — check and transfer only */}
              {showPaymentProof && (
                <FileSection
                  label="Copie du moyen de paiement (Ex: Chèque)"
                  endpoint={`/disbursements/${d.id}/payment-proof`}
                  hasFile={d.has_payment_proof}
                  canUpload={canUploadFiles && d.status !== 'cancelled'}
                  onUploaded={() => { load(); onUpdated?.(); }}
                />
              )}

              {/* Receipt from third party */}
              <FileSection
                label="Reçu du tiers"
                endpoint={`/disbursements/${d.id}/receipt`}
                hasFile={d.has_receipt}
                canUpload={canUploadFiles && d.status !== 'cancelled'}
                onUploaded={() => { load(); onUpdated?.(); }}
              />

              {/* No receipt toggle */}
              {showNoReceiptToggle && (
                <div className="mt-3">
                  <NoReceiptToggle d={d} onUpdated={() => { load(); onUpdated?.(); }} />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-[#333333]">
              {/* Sign */}
              {isAdmin && d.status === 'pending_signature' && (
                <button
                  onClick={openSign}
                  className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Valider
                </button>
              )}
              {/* Edit */}
              {canEdit && (
                <button onClick={() => setEditModal(true)}
                  className="px-4 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                  Modifier
                </button>
              )}
              {/* Cancel */}
              {(canCancelAdmin || canCancelAccountant) && (
                <button onClick={() => setCancelModal(true)}
                  className="px-4 py-2 border border-red-800 text-red-400 text-sm rounded-lg hover:bg-red-900/20 transition-colors">
                  Annuler
                </button>
              )}
              <button onClick={onClose}
                className="px-4 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors ml-auto">
                Fermer
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-modals */}
      {signConfirm && d && (
        <ConfirmDialog
          title="Confirmer la validation"
          description={`Valider ${formatMAD(d.amount_cents)} — ${d.job.client.name} — dossier ${d.job.dossier_number} ?`}
          confirmLabel="Valider"
          variant="default"
          onConfirm={handleSignCash}
          onCancel={() => setSignConfirm(false)}
        />
      )}

      {signProofDialog && d && (
        <SignWithProofDialog
          d={d}
          onClose={() => setSignProofDialog(false)}
          onSigned={() => { setSignProofDialog(false); load(); onUpdated?.(); }}
        />
      )}

      {cancelModal && (
        <CancelModal onClose={() => setCancelModal(false)} onConfirm={handleCancel} />
      )}

      {editModal && d && (
        <DisbursementFormModal
          mode="edit"
          disbursement={d}
          onClose={() => setEditModal(false)}
          onSaved={() => { setEditModal(false); load(); onUpdated?.(); }}
        />
      )}
    </div>
  );
}
