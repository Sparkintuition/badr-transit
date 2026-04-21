import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB] resize-none';

export default function CancelInvoiceDialog({ invoiceId, onClose, onCancelled }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (reason.trim().length < 10) { setError('La raison doit contenir au moins 10 caractères.'); return; }
    setSaving(true);
    try {
      await api.post(`/invoices/${invoiceId}/cancel`, { reason: reason.trim() });
      toast.success('Facture annulée.');
      onCancelled?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'annulation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-red-400 mb-2">Annuler la facture</h2>
        <p className="text-xs text-[#A1A1AA] mb-4">
          L'annulation réactivera les décaissements associés (retour au statut "Validé") et le dossier reviendra au statut "Livré". Le PDF est conservé pour les archives.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
              Raison <span className="text-red-400">*</span> (min. 10 caractères)
            </label>
            <textarea rows={3} value={reason}
              onChange={(e) => { setReason(e.target.value); setError(''); }}
              className={inputClass} placeholder="Expliquez la raison de l'annulation…" />
            {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A]">
              Retour
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? '…' : 'Annuler la facture'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
