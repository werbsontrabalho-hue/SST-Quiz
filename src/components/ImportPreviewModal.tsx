// ======================================================================
// ImportPreviewModal.tsx — Modal de Pré-visualização de Importação CSV
// ----------------------------------------------------------------------
// Exibe uma pré-visualização visual dos 3 primeiros registros encontrados
// no arquivo CSV antes de confirmar a gravação definitiva no banco.
// ======================================================================

import React from 'react';
import { formatAlternativaText } from '../utils/questionHelpers';
import { FileSpreadsheet, CheckCircle2, AlertTriangle, X, Check, HelpCircle, User, Building } from 'lucide-react';

export interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  totalCount: number;
  errorsCount?: number;
  type: 'perguntas' | 'usuarios' | 'setores';
  previewItems: any[]; // Os 3 primeiros itens interpretados
  setoresLista?: { id: string; nome: string }[];
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Pré-visualização da Importação em Lote',
  totalCount,
  errorsCount = 0,
  type,
  previewItems,
  setoresLista = [],
}) => {
  if (!isOpen) return null;

  const primeirosTres = previewItems.slice(0, 3);
  const restantes = Math.max(0, totalCount - 3);

  const getSetorNome = (setorId?: string) => {
    if (!setorId) return 'Setor Geral';
    const s = setoresLista.find(x => x.id === setorId);
    return s ? s.nome : setorId;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-blue-500/40 rounded-2xl w-full max-w-2xl text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Modal */}
        <div className="p-5 bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">{title}</h3>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Confirme a estrutura dos dados antes de salvar no banco de dados.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo numérico e alertas */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-extrabold text-emerald-300 text-sm">{totalCount} registros</div>
                <div className="text-[10px] text-emerald-200/70">Validados e prontos para importação</div>
              </div>
            </div>

            <div className={`rounded-xl p-3 flex items-center space-x-3 border ${errorsCount > 0 ? 'bg-amber-950/40 border-amber-500/40' : 'bg-slate-800/40 border-white/10'}`}>
              {errorsCount > 0 ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <div className="font-extrabold text-amber-300 text-sm">{errorsCount} aviso(s)</div>
                    <div className="text-[10px] text-amber-200/70">Linhas ignoradas por formato inválido</div>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <div className="font-extrabold text-blue-300 text-sm">Sem erros</div>
                    <div className="text-[10px] text-blue-200/70">Estrutura de colunas 100% válida</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Seção de pré-visualização dos 3 primeiros registros */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Pré-visualização dos 3 primeiros registros:</span>
              <span className="text-[10px] text-blue-400 font-semibold">(Exibindo {primeirosTres.length} de {totalCount})</span>
            </div>

            <div className="space-y-2">
              {primeirosTres.map((item, index) => (
                <div key={index} className="bg-slate-950/80 border border-white/10 rounded-xl p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-blue-400 text-[10px] uppercase tracking-wider">
                      Registro #{index + 1}
                    </span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                      {type === 'perguntas' ? item.categoria || 'SST' : type === 'usuarios' ? item.perfil || 'Colaborador' : 'Setor'}
                    </span>
                  </div>

                  {/* Renderização condicional conforme o tipo */}
                  {type === 'perguntas' && (
                    <div className="space-y-1">
                      <p className="font-bold text-white text-xs line-clamp-2">
                        {item.enunciado}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400 pt-1">
                        <span className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-slate-300">
                          Norma: <strong>{item.norma_relacionada || 'Geral'}</strong>
                        </span>
                        <span className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-slate-300">
                          Tipo: <strong>{item.tipo === 'verdadeiro_falso' ? 'V / F' : 'Múltipla Escolha'}</strong>
                        </span>
                        <span className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-slate-300">
                          Correta: <strong className="text-emerald-400">{item.tipo === 'verdadeiro_falso' ? (item.resposta_correta === 0 ? 'Verdadeiro' : 'Falso') : formatAlternativaText(item.alternativas?.[item.resposta_correta]) || `Opção ${item.resposta_correta + 1}`}</strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {type === 'usuarios' && (
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="font-bold text-white flex items-center space-x-1.5">
                          <User className="w-3.5 h-3.5 text-sky-400" />
                          <span>{item.nome}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">{item.email}</div>
                      </div>
                      <div className="text-right text-[10px] text-slate-300">
                        <div>Cargo: <strong>{item.cargo || 'Colaborador'}</strong></div>
                        <div className="text-slate-400">Setor: {getSetorNome(item.setor_id)}</div>
                      </div>
                    </div>
                  )}

                  {type === 'setores' && (
                    <div className="flex items-center space-x-2 text-white font-bold">
                      <Building className="w-4 h-4 text-emerald-400" />
                      <span>{item.nome}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {restantes > 0 && (
              <div className="p-2.5 bg-blue-950/30 border border-blue-500/20 rounded-xl text-center text-xs text-blue-300 font-medium">
                ... e mais <strong>{restantes}</strong> registro(s) que serão salvos após a confirmação.
              </div>
            )}
          </div>
        </div>

        {/* Rodapé e Botões de Ação */}
        <div className="p-4 bg-slate-950/80 border-t border-white/10 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={totalCount <= 0}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-950 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Confirmar e Salvar no Banco ({totalCount})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
