import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Mail, 
  Smartphone, 
  Swords, 
  Send, 
  CheckCircle2, 
  Clock,
  Sparkles,
  Trash2
} from 'lucide-react';
import { NotificacaoSST } from '../types';
import { useSST } from '../context/SSTContext';

// ====================================================================
// NotificationDrawer: gaveta lateral (drawer) de notificações e
// lembretes SST. Lista as notificações do usuário atual (filtro
// "não lidas"/"todas"), permite marcar como lidas, excluir, limpar tudo
// e navegar até a tela alvo ao clicar em uma notificação. Também traz
// um simulador de disparo de lembrete via push ou e-mail.
// ====================================================================

// Props do componente: controle de abertura, fechamento e navegação.
interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string, itemTargetId?: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  // Consome as notificações e as ações de gerenciamento do contexto SST.
  const { 
    notificacoes, 
    marcarNotificacaoComoLida, 
    marcarTodasNotificacoesComoLidas,
    excluirNotificacao,
    limparTodasNotificacoes,
    dispararNotificacaoLembrete,
    currentUser
  } = useSST();

  // Estado do filtro de exibição (não lidas/todas) e do simulador.
  const [filtro, setFiltro] = useState<'todas' | 'nao_lidas'>('nao_lidas');
  const [simularCanal, setSimularCanal] = useState<'push' | 'email'>('push');
  const [showSimularForm, setShowSimularForm] = useState(false);
  const [simMensagem, setSimMensagem] = useState('Quiz Diário de SST disponível! Responda em 3 minutos e mantenha seu Streak ativo.');
  const [enviadoFeedback, setEnviadoFeedback] = useState(false);

  // True se o usuário atual é um colaborador (participante).
  const isParticipant = currentUser.perfil === 'colaborador';

  // Filtra apenas as notificações direcionadas ao usuário atual
  // (exclui avisos de quiz/desafio/certificado para quem não participa).
  const minhasNotificacoes = notificacoes.filter(n => {
    if (n.usuario_id !== currentUser.id && n.usuario_id !== 'todos') return false;
    if (n.usuario_id === 'todos' && !isParticipant && (n.tipo === 'quiz_diario' || n.tipo === 'desafio_1v1' || n.tipo === 'certificado')) {
      return false;
    }
    return true;
  });

  // Lista exibida conforme o filtro selecionado (não lidas ou todas).
  const notificacoesFiltradas = filtro === 'nao_lidas' 
    ? minhasNotificacoes.filter(n => !n.lida)
    : minhasNotificacoes;

  // Total de notificações não lidas (usado no título e no badge).
  const totalNaoLidas = minhasNotificacoes.filter(n => !n.lida).length;

  // Ao abrir a gaveta, ajusta o filtro inicial conforme haja não lidas.
  React.useEffect(() => {
    if (isOpen) {
      if (totalNaoLidas > 0) {
        setFiltro('nao_lidas');
      } else {
        setFiltro('todas');
      }
    }
  }, [isOpen]);

  // Se a gaveta estiver fechada, não renderiza nada.
  if (!isOpen) return null;

  // Dispara uma notificação de lembrete simulada (push ou e-mail) via contexto.
  const handleSimularEnvio = (e: React.FormEvent) => {
    e.preventDefault();
    dispararNotificacaoLembrete({
      titulo: simularCanal === 'email' ? '📧 E-mail SST: Lembrete Importante' : '🔔 Notificação Push SST',
      mensagem: simMensagem,
      tipo: 'quiz_diario',
      canal: simularCanal === 'email' ? 'email' : 'push'
    });
    setEnviadoFeedback(true);
    setTimeout(() => setEnviadoFeedback(false), 2500);
  };

  // Retorna o ícone correspondente ao tipo da notificação (quiz, desafio ou genérica).
  const getIcon = (tipo: NotificacaoSST['tipo']) => {
    switch (tipo) {
      case 'quiz_diario':
        return <Clock className="w-4 h-4 text-emerald-400" />;
      case 'desafio_1v1':
        return <Swords className="w-4 h-4 text-purple-400" />;
      default:
        return <Bell className="w-4 h-4 text-blue-400" />;
    }
  };

  // Ao clicar em uma notificação: marca como lida, fecha a gaveta e
  // navega para a tela/registro alvo conforme o tipo (quiz, desafio, etc).
  const handleNotificationClick = (n: NotificacaoSST) => {
    marcarNotificacaoComoLida(n.id);
    onClose();

    if (!onNavigate) return;

    if (n.tipo === 'quiz_diario') {
      onNavigate('quizzes', n.link_acao);
    } else if (n.tipo === 'desafio_1v1') {
      onNavigate('desafios', n.link_acao);
    } else if (n.tipo === 'campanha') {
      if (currentUser.perfil === 'colaborador') {
        onNavigate('quizzes', n.link_acao);
      } else {
        onNavigate('admin_gestao');
      }
    } else if (n.tipo === 'certificado') {
      onNavigate('premiacoes');
    } else {
      onNavigate('dashboard');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border-l border-white/15 max-w-md w-full h-full shadow-2xl flex flex-col text-slate-100">
        
        {/* Cabeçalho da gaveta: título, contador de novas e botão fechar */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 relative">
              <Bell className="w-5 h-5" />
              {totalNaoLidas > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-slate-950 animate-ping" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <span>Notificações & Lembretes</span>
                {totalNaoLidas > 0 && (
                  <span className="bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.5 rounded-full border border-rose-500/40">
                    {totalNaoLidas} novas
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">Alertas em Tempo Real • Push e E-mail SST</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Botões de filtro (não lidas/todas) e ações em massa (ler todas/limpar) */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-950/40 text-xs font-bold gap-2 flex-wrap">
          <div className="flex space-x-1.5">
            <button
              onClick={() => setFiltro('nao_lidas')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filtro === 'nao_lidas' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Não Lidas ({totalNaoLidas})
            </button>
            <button
              onClick={() => setFiltro('todas')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filtro === 'todas' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas ({minhasNotificacoes.length})
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {totalNaoLidas > 0 && (
              <button
                onClick={marcarTodasNotificacoesComoLidas}
                className="text-emerald-400 hover:underline flex items-center space-x-1 text-[11px]"
                title="Marcar todas as notificações como lidas"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Ler todas</span>
              </button>
            )}

            {minhasNotificacoes.length > 0 && (
              <button
                onClick={() => {
                  limparTodasNotificacoes();
                }}
                className="text-rose-400 hover:text-rose-300 flex items-center space-x-1 text-[11px] bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/30 transition-all active:scale-95"
                title="Apagar todas as notificações"
              >
                <Trash2 className="w-3 h-3 text-rose-400" />
                <span>Limpar Tudo</span>
              </button>
            )}
          </div>
        </div>

        {/* Lista de notificações filtradas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notificacoesFiltradas.length === 0 ? (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Bell className="w-10 h-10 mx-auto opacity-30 text-slate-400" />
              <p className="text-xs font-medium">Nenhuma notificação {filtro === 'nao_lidas' ? 'pendente' : 'no momento'}.</p>
            </div>
          ) : (
            notificacoesFiltradas.map((n, idx) => (
              <div
                key={`${n.id}-${idx}`}
                onClick={() => handleNotificationClick(n)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative group ${
                  !n.lida 
                    ? 'bg-slate-800/90 border-emerald-500/40 shadow-lg' 
                    : 'bg-slate-900/50 border-white/5 opacity-80 hover:opacity-100'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-slate-950 rounded-xl border border-white/10 shrink-0">
                    {getIcon(n.tipo)}
                  </div>

                  <div className="flex-1 pr-6">
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      <span className="font-bold text-xs text-white">{n.titulo}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/10 text-slate-300 font-mono">
                        {n.canal === 'email' ? '📧 E-mail' : '📱 Push'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-snug">{n.mensagem}</p>
                    <span className="text-[10px] text-slate-500 block mt-1.5 font-mono">
                      {new Date(n.criada_em).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Coluna de ações: indicador de não lida e botão excluir */}
                  <div className="flex flex-col items-end space-y-2 shrink-0">
                    {!n.lida && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        excluirNotificacao(n.id);
                      }}
                      className="text-slate-500 hover:text-rose-400 hover:bg-rose-500/20 p-1.5 rounded-lg transition-all opacity-70 group-hover:opacity-100"
                      title="Apagar notificação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé: simulador de disparo de lembrete (push/e-mail) */}
        <div className="p-4 border-t border-white/10 bg-slate-950/80 space-y-3">
          <button
            onClick={() => setShowSimularForm(!showSimularForm)}
            className="w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-300 transition-all flex items-center justify-between"
          >
            <span className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Simulador de Disparo de Lembrete</span>
            </span>
            <span>{showSimularForm ? '▲' : '▼'}</span>
          </button>

          {showSimularForm && (
            <form onSubmit={handleSimularEnvio} className="space-y-2.5 pt-1 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSimularCanal('push')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 border transition-all ${
                    simularCanal === 'push'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900 text-slate-400 border-white/10'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Push Notification</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSimularCanal('email')}
                  className={`py-2 rounded-xl font-bold flex items-center justify-center space-x-1.5 border transition-all ${
                    simularCanal === 'email'
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-900 text-slate-400 border-white/10'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>E-mail Corporativo</span>
                </button>
              </div>

              <textarea
                value={simMensagem}
                onChange={e => setSimMensagem(e.target.value)}
                rows={2}
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
                placeholder="Texto da notificação..."
              />

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl transition-all shadow-lg flex items-center justify-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>CRIAR NOTIFICAÇÃO (TESTE LOCAL)</span>
              </button>

              {enviadoFeedback && (
                <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-lg text-[11px] text-center font-bold flex items-center justify-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {simularCanal === 'email'
                      ? 'Notificação criada localmente (o e-mail real só é enviado pelo servidor configurado).'
                      : 'Notificação criada localmente no app.'}
                  </span>
                </div>
              )}
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
