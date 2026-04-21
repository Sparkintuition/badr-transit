const MILESTONE_TEMPLATES = {
  import: [
    { code: 'recu',               label: 'Reçu',                  order: 10 },
    { code: 'remise_documents',   label: 'Remise des documents',   order: 20 },
    { code: 'echange_bad',        label: 'Échange / BAD obtenu',   order: 30 },
    { code: 'mca',                label: 'MCA',                    order: 40 },
    { code: 'main_levee',         label: 'Main levée',             order: 50 },
    { code: 'sortie',             label: 'Sortie',                 order: 60 },
  ],
  export: [
    { code: 'recu',               label: 'Reçu',                   order: 10 },
    { code: 'main_levee_delivree',label: 'Main levée délivrée',    order: 20 },
    { code: 'sequence_deposee',   label: 'Séquence déposée',       order: 30 },
    { code: 'documents_vises',    label: 'Documents visés',        order: 40 },
    { code: 'dossier_valide',     label: 'Dossier validé',         order: 50 },
    { code: 'email_sortie',       label: 'Email de sortie',        order: 60 },
    { code: 'dossier_signe',      label: 'Dossier signé',          order: 70 },
  ],
};

module.exports = { MILESTONE_TEMPLATES };
