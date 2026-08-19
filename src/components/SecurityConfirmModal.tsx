// =====================================================================
// SecurityConfirmModal — Modal de confirmação segura de ação sensível
// =====================================================================
// - Exige que o usuário digite um código de 4 dígitos (gerado
//   aleatoriamente e exibido no modal) antes de liberar a ação.
// - Serve para ações sensíveis como apagar/excluir (delete) ou
//   alterar/editar (edit), exibindo visual distinto para cada uma.
// - Props:
//   - isOpen      : controla se o modal está visível.
//   - onClose     : função chamada ao cancelar/fechar o modal.
//   - onConfirm   : função chamada quando o código digitado confere.
//   - title       : título do modal.
//   - description : descrição adicional opcional.
//   - itemName    : nome do item afetado pela ação.
//   - actionType  : 'delete' (tons de vermelho) ou 'edit' (tons de azul).
// =====================================================================
import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, CheckCircle2, AlertTriangle } from 'lucide-react';

// Tipagem das props recebidas pelo componente
interface SecurityConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  itemName: string;
  actionType: 'delete' | 'edit';
}

export const SecurityConfirmModal: React.FC<SecurityConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  actionType,
}) => {
  // Código de 4 dígitos gerado que o usuário precisa digitar
  const [targetCode, setTargetCode] = useState('');
  // Código digitado pelo usuário
  const [inputCode, setInputCode] = useState('');

  // Ao abrir o modal, gera um novo código aleatório e limpa o campo de entrada
  useEffect(() => {
    if (isOpen) {
      // Gera um número aleatório de 4 dígitos (1000 a 9999)
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setTargetCode(code);
      setInputCode('');
    }
  }, [isOpen]);

  // Se o modal não estiver aberto, não renderiza nada
  if (!isOpen) return null;

  // Verifica se o código digitado é igual ao código alvo (ignorando espaços)
  const isMatched = inputCode.trim() === targetCode;
  // Define se a ação é de exclusão (influencia cores e textos)
  const isDelete = actionType === 'delete';

  // Submete o formulário apenas quando o código confere
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMatched) {
      onConfirm();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl">
        {/* Cabeçalho: cores e ícone variam conforme o tipo (delete = vermelho, edit = azul) */}
        <div className={`flex items-start gap-4 px-6 py-5 ${isDelete ? 'bg-rose-950/80 border-b border-rose-500/20' : 'bg-blue-950/80 border-b border-blue-500/20'}`}>
          <div className={`flex h-12 w-12 items-center justify-center rounded-3xl ${isDelete ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'}`}>
            {/* Exclusão usa triângulo de alerta; edição usa ícone de escudo */}
            {isDelete ? <AlertTriangle className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>

          <div className="flex-1">
            <h3 className="text-xl font-black text-white">{title}</h3>
            <p className="mt-1 text-sm text-slate-400">A ação é sensível e requer confirmação segura antes de prosseguir.</p>
          </div>

          {/* Botão de fechar — apenas fecha o modal */}
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
              Você está prestes a <span className={`font-black ${isDelete ? 'text-rose-400 uppercase' : 'text-blue-300'}`}>
                {isDelete ? 'APAGAR PERMANENTEMENTE' : 'CONFIRMAR ESTA ALTERAÇÃO'}
              </span>
            </p>
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-4 text-slate-100 font-semibold">
              {itemName}
            </div>
            {description && <p className="text-xs leading-6 text-slate-400">{description}</p>}
          </div>

          {/* Bloco que exibe o código de verificação gerado */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/90 p-5 text-center">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Digite o código abaixo para confirmar</p>
            <div className="mx-auto mt-3 inline-flex min-w-[12rem] items-center justify-center rounded-3xl border border-amber-500/30 bg-black/20 px-6 py-3 text-3xl font-black tracking-[0.36em] text-amber-300 font-mono shadow-inner shadow-amber-500/10">
              {targetCode}
            </div>
          </div>

          {/* Formulário de confirmação: campo do código + botões */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo que aceita apenas dígitos, removendo qualquer caractere não numérico */}
            <input
              type="text"
              maxLength={4}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
              placeholder="Digite os 4 dígitos aqui..."
              autoFocus
              className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-center text-lg font-mono tracking-[0.22em] text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
            />

            <div className="flex flex-col gap-3 sm:flex-row">
              {/* Cancelar — fecha o modal sem executar a ação */}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10"
              >
                Cancelar
              </button>
              {/* Confirmar — habilita apenas quando o código digitado confere */}
              <button
                type="submit"
                disabled={!isMatched}
                className={`flex-1 rounded-3xl px-4 py-3 text-sm font-black transition ${isMatched ? (isDelete ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-500/30' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/30') : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/10'}`}
              >
                Confirmar {isDelete ? 'Exclusão' : 'Alteração'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
