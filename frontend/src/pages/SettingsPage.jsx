import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDateTime } from '../utils/format';

const cardClass = 'bg-[#242424] border border-[#333333] rounded-xl p-5';

function Field({ label, name, value, onChange, type = 'text', hint }) {
  return (
    <div>
      <label className="block text-xs text-[#A1A1AA] mb-1">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 bg-[#2A2A2A] border border-[#333333] rounded-lg text-sm text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#3B5BDB]"
      />
      {hint && <p className="text-xs text-[#A1A1AA] mt-0.5">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [backupInfo, setBackupInfo] = useState(null);
  const [backingUp, setBackingUp] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [sR, bR] = await Promise.allSettled([
        api.get('/admin/settings'),
        api.get('/admin/backup-info'),
      ]);
      if (sR.status === 'fulfilled') setSettings(sR.value.data);
      if (bR.status === 'fulfilled') setBackupInfo(bR.value.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function handleChange(e) {
    setSettings((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function saveSection(keys) {
    setSaving(true);
    try {
      const body = {};
      for (const k of keys) body[k] = settings[k] ?? '';
      await api.put('/admin/settings', body);
      toast.success('Paramètres enregistrés.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBackupNow() {
    setBackingUp(true);
    try {
      await api.post('/admin/backup-now');
      toast.success('Sauvegarde effectuée.');
      const bR = await api.get('/admin/backup-info');
      setBackupInfo(bR.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la sauvegarde.');
    } finally {
      setBackingUp(false);
    }
  }

  if (loading) return <div className="py-16 text-center text-sm text-[#A1A1AA]">Chargement…</div>;

  const s = settings;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">Paramètres</h1>
        <p className="text-sm text-[#A1A1AA] mt-1">Configuration du système BADR TRANSIT</p>
      </div>

      {/* Backup */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Sauvegarde</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[#A1A1AA]">
              Dernière sauvegarde :{' '}
              <span className="text-[#FAFAFA]">
                {backupInfo?.last_backup
                  ? formatDateTime(backupInfo.last_backup)
                  : 'Aucune'}
              </span>
            </p>
            {backupInfo?.count > 0 && (
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                {backupInfo.count} sauvegarde{backupInfo.count > 1 ? 's' : ''} conservée{backupInfo.count > 1 ? 's' : ''} dans{' '}
                <span className="font-mono text-zinc-400 text-[10px]">{backupInfo.backup_dir}</span>
              </p>
            )}
          </div>
          <button
            onClick={handleBackupNow}
            disabled={backingUp}
            className="px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {backingUp ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
          </button>
        </div>
        <p className="text-xs text-[#A1A1AA] mt-4 border-t border-[#333333] pt-3">
          Pour programmer une sauvegarde automatique quotidienne, configurez le Planificateur de tâches Windows :<br />
          Programme : <span className="font-mono text-zinc-400">node</span> — Arguments :{' '}
          <span className="font-mono text-zinc-400">C:\...\backend\src\scripts\backup.js</span>
        </p>
      </div>

      {/* Alert thresholds */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Seuils des alertes</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Délai alerte non facturé (jours)"
            name="red_flag_days"
            value={s.red_flag_days ?? ''}
            onChange={handleChange}
            type="number"
            hint="Décaissement validé sans facture depuis N jours"
          />
          <Field
            label="Délai alerte reçu manquant (jours)"
            name="receipt_red_flag_days"
            value={s.receipt_red_flag_days ?? ''}
            onChange={handleChange}
            type="number"
            hint="Décaissement validé sans reçu uploadé depuis N jours"
          />
        </div>
        <button
          onClick={() => saveSection(['red_flag_days', 'receipt_red_flag_days'])}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Numbering */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Numérotation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Prochain N° dossier"
            name="next_dossier_number"
            value={s.next_dossier_number ?? ''}
            onChange={handleChange}
            type="number"
          />
          <Field
            label="Prochain N° facture"
            name="next_facture_number"
            value={s.next_facture_number ?? ''}
            onChange={handleChange}
            type="number"
          />
        </div>
        <p className="text-xs text-amber-400 mt-2">
          Attention : modifier ces valeurs peut créer des numéros en doublon si des dossiers/factures existent déjà.
        </p>
        <button
          onClick={() => saveSection(['next_dossier_number', 'next_facture_number'])}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Company info */}
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-[#FAFAFA] mb-4">Informations société (pied de page PDF)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="RC" name="company_rc" value={s.company_rc ?? ''} onChange={handleChange} />
          <Field label="TP" name="company_tp" value={s.company_tp ?? ''} onChange={handleChange} />
          <Field label="ICE" name="company_ice" value={s.company_ice ?? ''} onChange={handleChange} />
          <Field label="IF" name="company_if" value={s.company_if ?? ''} onChange={handleChange} />
          <Field label="CNSS" name="company_cnss" value={s.company_cnss ?? ''} onChange={handleChange} />
          <Field label="Capital (MAD)" name="company_capital" value={s.company_capital ?? ''} onChange={handleChange} />
          <div className="sm:col-span-2">
            <Field label="Adresse" name="company_address" value={s.company_address ?? ''} onChange={handleChange} />
          </div>
          <Field label="Téléphone" name="company_phone" value={s.company_phone ?? ''} onChange={handleChange} />
          <Field label="Email" name="company_email" value={s.company_email ?? ''} onChange={handleChange} />
          <Field label="Ville" name="company_city" value={s.company_city ?? ''} onChange={handleChange} />
        </div>
        <button
          onClick={() => saveSection([
            'company_rc', 'company_tp', 'company_ice', 'company_if',
            'company_cnss', 'company_capital', 'company_address',
            'company_phone', 'company_email', 'company_city',
          ])}
          disabled={saving}
          className="mt-4 px-4 py-2 bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
