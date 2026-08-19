// =====================================================================
// ConfirmActionModal — Modal de confirmação de ação sensível
// =====================================================================
// - Exibe um alerta pedindo ao usuário para confirmar ou cancelar uma
//   ação sensível (ex.: excluir, editar), destacando o item afetado.
// - Suporta 4 tons de cor (rose, blue, purple, amber) via prop `tone`.
// - Props:
//   - isOpen      : controla se o modal está visível.
//   - onClose     : função chamada ao cancelar/fechar o modal.
//   - onConfirm   : função chamada ao confirmar a ação.
//   - title       : título do modal.
//   - message     : mensagem de apoio opcional.
//   - itemName    : nome do item afetado pela ação.
//   - confirmLabel/cancelLabel: textos dos botões (com defaults).
//   - tone        : cor de destaque visual do modal.
// =====================================================================
import React from 'react';
import { X, AlertTriangle } from 'lucide-react';

// Tipagem das props recebidas pelo componente
interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  itemName: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'rose' | 'blue' | 'purple' | 'amber';
}

// Estilos (classes CSS) de cada tom para cabeçalho, ícone, destaque e botão
const toneStyles = {
  rose: {
    header: 'bg-rose-950/80 border-b border-rose-500/20',
    icon: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
    highlight: 'text-rose-400',
    button: 'bg-rose-600 hover:bg-rose-500 shadow-rose-500/30',
  },
  blue: {
    header: 'bg-blue-950/80 border-b border-blue-500/20',
    icon: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    highlight: 'text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/30',
  },
  purple: {
    header: 'bg-purple-950/80 border-b border-purple-500/20',
    icon: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
    highlight: 'text-purple-300',
    button: 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/30',
  },
  amber: {
    header: 'bg-amber-950/80 border-b border-amber-500/20',
    icon: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    highlight: 'text-amber-300',
    button: 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/30',
  },
};

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  itemName,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'blue',
}) => {
  // Se o modal não estiver aberto, não renderiza nada
  if (!isOpen) return null;

  // Resolve as classes CSS de acordo com o tom escolhido
  const styles = toneStyles[tone];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl">
        {/* Cabeçalho: ícone de alerta, título/mensagem e botão fechar */}
        <div className={`flex items-start gap-4 px-6 py-5 ${styles.header}`}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-3xl ${styles.icon}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black text-white">{title}</h3>
            {message && <p className="mt-1 text-sm text-slate-400">{message}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {/* Corpo: aviso sobre a ação + destaque do item afetado */}
          <div className="space-y-3 text-sm text-slate-300">
            <p className="font-medium">
              Você está prestes a <span className={`font-black uppercase ${styles.highlight}`}>confirmar esta ação</span>
            </p>
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-slate-100 font-semibold">
              {itemName}
            </div>
          </div>

          {/* Botões de ação: cancelar e confirmar */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Botão de cancelar — fecha o modal sem executar a ação */}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10"
            >
              {cancelLabel}
            </button>
            {/* Botão de confirmar — executa onConfirm e depois fecha o modal */}
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-1 rounded-3xl px-4 py-3 text-sm font-black transition ${styles.button}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
