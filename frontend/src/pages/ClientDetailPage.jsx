import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api from '../api';
import { formatMAD, formatMADShort, formatDate } from '../utils/format';

const STATUS_BADGE = {
  draft:     'bg-zinc-700 text-zinc-300 border border-zinc-600',
  sent:      'bg-blue-900/40 text-blue-300 border border-blue-800',
  paid:      'bg-emerald-700/60 text-white border border-emerald-600',
  overdue:   'bg-red-900/40 text-red-300 border border-red-800',
  cancelled: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
};
const STATUS_LABEL = { draft:'Brouillon', sent:'Envoyée', paid:'Payée', overdue:'En retard', cancelled:'Annulée' };
const JOB_STATUS_LABEL = { open:'Ouvert', released:'Livré', invoiced:'Facturé', paid:'Payé', archived:'Archivé', cancelled:'Annulé' };
const JOB_STATUS_CLASS = {
  open:     'bg-blue-900/40 text-blue-300 border border-blue-800',
  released: 'bg-emerald-900/40 text-emerald-300 border border-emerald-800',
  invoiced: 'bg-amber-900/40 text-amber-300 border border-amber-800',
  paid:     'bg-emerald-700/60 text-white border border-emerald-600',
  cancelled:'bg-red-900/40 text-red-300 border border-red-800',
  archived: 'bg-zinc-700 text-zinc-300 border border-zinc-600',
};

const cardClass = 'bg-[#242424] border border-[#333333] rounded-xl p-5';

