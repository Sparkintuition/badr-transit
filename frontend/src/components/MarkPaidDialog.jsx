import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]';
const labelClass = 'block text-xs font-medium text-[#A1A1AA] mb-1';

export default function MarkPaidDialog({ invoiceId, onClose, onPaid }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ payment_date: today, payment_method: 'Chèque' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/invoices/${invoiceId}/mark-paid`, form);
      toast.success('Facture marquée payée.');
      onPaid?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-4">Marquer comme payée</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Date de paiement</label>
            <input type="date" value={form.payment_date}
              onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Moyen de paiement</label>
            <select value={form.payment_method}
              onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
              className={inputClass}>
              <option>Chèque</option>
              <option>Virement</option>
              <option>Espèces</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A]">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {saving ? '…' : 'Confirmer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
