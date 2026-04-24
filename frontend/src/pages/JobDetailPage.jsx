import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import JobFormModal from './JobFormModal';
import DisbursementFormModal from './DisbursementFormModal';
import DisbursementDetailModal from '../components/DisbursementDetailModal';
import { formatDate, formatDateTime, formatMAD, jobStatusLabel, jobStatusBadgeClass, DISBURSEMENT_METHOD_LABEL, DISBURSEMENT_STATUS_LABEL } from '../utils/format';

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] focus:border-transparent';
const cardClass = 'bg-[#242424] rounded-xl border border-[#333333] p-5';
const sectionTitleClass = 'text-sm font-semibold text-[#FAFAFA] mb-4 flex items-center justify-between';

// ─── Milestone icon ───────────────────────────────────────────────────────────

function MilestoneIcon({ status }) {
  if (status === 'completed') return (
    <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
  if (status === 'in_progress') return (
    <div className="w-7 h-7 rounded-full border-2 border-blue-500 bg-blue-500/20 flex items-center justify-center flex-shrink-0">
      <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
    </div>
  );
  if (status === 'skipped') return (
    <div className="w-7 h-7 rounded-full bg-[#333333] flex items-center justify-center flex-shrink-0">
      <svg className="w-3.5 h-3.5 text-[#A1A1AA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
  return <div className="w-7 h-7 rounded-full border-2 border-[#555555] flex-shrink-0" />;
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

// ─── StatusChangeModal ────────────────────────────────────────────────────────

function StatusChangeModal({ jobId, targetStatus, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isCancellation = targetStatus === 'cancelled';
  const label = targetStatus === 'released' ? 'Livré' : 'Annulé';

  const handleConfirm = async () => {
    if (isCancellation && !notes.trim()) { setError('La raison est requise.'); return; }
    setSaving(true);
    try {
      await api.patch(`/jobs/${jobId}/status`, { status: targetStatus, notes: notes || undefined });
      toast.success(`Statut mis à jour : ${label}`);
      onDone();
    } catch (err) {
      setError(err.response?.data?.errors?.notes || err.response?.data?.error || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-2">
          {isCancellation ? 'Annuler ce dossier' : 'Marquer comme livré'}
        </h2>
        {isCancellation && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-300 mb-1">Raison <span className="text-red-400">*</span></label>
            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); setError(''); }}
              rows={3} className={`${inputClass} resize-none`}
              placeholder="Motif de l'annulation…" />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        )}
        {!isCancellation && <p className="text-sm text-[#A1A1AA] mb-4">La date de livraison sera fixée à aujourd'hui.</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">Annuler</button>
          <button onClick={handleConfirm} disabled={saving}
            className={`flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${isCancellation ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1E3A8A] hover:bg-[#1E40AF]'}`}>
            {saving ? '…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TransferDeclarantModal ───────────────────────────────────────────────────

function TransferDeclarantModal({ jobId, currentDeclarantId, onClose, onDone }) {
  const [logisticsUsers, setLogisticsUsers] = useState([]);
  const [toUserId, setToUserId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/logistics-users').then((r) => {
      const others = r.data.filter((u) => u.id !== currentDeclarantId);
      setLogisticsUsers(others);
      if (others.length > 0) setToUserId(String(others[0].id));
    }).catch(() => {});
  }, [currentDeclarantId]);

  const handleConfirm = async () => {
    if (!toUserId) { setError('Veuillez sélectionner un déclarant.'); return; }
    setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/transfer-declarant`, {
        to_user_id: parseInt(toUserId, 10),
        note: note.trim() || null,
      });
      toast.success('Dossier transféré.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.errors?.to_user_id || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-4">Transférer le dossier</h2>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Transférer à <span className="text-red-400">*</span></label>
            <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className={inputClass}>
              <option value="">— Sélectionner —</option>
              {logisticsUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Note (optionnel)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className={`${inputClass} resize-none`} placeholder="Raison du transfert…" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">Annuler</button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? '…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ForceClaimModal ──────────────────────────────────────────────────────────

function ForceClaimModal({ jobId, currentDeclarantName, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (note.trim().length < 5) { setError('Le motif doit contenir au moins 5 caractères.'); return; }
    setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/force-claim-declarant`, { note: note.trim() });
      toast.success('Dossier réclamé.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.errors?.note || err.response?.data?.error || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-2">Réclamer ce dossier</h2>
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/50 text-xs text-amber-300">
          Déclarant actuel : <span className="font-semibold">{currentDeclarantName}</span>. Le changement sera tracé.
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Motif <span className="text-red-400">*</span></label>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(''); }} rows={3}
              className={`${inputClass} resize-none`}
              placeholder="Ex : Adil en pause déjeuner — mise à jour urgente" />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">Annuler</button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? '…' : 'Réclamer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ReleaseDeclarantModal ────────────────────────────────────────────────────

function ReleaseDeclarantModal({ jobId, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (note.trim().length < 5) { setError('Le motif doit contenir au moins 5 caractères.'); return; }
    setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/release-declarant`, { note: note.trim() });
      toast.success('Dossier libéré.');
      onDone();
    } catch (err) {
      setError(err.response?.data?.errors?.note || err.response?.data?.error || 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-2">Libérer ce dossier</h2>
        <div className="mb-4 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/50 text-xs text-amber-300">
          Le dossier retournera dans le pool des dossiers non réclamés. Un motif est requis.
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-300 mb-1">Motif (obligatoire) <span className="text-red-400">*</span></label>
          <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(''); }}
            rows={3} className={`${inputClass} resize-none`}
            placeholder="Ex: Fin de journée, passage à Nawal" />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">Annuler</button>
          <button onClick={handleConfirm} disabled={saving}
            className="flex-1 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50">
            {saving ? '…' : 'Confirmer la libération'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Assignment log entry ─────────────────────────────────────────────────────

function AssignmentLogEntry({ entry }) {
  const isForceClaim = entry.is_force_claim === 1;
  const isCreation = entry.note === 'Création du dossier';
  const isRelease = entry.to_user_id === null && entry.from_user_id !== null;
  const isClaim = entry.note === 'Réclamé' && entry.from_user_id === null;

  let icon = '↔';
  let colorClass = 'text-[#60A5FA]';
  if (isForceClaim) { icon = '⚡'; colorClass = 'text-amber-400'; }
  else if (isCreation) { icon = '✦'; colorClass = 'text-emerald-400'; }
  else if (isRelease) { icon = '↗'; colorClass = 'text-zinc-400'; }
  else if (isClaim) { icon = '↙'; colorClass = 'text-emerald-400'; }

  let text = '';
  if (isCreation) {
    text = entry.to_user_name
      ? `Créé et attribué à ${entry.to_user_name}`
      : 'Créé sans déclarant';
  } else if (isRelease) {
    text = `Libéré par ${entry.changed_by_name}`;
  } else if (isClaim) {
    text = `Réclamé par ${entry.to_user_name}`;
  } else if (isForceClaim) {
    text = `Réclamé de force par ${entry.changed_by_name}${entry.from_user_name ? ` (était : ${entry.from_user_name})` : ''}`;
  } else {
    const from = entry.from_user_name || 'Non réclamé';
    const to = entry.to_user_name || 'Libéré';
    text = `Transféré : ${from} → ${to}`;
    if (entry.changed_by_name && entry.changed_by_name !== entry.from_user_name) {
      text += ` (par ${entry.changed_by_name})`;
    }
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <span className={`text-sm flex-shrink-0 ${colorClass}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-300">{text}</p>
        {entry.note && !isCreation && !isClaim && (
          <p className="text-xs text-[#A1A1AA] mt-0.5 italic">"{entry.note}"</p>
        )}
        <p className="text-xs text-[#555555] mt-0.5">{formatDateTime(entry.changed_at)}</p>
      </div>
      {isForceClaim && (
        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-800/40 flex-shrink-0">force</span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [editModal, setEditModal] = useState(false);
  const [statusModal, setStatusModal] = useState(null); // 'released' | 'cancelled'
  const [confirm, setConfirm] = useState(null);
  const [disbFormOpen, setDisbFormOpen] = useState(false);
  const [disbDetailId, setDisbDetailId] = useState(null);

  // Declarant management
  const [transferDialog, setTransferDialog] = useState(false);
  const [forceClaimDialog, setForceClaimDialog] = useState(false);
  const [releaseDialog, setReleaseDialog] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // DUM state
  const [dumAdding, setDumAdding] = useState(false);
  const [dumAddForm, setDumAddForm] = useState({ dum_number: '', dum_date: '' });
  const [dumEditId, setDumEditId] = useState(null);
  const [dumEditForm, setDumEditForm] = useState({ dum_number: '', dum_date: '' });
  const [dumSaving, setDumSaving] = useState(false);

  // Milestone state
  const [skippingMsId, setSkippingMsId] = useState(null);
  const [skipNote, setSkipNote] = useState('');
  const [msSaving, setMsSaving] = useState(null);

  // Service charge state
  const [scAdding, setScAdding] = useState(false);
  const [scForm, setScForm] = useState({ designation: '', amount_mad: '', tva_rate: '20', is_transport: false });
  const [scSaving, setScSaving] = useState(false);
  const [scErrors, setScErrors] = useState({});

  // Observations state
  const [obsDraft, setObsDraft] = useState('');
  const [obsSaving, setObsSaving] = useState(false);

  const isAdmin = user?.role === 'admin';
  const canEdit = ['admin', 'accountant', 'logistics'].includes(user?.role);
  const canChangeStatus = ['admin', 'accountant'].includes(user?.role);
  const canSeeFinancial = ['admin', 'accountant'].includes(user?.role);

  const loadJob = useCallback(() => {
    setLoading(true);
    api.get(`/jobs/${id}`)
      .then((r) => {
        setJob(r.data);
        setObsDraft(r.data.observations ?? '');
      })
      .catch(() => toast.error('Impossible de charger le dossier.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadJob(); }, [loadJob]);

  if (loading) {
    return <div className="py-16 text-center text-[#A1A1AA] text-sm">Chargement…</div>;
  }
  if (!job) {
    return <div className="py-16 text-center text-[#A1A1AA] text-sm">Dossier introuvable.</div>;
  }

  // Declarant role checks
  const isDeclarant = user?.id === job.declarant?.id;
  const hasDeclarant = !!job.declarant;

  const completedMs = job.milestones.filter((m) => m.status === 'completed').length;
  const totalMs = job.milestones.length;

  // ── Milestone actions ─────────────────────────────────────────────────────

  const updateMilestone = async (msId, status, notes) => {
    setMsSaving(msId);
    try {
      await api.patch(`/jobs/${id}/milestones/${msId}`, { status, notes: notes || null });
      toast.success('Étape mise à jour ✓');
      loadJob();
      if (status === 'skipped') { setSkippingMsId(null); setSkipNote(''); }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    } finally {
      setMsSaving(null);
    }
  };

  // ── DUM actions ───────────────────────────────────────────────────────────

  const addDum = async () => {
    if (!dumAddForm.dum_number.trim()) { toast.error('Numéro DUM requis.'); return; }
    setDumSaving(true);
    try {
      await api.post(`/jobs/${id}/dums`, { dum_number: dumAddForm.dum_number.trim(), dum_date: dumAddForm.dum_date || null });
      setDumAdding(false); setDumAddForm({ dum_number: '', dum_date: '' });
      loadJob();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    finally { setDumSaving(false); }
  };

  const saveDumEdit = async (dumId) => {
    if (!dumEditForm.dum_number.trim()) { toast.error('Numéro DUM requis.'); return; }
    setDumSaving(true);
    try {
      await api.put(`/jobs/${id}/dums/${dumId}`, { dum_number: dumEditForm.dum_number.trim(), dum_date: dumEditForm.dum_date || null });
      setDumEditId(null);
      loadJob();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    finally { setDumSaving(false); }
  };

  const deleteDum = (dum) => setConfirm({
    title: 'Supprimer ce DUM ?',
    description: `DUM N° ${dum.dum_number} sera supprimé définitivement.`,
    confirmLabel: 'Supprimer',
    variant: 'danger',
    onConfirm: async () => {
      setConfirm(null);
      try { await api.delete(`/jobs/${id}/dums/${dum.id}`); loadJob(); toast.success('DUM supprimé.'); }
      catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    },
  });

  // ── Service charge actions ─────────────────────────────────────────────────

  const addServiceCharge = async () => {
    setScErrors({});
    if (!scForm.designation.trim()) { setScErrors({ designation: 'Requis' }); return; }
    const amount_cents = Math.round(parseFloat(scForm.amount_mad) * 100);
    if (!scForm.amount_mad || isNaN(amount_cents) || amount_cents < 0) { setScErrors({ amount_mad: 'Montant invalide' }); return; }
    setScSaving(true);
    try {
      await api.post(`/jobs/${id}/service-charges`, {
        designation: scForm.designation.trim(),
        amount_cents,
        tva_rate: parseInt(scForm.tva_rate, 10),
        is_transport: scForm.is_transport,
      });
      setScAdding(false); setScForm({ designation: '', amount_mad: '', tva_rate: '20', is_transport: false });
      loadJob(); toast.success('Prestation ajoutée.');
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors) setScErrors(data.errors);
      else toast.error(data?.error || 'Erreur.');
    } finally { setScSaving(false); }
  };

  const deleteServiceCharge = (sc) => setConfirm({
    title: 'Supprimer cette prestation ?',
    description: `"${sc.designation}" sera supprimée définitivement.`,
    confirmLabel: 'Supprimer', variant: 'danger',
    onConfirm: async () => {
      setConfirm(null);
      try { await api.delete(`/jobs/${id}/service-charges/${sc.id}`); loadJob(); toast.success('Prestation supprimée.'); }
      catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    },
  });

  // ── Observations save ─────────────────────────────────────────────────────

  const saveObservations = async () => {
    setObsSaving(true);
    try {
      await api.put(`/jobs/${id}`, {
        client_id: job.client.id,
        commis_name: job.commis_name ?? null,
        commis_user_id: job.commis_user?.id ?? null,
        inspecteur: job.inspecteur, recu_le: job.recu_le,
        expediteur_exportateur: job.expediteur_exportateur, nombre_colis_tc: job.nombre_colis_tc,
        poids_brut_kg: job.poids_brut_kg, nature_marchandise: job.nature_marchandise,
        bureau: job.bureau, depot_sequence_date: job.depot_sequence_date,
        arrival_date: job.arrival_date, compagnie_transport: job.compagnie_transport,
        observations: obsDraft || null,
      });
      loadJob(); toast.success('Observations enregistrées.');
    } catch { toast.error('Erreur.'); }
    finally { setObsSaving(false); }
  };

  // ── Declarant actions ─────────────────────────────────────────────────────

  const handleClaimDeclarant = async () => {
    try {
      await api.post(`/jobs/${id}/claim-declarant`);
      toast.success('Dossier réclamé.');
      loadJob();
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
  };

  const handleReleaseDeclarant = () => setReleaseDialog(true);

  // ── Archive / Unarchive ───────────────────────────────────────────────────

  const handleArchive = () => setConfirm({
    title: 'Archiver ce dossier ?', description: 'Le dossier sera archivé et masqué par défaut.', confirmLabel: 'Archiver', variant: 'default',
    onConfirm: async () => {
      setConfirm(null);
      try { await api.post(`/jobs/${id}/archive`); loadJob(); toast.success('Dossier archivé.'); }
      catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    },
  });

  const handleUnarchive = () => setConfirm({
    title: 'Désarchiver ce dossier ?', description: 'Le dossier redeviendra visible dans la liste.', confirmLabel: 'Désarchiver', variant: 'default',
    onConfirm: async () => {
      setConfirm(null);
      try { await api.post(`/jobs/${id}/unarchive`); loadJob(); toast.success('Dossier désarchivé.'); }
      catch (err) { toast.error(err.response?.data?.error || 'Erreur.'); }
    },
  });

  // ── Render ────────────────────────────────────────────────────────────────

  const disbTotal = job.disbursements.reduce((s, d) => s + d.amount_cents, 0);
  const disbUnbilled = job.disbursements.filter((d) => !d.invoice_id).reduce((s, d) => s + d.amount_cents, 0);

  const assignmentsLog = job.assignments_log || [];
  const declarantLog = assignmentsLog.filter((e) => e.field === 'declarant');
  const displayedLog = historyExpanded ? declarantLog : declarantLog.slice(0, 3);

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div>
        <Link to="/app/dossiers" className="text-sm text-[#60A5FA] hover:underline">← Retour aux dossiers</Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-[#FAFAFA] font-mono">{job.dossier_number}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              job.type === 'import' ? 'bg-blue-900/40 text-blue-300 border border-blue-800' : 'bg-amber-900/40 text-amber-300 border border-amber-800'
            }`}>
              {job.type === 'import' ? 'Import' : 'Export'}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${jobStatusBadgeClass(job.status, job.archived)}`}>
              {jobStatusLabel(job.status, job.archived)}
            </span>
          </div>
          <p className="text-sm text-[#A1A1AA] mt-1">{job.client?.name}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => window.open(`/api/jobs/${job.id}/sheet-pdf`, '_blank')}
            className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.75 19.5m10.56-5.671L17.25 19.5m0 0l.345-5.672M17.25 19.5H6.75m10.5 0a48.11 48.11 0 01-10.5 0M6.75 19.5V14.25m10.5 5.25V14.25m0 0a3 3 0 00-3-3H9.75a3 3 0 00-3 3m13.5 0V9.75A2.25 2.25 0 0019.5 7.5h-15A2.25 2.25 0 002.25 9.75v4.5" />
            </svg>
            Imprimer fiche dossier
          </button>

          {/* Declarant management buttons */}
          {user?.role === 'logistics' && !hasDeclarant && (
            <button onClick={handleClaimDeclarant}
              className="px-3 py-1.5 text-sm bg-emerald-700/50 border border-emerald-700 text-emerald-300 rounded-lg hover:bg-emerald-700/70 transition-colors">
              Réclamer ce dossier
            </button>
          )}
          {user?.role === 'logistics' && isDeclarant && (
            <>
              <button onClick={() => setTransferDialog(true)}
                className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                Transférer
              </button>
              <button onClick={handleReleaseDeclarant}
                className="px-3 py-1.5 text-sm border border-[#444] text-zinc-400 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                Libérer
              </button>
            </>
          )}
          {user?.role === 'logistics' && hasDeclarant && !isDeclarant && (
            <button onClick={() => setForceClaimDialog(true)}
              className="px-3 py-1.5 text-sm border border-amber-700 text-amber-300 rounded-lg hover:bg-amber-900/20 transition-colors">
              Réclamer de force
            </button>
          )}
          {canChangeStatus && (
            <button onClick={() => setTransferDialog(true)}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Réassigner
            </button>
          )}

          {canEdit && (
            <button onClick={() => setEditModal(true)}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Modifier
            </button>
          )}
          {canChangeStatus && !job.archived && job.status === 'open' && (
            <button onClick={() => setStatusModal('released')}
              className="px-3 py-1.5 text-sm bg-emerald-700/50 border border-emerald-700 text-emerald-300 rounded-lg hover:bg-emerald-700/70 transition-colors">
              Marquer livré
            </button>
          )}
          {canChangeStatus && !job.archived && ['open', 'released'].includes(job.status) && (
            <button onClick={() => setStatusModal('cancelled')}
              className="px-3 py-1.5 text-sm border border-red-800 text-red-400 rounded-lg hover:bg-red-900/20 transition-colors">
              Annuler
            </button>
          )}
          {canChangeStatus && !job.archived && ['released', 'paid', 'cancelled'].includes(job.status) && (
            <button onClick={handleArchive}
              className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-400 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Archiver
            </button>
          )}
          {isAdmin && job.archived === 1 && (
            <button onClick={handleUnarchive}
              className="px-3 py-1.5 text-sm border border-amber-700 text-amber-300 rounded-lg hover:bg-amber-900/20 transition-colors">
              Désarchiver
            </button>
          )}
        </div>
      </div>

      {/* Info générale */}
      <div className={cardClass}>
        <p className={sectionTitleClass}>
          <span>Informations générales</span>
          {canEdit && (
            <button onClick={() => setEditModal(true)} className="text-xs text-[#60A5FA] hover:underline font-normal">Modifier</button>
          )}
        </p>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
          <InfoField label="Client" value={job.client?.name} />
          <InfoField label="Type" value={job.type === 'import' ? 'Import' : 'Export'} />
          <InfoField label="Statut" value={jobStatusLabel(job.status, job.archived)} />
          <InfoField label="Reçu le" value={formatDate(job.recu_le)} />
          <InfoField label="Date d'arrivée" value={formatDate(job.arrival_date)} />
          <InfoField label="Date de livraison" value={formatDate(job.release_date)} />
          <InfoField label="Expéditeur / Exportateur" value={job.expediteur_exportateur} />
          <InfoField label="Nombre colis / TC" value={job.nombre_colis_tc} />
          <InfoField label="Poids brut (kg)" value={job.poids_brut_kg != null ? `${job.poids_brut_kg} kg` : null} />
          <InfoField label="Nature de marchandise" value={job.nature_marchandise} />
          <InfoField label="Bureau" value={job.bureau} />
          <InfoField label="Compagnie transport" value={job.compagnie_transport} />
          <InfoField label="Dépôt de séquence" value={formatDate(job.depot_sequence_date)} />
          <InfoField label="Inspecteur" value={job.inspecteur} />
          <div>
            <dt className="text-xs text-[#A1A1AA] uppercase tracking-wide mb-0.5">Déclarant</dt>
            <dd className="text-sm">
              {job.declarant
                ? <span className="text-[#FAFAFA]">{job.declarant.name}</span>
                : <span className="text-amber-400">⚠ Non réclamé</span>
              }
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[#A1A1AA] uppercase tracking-wide mb-0.5">Commis</dt>
            <dd className="text-sm text-[#FAFAFA]">
              {job.commis_name
                ? <span>{job.commis_name}</span>
                : job.commis_user
                  ? <span className="text-zinc-400">{job.commis_user.name}</span>
                  : <span className="text-[#555555]">—</span>
              }
            </dd>
          </div>
          <InfoField label="Créé le" value={formatDateTime(job.created_at)} />
        </dl>
      </div>

      {/* DUMs */}
      <div className={cardClass}>
        <p className={sectionTitleClass}>
          <span>DUM(s)</span>
          {canEdit && (
            <button onClick={() => { setDumAdding(true); setDumEditId(null); }}
              className="text-xs text-[#60A5FA] hover:underline font-normal">+ Ajouter</button>
          )}
        </p>
        {job.dums.length === 0 && !dumAdding && (
          <p className="text-sm text-[#A1A1AA]">Aucun DUM enregistré.</p>
        )}
        {job.dums.length > 0 && (
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="border-b border-[#333333]">
                <th className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">DUM N°</th>
                <th className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">Date</th>
                {canEdit && <th className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#333333]">
              {job.dums.map((dum) => (
                <tr key={dum.id}>
                  {dumEditId === dum.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input type="text" value={dumEditForm.dum_number}
                          onChange={(e) => setDumEditForm((f) => ({ ...f, dum_number: e.target.value }))}
                          className={`${inputClass} text-xs`} placeholder="N° DUM" />
                      </td>
                      <td className="py-2 pr-2">
                        <input type="date" value={dumEditForm.dum_date}
                          onChange={(e) => setDumEditForm((f) => ({ ...f, dum_date: e.target.value }))}
                          className={`${inputClass} text-xs`} />
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <button onClick={() => saveDumEdit(dum.id)} disabled={dumSaving}
                            className="text-xs text-emerald-400 hover:underline disabled:opacity-50">Enregistrer</button>
                          <button onClick={() => setDumEditId(null)} className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA]">Annuler</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 font-mono text-xs text-zinc-300 pr-4">{dum.dum_number}</td>
                      <td className="py-2 text-xs text-[#A1A1AA] pr-4">{formatDate(dum.dum_date)}</td>
                      {canEdit && (
                        <td className="py-2">
                          <div className="flex gap-3">
                            <button onClick={() => { setDumEditId(dum.id); setDumEditForm({ dum_number: dum.dum_number, dum_date: dum.dum_date ?? '' }); }}
                              className="text-xs text-[#60A5FA] hover:underline">Modifier</button>
                            <button onClick={() => deleteDum(dum)} className="text-xs text-red-400 hover:text-red-300">Supprimer</button>
                          </div>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {dumAdding && (
          <div className="mt-3 flex gap-2 items-end flex-wrap border-t border-[#333333] pt-3">
            <div className="flex-1 min-w-32">
              <label className="block text-xs text-[#A1A1AA] mb-1">N° DUM</label>
              <input type="text" value={dumAddForm.dum_number}
                onChange={(e) => setDumAddForm((f) => ({ ...f, dum_number: e.target.value }))}
                className={`${inputClass} text-xs`} placeholder="300.10-XXXXX" autoFocus />
            </div>
            <div>
              <label className="block text-xs text-[#A1A1AA] mb-1">Date</label>
              <input type="date" value={dumAddForm.dum_date}
                onChange={(e) => setDumAddForm((f) => ({ ...f, dum_date: e.target.value }))}
                className={`${inputClass} text-xs`} />
            </div>
            <button onClick={addDum} disabled={dumSaving}
              className="px-3 py-2 bg-[#1E3A8A] text-white text-xs rounded-lg hover:bg-[#1E40AF] disabled:opacity-50 transition-colors">
              {dumSaving ? '…' : 'Enregistrer'}
            </button>
            <button onClick={() => { setDumAdding(false); setDumAddForm({ dum_number: '', dum_date: '' }); }}
              className="px-3 py-2 border border-[#333333] text-xs text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
              Annuler
            </button>
          </div>
        )}
      </div>

      {/* Milestones */}
      <div className={cardClass}>
        <div className={sectionTitleClass}>
          <span>Étapes / Jalons</span>
          <span className="text-xs font-normal text-[#A1A1AA]">{completedMs}/{totalMs} complétées</span>
        </div>
        <div className="h-1.5 bg-[#333333] rounded-full overflow-hidden mb-4">
          <div className="h-full bg-[#F59E0B] rounded-full transition-all"
            style={{ width: `${totalMs > 0 ? (completedMs / totalMs) * 100 : 0}%` }} />
        </div>
        <div className="space-y-1">
          {job.milestones.map((ms) => (
            <div key={ms.id}>
              <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                <MilestoneIcon status={ms.status} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[#FAFAFA]">{ms.stage_label}</span>
                  {ms.status === 'completed' && ms.completed_at && (
                    <p className="text-xs text-[#A1A1AA] mt-0.5">
                      Complété le {formatDateTime(ms.completed_at)}{ms.completed_by_user_name ? ` par ${ms.completed_by_user_name}` : ''}
                    </p>
                  )}
                  {ms.status === 'skipped' && <p className="text-xs text-[#A1A1AA] mt-0.5">Ignoré{ms.notes ? ` — ${ms.notes}` : ''}</p>}
                  {ms.status === 'in_progress' && <p className="text-xs text-blue-400 mt-0.5">En cours</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2 flex-shrink-0">
                    {ms.status !== 'completed' && (
                      <button onClick={() => updateMilestone(ms.id, 'completed')} disabled={msSaving === ms.id}
                        className="text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer disabled:opacity-50 transition-colors">✓ Fait</button>
                    )}
                    {ms.status === 'not_started' && (
                      <button onClick={() => updateMilestone(ms.id, 'in_progress')} disabled={msSaving === ms.id}
                        className="text-xs text-[#60A5FA] hover:text-blue-300 cursor-pointer disabled:opacity-50 transition-colors">En cours</button>
                    )}
                    {ms.status !== 'skipped' && skippingMsId !== ms.id && (
                      <button onClick={() => { setSkippingMsId(ms.id); setSkipNote(''); }}
                        className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer transition-colors">Ignorer</button>
                    )}
                    {['admin', 'accountant'].includes(user?.role) && ms.status !== 'not_started' && (
                      <button onClick={() => updateMilestone(ms.id, 'not_started')} disabled={msSaving === ms.id}
                        className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer disabled:opacity-50 transition-colors">Réinitialiser</button>
                    )}
                  </div>
                )}
              </div>
              {skippingMsId === ms.id && (
                <div className="ml-10 mt-1 mb-2 flex gap-2 items-end">
                  <input type="text" value={skipNote} onChange={(e) => setSkipNote(e.target.value)}
                    placeholder="Motif (optionnel)…" className={`${inputClass} text-xs flex-1`} autoFocus />
                  <button onClick={() => updateMilestone(ms.id, 'skipped', skipNote)} disabled={msSaving === ms.id}
                    className="px-3 py-2 bg-[#333333] text-xs text-zinc-300 rounded-lg hover:bg-[#444] transition-colors disabled:opacity-50">Confirmer</button>
                  <button onClick={() => { setSkippingMsId(null); setSkipNote(''); }}
                    className="px-3 py-2 text-xs text-[#A1A1AA] hover:text-[#FAFAFA]">✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Disbursements */}
      {(canSeeFinancial || user?.role === 'logistics') && (
        <div className={cardClass}>
          <p className={sectionTitleClass}>
            <span>Décaissements</span>
            {canEdit && (
              <button onClick={() => setDisbFormOpen(true)}
                className="text-xs text-[#60A5FA] hover:underline font-normal">
                + Ajouter
              </button>
            )}
          </p>
          {job.disbursements.length === 0 ? (
            <p className="text-sm text-[#A1A1AA]">Aucun décaissement enregistré pour ce dossier.</p>
          ) : (
            <>
              <table className="w-full text-sm mb-3">
                <thead>
                  <tr className="border-b border-[#333333]">
                    {['Date', 'Type', 'Montant', 'Moyen', 'Statut', ''].map((h) => (
                      <th key={h} className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#333333]">
                  {job.disbursements.map((d) => (
                    <tr key={d.id} onClick={() => setDisbDetailId(d.id)}
                      className={`cursor-pointer hover:bg-[#2A2A2A] transition-colors ${
                        d.status === 'signed' && !d.invoice_id
                          ? (Math.floor((Date.now() - new Date((d.signed_at || '').replace(' ', 'T')).getTime()) / 86400000) > 3
                              ? 'border-l-4 border-red-500'
                              : 'border-l-4 border-amber-500')
                          : ''
                      }`}>
                      <td className="py-2 text-xs text-[#A1A1AA] pr-3">{formatDate(d.paid_date || d.requested_at)}</td>
                      <td className="py-2 text-xs text-zinc-300 pr-3">{d.type}</td>
                      <td className="py-2 text-xs text-[#FAFAFA] font-medium pr-3">{formatMAD(d.amount_cents)}</td>
                      <td className="py-2 text-xs text-[#A1A1AA] pr-3">{DISBURSEMENT_METHOD_LABEL[d.payment_method] || d.payment_method}</td>
                      <td className="py-2 text-xs text-[#A1A1AA]">{DISBURSEMENT_STATUS_LABEL[d.status] || d.status}</td>
                      <td className="py-2 text-xs text-[#60A5FA]">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canSeeFinancial && (
                <div className="flex justify-end gap-6 text-xs border-t border-[#333333] pt-3">
                  <span className="text-[#A1A1AA]">Total décaissé : <span className="text-[#FAFAFA] font-medium">{formatMAD(disbTotal)}</span></span>
                  <span className="text-[#A1A1AA]">Non facturé : <span className="text-amber-300 font-medium">{formatMAD(disbUnbilled)}</span></span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Service charges — admin/accountant only */}
      {canSeeFinancial && (
        <div className={cardClass}>
          <div className={sectionTitleClass}>
            <span>Prestations</span>
            {!job.invoice && (
              <button onClick={() => setScAdding(true)}
                className="text-xs text-[#60A5FA] hover:underline font-normal">+ Ajouter</button>
            )}
          </div>
          {job.invoice && (
            <p className="text-xs text-amber-400 mb-3">Ce dossier est facturé — les prestations ne peuvent pas être modifiées.</p>
          )}
          {job.service_charges.length === 0 && !scAdding && (
            <p className="text-sm text-[#A1A1AA]">Aucune prestation enregistrée.</p>
          )}
          {job.service_charges.length > 0 && (
            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['Désignation', 'Montant HT', 'TVA', 'Transport', ''].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs text-[#A1A1AA] font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {job.service_charges.map((sc) => (
                  <tr key={sc.id} className="hover:bg-[#2A2A2A]">
                    <td className="py-2 text-sm text-zinc-300">{sc.designation}</td>
                    <td className="py-2 text-sm text-[#FAFAFA] font-medium">{formatMAD(sc.amount_cents)}</td>
                    <td className="py-2 text-xs text-[#A1A1AA]">{sc.tva_rate}%</td>
                    <td className="py-2 text-xs text-[#A1A1AA]">{sc.is_transport ? 'Oui' : '—'}</td>
                    <td className="py-2">
                      {!job.invoice && (
                        <button onClick={() => deleteServiceCharge(sc)} className="text-xs text-red-400 hover:text-red-300">Supprimer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {scAdding && !job.invoice && (
            <div className="border-t border-[#333333] pt-3 mt-3 grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs text-[#A1A1AA] mb-1">Désignation</label>
                <input type="text" value={scForm.designation} onChange={(e) => setScForm((f) => ({ ...f, designation: e.target.value }))}
                  className={`${inputClass} text-xs`} autoFocus />
                {scErrors.designation && <p className="text-xs text-red-400 mt-0.5">{scErrors.designation}</p>}
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">Montant HT (MAD)</label>
                <input type="number" step="0.01" value={scForm.amount_mad} onChange={(e) => setScForm((f) => ({ ...f, amount_mad: e.target.value }))}
                  className={`${inputClass} text-xs`} placeholder="0.00" />
                {scErrors.amount_mad && <p className="text-xs text-red-400 mt-0.5">{scErrors.amount_mad}</p>}
              </div>
              <div>
                <label className="block text-xs text-[#A1A1AA] mb-1">TVA</label>
                <select value={scForm.tva_rate} onChange={(e) => setScForm((f) => ({ ...f, tva_rate: e.target.value }))}
                  className={`${inputClass} text-xs`}>
                  <option value="0">0%</option>
                  <option value="14">14%</option>
                  <option value="20">20%</option>
                </select>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={scForm.is_transport} onChange={(e) => setScForm((f) => ({ ...f, is_transport: e.target.checked }))}
                    className="rounded border-[#333333] bg-[#2A2A2A] focus:ring-[#3B5BDB]" />
                  Prestation de transport
                </label>
              </div>
              <div className="col-span-2 flex gap-2">
                <button onClick={addServiceCharge} disabled={scSaving}
                  className="px-4 py-2 bg-[#1E3A8A] text-white text-xs rounded-lg hover:bg-[#1E40AF] disabled:opacity-50 transition-colors">
                  {scSaving ? '…' : 'Enregistrer'}
                </button>
                <button onClick={() => { setScAdding(false); setScErrors({}); }}
                  className="px-4 py-2 border border-[#333333] text-xs text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Observations */}
      <div className={cardClass}>
        <p className={sectionTitleClass}><span>Observations</span></p>
        <textarea value={obsDraft} onChange={(e) => setObsDraft(e.target.value)}
          rows={4} className={`${inputClass} resize-none`} placeholder="Aucune observation…" disabled={!canEdit} />
        {canEdit && (
          <button onClick={saveObservations} disabled={obsSaving}
            className="mt-2 px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
            {obsSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>

      {/* Invoice */}
      {canSeeFinancial && (
        <div className={cardClass}>
          <p className={sectionTitleClass}><span>Facture</span></p>
          {job.invoice ? (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-zinc-300">
                <span className="font-medium text-[#FAFAFA]">N° {job.invoice.facture_number}</span>
                {' · '}{formatDate(job.invoice.issue_date)}
                {' · '}<span className="font-medium">{formatMAD(job.invoice.total_ttc_cents)}</span>
                {' · '}
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  job.invoice.status === 'paid' ? 'bg-emerald-700/60 text-white border border-emerald-600' :
                  job.invoice.status === 'sent' ? 'bg-blue-900/40 text-blue-300 border border-blue-800' :
                  'bg-zinc-700 text-zinc-300 border border-zinc-600'
                }`}>
                  {{ draft: 'Brouillon', sent: 'Envoyée', paid: 'Payée', cancelled: 'Annulée' }[job.invoice.status] || job.invoice.status}
                </span>
              </div>
              <Link to={`/app/factures/${job.invoice.id}`}
                className="text-xs text-[#60A5FA] hover:underline">Voir la facture →</Link>
            </div>
          ) : (
            <div>
              <p className="text-sm text-[#A1A1AA] mb-3">Aucune facture générée.</p>
              {job.status === 'released' && canEdit && (
                <Link to={`/app/factures/nouveau?job_id=${job.id}`}
                  className="inline-block px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors">
                  Générer la facture
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Historique du dossier */}
      {declarantLog.length > 0 && (
        <div className={cardClass}>
          <div className={sectionTitleClass}>
            <span>Historique du dossier</span>
            {declarantLog.length > 3 && (
              <button onClick={() => setHistoryExpanded((v) => !v)}
                className="text-xs text-[#60A5FA] hover:underline font-normal">
                {historyExpanded ? 'Réduire' : `Voir tout (${declarantLog.length})`}
              </button>
            )}
          </div>
          <div className="divide-y divide-[#2A2A2A]">
            {displayedLog.map((entry) => (
              <AssignmentLogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {editModal && (
        <JobFormModal mode="edit" job={job} onClose={() => setEditModal(false)} onSaved={() => { setEditModal(false); loadJob(); }} />
      )}
      {statusModal && (
        <StatusChangeModal jobId={id} targetStatus={statusModal} onClose={() => setStatusModal(null)} onDone={() => { setStatusModal(null); loadJob(); }} />
      )}
      {transferDialog && (
        <TransferDeclarantModal
          jobId={id}
          currentDeclarantId={job.declarant?.id ?? null}
          onClose={() => setTransferDialog(false)}
          onDone={() => { setTransferDialog(false); loadJob(); }}
        />
      )}
      {forceClaimDialog && (
        <ForceClaimModal
          jobId={id}
          currentDeclarantName={job.declarant?.name}
          onClose={() => setForceClaimDialog(false)}
          onDone={() => { setForceClaimDialog(false); loadJob(); }}
        />
      )}
      {releaseDialog && (
        <ReleaseDeclarantModal
          jobId={id}
          onClose={() => setReleaseDialog(false)}
          onDone={() => { setReleaseDialog(false); loadJob(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog title={confirm.title} description={confirm.description}
          confirmLabel={confirm.confirmLabel} variant={confirm.variant}
          onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />
      )}
      {disbFormOpen && (
        <DisbursementFormModal
          initialJobId={parseInt(id, 10)}
          onClose={() => setDisbFormOpen(false)}
          onSaved={() => { setDisbFormOpen(false); loadJob(); }}
        />
      )}
      {disbDetailId && (
        <DisbursementDetailModal
          disbursementId={disbDetailId}
          onClose={() => setDisbDetailId(null)}
          onUpdated={loadJob}
        />
      )}
    </div>
  );
}
