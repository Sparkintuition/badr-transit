export default function ConfirmDialog({ title, description, confirmLabel = 'Confirmer', variant = 'danger', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-[#242424] border border-[#333333] rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#FAFAFA] mb-2">{title}</h2>
        {description && (
          <p className="text-sm text-[#A1A1AA] mb-6">{description}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 border border-[#333333] text-sm font-medium text-zinc-300 rounded-lg hover:bg-[#2A2A2A] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#1E3A8A] hover:bg-[#1E40AF]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
