import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';
import { formatMAD, formatDate } from '../utils/format';

const inputClass = 'w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] placeholder-[#A1A1AA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]';
const labelClass = 'block text-xs font-medium text-[#A1A1AA] mb-1';

// ── Step 1: Select Job ────────────────────────────────────────────────────────

function SelectJobStep({ onSelect }) {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/jobs', { params: { status: 'released', page_size: 200 } })
      .then((r) => {
        const withoutInvoice = (r.data.items || []).filter((j) => !j.invoice);
        setJobs(withoutInvoice);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = jobs.filter((j) => {
    const q = search.toLowerCase();
    return !q || j.dossier_number.toLowerCase().includes(q) || j.client.name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#FAFAFA]">Étape 1 — Sélectionner un dossier</h2>
        <p className="text-sm text-[#A1A1AA] mt-1">Seuls les dossiers livrés sans facture sont affichés.</p>
      </div>
      <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher par N° dossier ou client…"
        className={inputClass} />
      {loading && <p className="text-sm text-[#A1A1AA]">Chargement…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-[#A1A1AA]">Aucun dossier disponible.</p>
      )}
      <div className="space-y-2">
        {filtered.map((j) => (
          <button key={j.id} onClick={() => onSelect(j)}
            className="w-full text-left bg-[#242424] border border-[#333333] rounded-xl px-5 py-4 hover:bg-[#2A2A2A] hover:border-[#3B5BDB] transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm text-[#60A5FA]">{j.dossier_number}</span>
              <span className="text-xs text-[#A1A1AA]">{j.client.name}</span>
            </div>
            {j.expediteur_exportateur && (
              <p className="text-xs text-[#555555] mt-1">{j.expediteur_exportateur}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Preview & Customize ───────────────────────────────────────────────

function PreviewStep({ job, onBack, onCreated }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    facture_number: '',
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    taxe_regionale_applied: true,
    avance_cents_mad: '',
    pieces_jointes: 'COPIE DUM - COPIE FACTURE COMMERCIALE - FICHE D\'IMPUTATION',
    notes: '',
  });

  async function fetchPreview(overrides = {}) {
    setLoading(true);
    try {
      const avance = Math.round(parseFloat((overrides.avance_cents_mad ?? form.avance_cents_mad) || '0') * 100);
      const r = await api.post('/invoices/preview', {
        job_id: job.id,
        avance_cents: avance,
        taxe_regionale_applied: overrides.taxe_regionale_applied ?? form.taxe_regionale_applied,
        issue_date: overrides.issue_date ?? form.issue_date,
        facture_number: overrides.facture_number ?? form.facture_number,
      });
      setPreview(r.data);
      setForm((f) => ({
        ...f,
        facture_number: f.facture_number || r.data.suggested_facture_number || '',
        due_date: f.due_date || r.data.suggested_due_date || '',
      }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur de prévisualisation.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPreview(); }, []);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (field === 'taxe_regionale_applied' || field === 'avance_cents_mad' || field === 'issue_date') {
      fetchPreview({ [field]: value });
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const avance = Math.round(parseFloat(form.avance_cents_mad || '0') * 100);
      const r = await api.post('/invoices', {
        job_id: job.id,
        facture_number: form.facture_number || undefined,
        issue_date: form.issue_date,
        due_date: form.due_date,
        taxe_regionale_applied: form.taxe_regionale_applied,
        avance_cents: avance,
        pieces_jointes: form.pieces_jointes,
        notes: form.notes || undefined,
      });
      toast.success('Facture créée.');
      onCreated(r.data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-sm text-[#60A5FA] hover:underline">← Changer de dossier</button>
        <h2 className="text-lg font-semibold text-[#FAFAFA] mt-2">Étape 2 — Prévisualisation et personnalisation</h2>
        <p className="text-sm text-[#A1A1AA]">Dossier : <strong className="text-[#FAFAFA] font-mono">{job.dossier_number}</strong> · {job.client?.name}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: editable fields */}
        <div className="space-y-4">
          <div className="bg-[#242424] border border-[#333333] rounded-xl p-5 space-y-4">
            <div>
              <label className={labelClass}>Facture N°</label>
              <input type="text" value={form.facture_number}
                onChange={(e) => set('facture_number', e.target.value)}
                className={inputClass} placeholder={preview?.suggested_facture_number || ''} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Date d'émission</label>
                <input type="date" value={form.issue_date}
                  onChange={(e) => set('issue_date', e.target.value)}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Date d'échéance</label>
                <input type="date" value={form.due_date}
                  onChange={(e) => set('due_date', e.target.value)}
                  className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Avance reçue (MAD)</label>
              <div className="relative">
                <input type="number" step="0.01" min="0" value={form.avance_cents_mad}
                  onChange={(e) => set('avance_cents_mad', e.target.value)}
                  className={`${inputClass} pr-12`} placeholder="0,00" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#A1A1AA]">MAD</span>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.taxe_regionale_applied}
                onChange={(e) => set('taxe_regionale_applied', e.target.checked)}
                className="rounded" />
              <span className="text-sm text-[#FAFAFA]">Taxe Régionale 4% applicable</span>
            </label>
            <div>
              <label className={labelClass}>Pièces jointes</label>
              <textarea rows={2} value={form.pieces_jointes}
                onChange={(e) => setForm((f) => ({ ...f, pieces_jointes: e.target.value }))}
                className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className={labelClass}>Notes internes (non imprimées)</label>
              <textarea rows={2} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className={`${inputClass} resize-none`} placeholder="Observations internes…" />
            </div>
          </div>
        </div>

        {/* Right: preview totals + lines */}
        <div className="space-y-4">
          {loading && <p className="text-sm text-[#A1A1AA]">Calcul en cours…</p>}
          {preview && !loading && (
            <>
              {/* Lines */}
              <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#333333]">
                  <p className="text-sm font-semibold text-[#FAFAFA]">Lignes ({preview.lines.length})</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#333333]">
                      <th className="px-4 py-2 text-left text-xs text-[#A1A1AA] font-medium">Désignation</th>
                      <th className="px-4 py-2 text-right text-xs text-[#A1A1AA] font-medium">Taxable</th>
                      <th className="px-4 py-2 text-right text-xs text-[#A1A1AA] font-medium">Non Taxable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#333333]">
                    {preview.lines.map((ln, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-xs text-zinc-300">{ln.designation}</td>
                        <td className="px-4 py-2 text-xs text-right font-mono text-[#FAFAFA]">
                          {ln.is_taxable ? formatMAD(ln.amount_cents) : '—'}
                        </td>
                        <td className="px-4 py-2 text-xs text-right font-mono text-[#FAFAFA]">
                          {!ln.is_taxable ? formatMAD(ln.amount_cents) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="bg-[#242424] border border-[#333333] rounded-xl overflow-hidden">
                {[
                  ['Sous-total Taxable', preview.subtotal_taxable_cents, false],
                  ['Sous-total Non Taxable', preview.subtotal_non_taxable_cents, false],
                  ['TOTAL HT', preview.total_ht_cents, true],
                  ...(preview.tva_14_cents > 0 ? [['TVA 14 %', preview.tva_14_cents, false]] : []),
                  ...(preview.tva_20_cents > 0 ? [['TVA 20 %', preview.tva_20_cents, false]] : []),
                  ...(form.taxe_regionale_applied ? [['Taxe Régionale 4%', preview.taxe_regionale_cents, false]] : []),
                  ['TOTAL TTC', preview.total_ttc_cents, true],
                  ...(preview.avance_cents > 0 ? [['Avance', preview.avance_cents, false]] : []),
                  ['RESTE À PAYER', preview.reste_a_payer_cents, true],
                ].map(([label, val, bold]) => (
                  <div key={label} className={`flex justify-between px-4 py-2 ${bold ? 'bg-[#2A2A2A] border-t border-[#333333]' : ''}`}>
                    <span className={`text-xs ${bold ? 'font-semibold text-[#FAFAFA]' : 'text-[#A1A1AA]'}`}>{label}</span>
                    <span className={`text-xs font-mono ${bold ? 'font-bold text-[#FAFAFA]' : 'text-[#FAFAFA]'}`}>{formatMAD(val)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 bg-[#1A1A1A] border-t border-[#333333]">
                  <p className="text-xs text-[#A1A1AA] italic">{preview.amount_in_words}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={onBack}
          className="px-5 py-2.5 border border-[#333333] text-sm text-zinc-300 rounded-lg hover:bg-[#2A2A2A]">
          Annuler
        </button>
        <button onClick={handleCreate} disabled={creating || loading || !preview}
          className="px-6 py-2.5 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
          {creating ? 'Génération…' : 'Générer la facture'}
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CreateInvoicePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const prefilledJobId = searchParams.get('job_id');

  const [step, setStep] = useState(prefilledJobId ? 2 : 1);
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    if (prefilledJobId && !selectedJob) {
      api.get(`/jobs/${prefilledJobId}`)
        .then((r) => {
          setSelectedJob(r.data);
          setStep(2);
        })
        .catch(() => setStep(1));
    }
  }, [prefilledJobId]);

  function handleJobSelect(job) {
    setSelectedJob(job);
    setStep(2);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Nouvelle facture</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Étape {step} / 2</p>
      </div>
      <div className="flex gap-3 mb-4">
        {[1, 2].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-[#3B5BDB]' : 'bg-[#333333]'}`} />
        ))}
      </div>

      {step === 1 && <SelectJobStep onSelect={handleJobSelect} />}
      {step === 2 && selectedJob && (
        <PreviewStep
          job={selectedJob}
          onBack={() => { setStep(1); setSelectedJob(null); }}
          onCreated={(id) => navigate(`/app/factures/${id}`)}
        />
      )}
    </div>
  );
}