function SummaryCard({ title, value, sub, color = 'default' }) {
  return (
    <div className={`rounded-xl border p-4 ${
      color === 'red'   ? 'border-red-800/60 bg-red-900/10' :
      color === 'green' ? 'border-emerald-800/60 bg-emerald-900/10' :
      color === 'amber' ? 'border-amber-800/60 bg-amber-900/10' :
                          'border-[#333333] bg-[#242424]'
    }`}>
      <p className={`text-xs font-medium ${color === 'red' ? 'text-red-400' : color === 'green' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-[#A1A1AA]'}`}>
        {title}
      </p>
      <p className={`text-xl font-bold mt-1 ${color === 'red' ? 'text-red-300' : color === 'green' ? 'text-emerald-300' : color === 'amber' ? 'text-amber-300' : 'text-[#FAFAFA]'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#A1A1AA] mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const canEdit = ['admin', 'accountant'].includes(user?.role);

  const [client, setClient]   = useState(null);
  const [summary, setSummary] = useState(null);
  const [statement, setStatement] = useState(null);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cR, sR, stR, jR] = await Promise.all([
          api.get(`/clients/${id}`),
          api.get(`/clients/${id}/payment-summary`),
          api.get(`/clients/${id}/statement`),
          api.get('/invoices', { params: { client_id: id, page_size: 200 } }),
        ]);
        setClient(cR.data);
        setSummary(sR.data);
        setStatement(stR.data);
        // Also load jobs via statement? Jobs need a separate endpoint.
        // Fetch jobs separately
        const jJobs = await api.get('/jobs', { params: { client_id: id, page_size: 100 } });
        setJobs(jJobs.data.items || []);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="py-16 text-center text-sm text-[#A1A1AA]">Chargement…</div>;
  if (!client) return <div className="py-16 text-center text-sm text-red-400">Client introuvable.</div>;

  return (
    <div className="space-y-6">
      <Link to="/app/clients" className="text-sm text-[#60A5FA] hover:underline">← Retour aux clients</Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">{client.name}</h1>
          <p className="text-sm text-[#A1A1AA] mt-1">
            {client.ice && <span className="font-mono mr-3">ICE : {client.ice}</span>}
            {client.payment_deadline_days != null && <span>Délai : {client.payment_deadline_days}j</span>}
          </p>
          {client.address && <p className="text-xs text-[#A1A1AA] mt-0.5">{client.address}</p>}
          {!client.active && (
            <span className="mt-2 inline-block px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-400">Inactif</span>
          )}
        </div>
        {canEdit && (
          <Link to="/app/clients" className="px-3 py-1.5 text-sm border border-[#333333] text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors">
            Modifier →
          </Link>
        )}
      </div>

      {/* Payment summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            title="Total facturé"
            value={formatMADShort(summary.total_invoiced_cents)}
            sub={`${summary.total_jobs} dossier${summary.total_jobs !== 1 ? 's' : ''}`}
          />
          <SummaryCard
            title="Total encaissé"
            value={formatMADShort(summary.total_paid_cents)}
            color="green"
            sub={summary.avg_days_to_pay != null ? `Moy. ${summary.avg_days_to_pay}j de paiement` : undefined}
          />
          <SummaryCard
            title="Impayé"
            value={formatMADShort(summary.total_outstanding_cents)}
            color={summary.total_outstanding_cents > 0 ? 'amber' : 'default'}
          />
          <SummaryCard
            title="En retard"
            value={formatMADShort(summary.total_overdue_cents)}
            sub={summary.count_overdue > 0 ? `${summary.count_overdue} facture${summary.count_overdue > 1 ? 's' : ''}` : undefined}
            color={summary.count_overdue > 0 ? 'red' : 'default'}
          />
        </div>
      )}

      {/* Jobs table */}
      {jobs.length > 0 && (
        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#FAFAFA] mb-4">Dossiers ({jobs.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['N° Dossier', 'Type', 'Statut', 'Reçu le'].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-[#2A2A2A]">
                    <td className="py-2">
                      <Link to={`/app/dossiers/${j.id}`} className="font-mono text-xs text-[#60A5FA] hover:underline">
                        {j.dossier_number}
                      </Link>
                    </td>
                    <td className="py-2 text-xs text-[#A1A1AA]">{j.type === 'import' ? 'Import' : 'Export'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${JOB_STATUS_CLASS[j.status] || 'bg-zinc-700 text-zinc-300'}`}>
                        {JOB_STATUS_LABEL[j.status] || j.status}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-[#A1A1AA]">{formatDate(j.recu_le)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoices table */}
      {statement && statement.invoices.length > 0 && (
        <div className={cardClass}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-[#FAFAFA]">
              Factures ({statement.invoices.length})
            </p>
            {statement.summary && (
              <span className="text-xs text-[#A1A1AA]">
                Impayé : <span className="text-amber-300 font-medium">{formatMAD(statement.summary.total_outstanding_cents)}</span>
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#333333]">
                  {['Facture', 'Émise le', 'Échéance', 'Total TTC', 'Reste', 'Statut'].map((h) => (
                    <th key={h} className="pb-2 text-left text-xs font-medium text-[#A1A1AA]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#333333]">
                {statement.invoices.map((inv) => (
                  <tr key={inv.id} className={`hover:bg-[#2A2A2A] ${inv.status === 'overdue' ? 'border-l-4 border-red-500' : inv.status === 'paid' ? 'border-l-4 border-emerald-600' : 'border-l-4 border-transparent'}`}>
                    <td className="py-2">
                      <Link to={`/app/factures/${inv.id}`} className="font-mono text-xs text-[#60A5FA] hover:underline">
                        {inv.facture_number}
                      </Link>
                    </td>
                    <td className="py-2 text-xs text-[#A1A1AA]">{formatDate(inv.issue_date)}</td>
                    <td className={`py-2 text-xs ${inv.is_overdue ? 'text-red-400 font-medium' : 'text-[#A1A1AA]'}`}>
                      {formatDate(inv.due_date)}
                      {inv.is_overdue && ` (+${inv.days_overdue}j)`}
                    </td>
                    <td className="py-2 text-xs font-medium text-[#FAFAFA] text-right whitespace-nowrap">
                      {formatMAD(inv.total_ttc_cents)}
                    </td>
                    <td className={`py-2 text-xs font-medium text-right whitespace-nowrap ${inv._db_status === 'paid' ? 'text-emerald-400' : 'text-amber-300'}`}>
                      {inv._db_status === 'paid' ? '—' : formatMAD(inv.reste_a_payer_cents)}
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[inv.status] || ''}`}>
                        {STATUS_LABEL[inv.status] || inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statement?.invoices.length === 0 && jobs.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#333333] bg-[#242424] py-12 text-center text-[#A1A1AA]">
          <p className="text-sm">Aucun historique pour ce client.</p>
        </div>
      )}
    </div>
  );
}
