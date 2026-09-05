import React, { useState, useRef } from 'react';
import { useSST } from '../context/SSTContext';
import { CameraCaptureModal } from './CameraCaptureModal';
import { compressImageFile } from '../utils/imageCompressor';
import { 
  User, 
  Lock, 
  Camera, 
  CheckCircle2, 
  X, 
  Eye, 
  EyeOff, 
  KeyRound, 
  ShieldCheck, 
  Sparkles,
  RefreshCw,
  Upload,
  Image as ImageIcon
} from 'lucide-react';

// ====================================================================
// UserProfileModal: modal de edição do perfil do usuário.
// Permite alterar o nome de exibição, trocar a foto de avatar (via
// galeria com compressão de imagem, câmera, URL ou avatares padrão) e
// cadastrar uma nova senha de acesso. Os dados de identificação
// corporativa são somente leitura. Salva sincronizando o contexto SST,
// o localStorage e o banco Supabase.
// ====================================================================

// Props do componente: controle de abertura e fechamento do modal.
interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Avatares padrão oferecidos para seleção rápida.
const PRESET_AVATARS = [
  { label: 'Homem', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250' },
  { label: 'Mulher', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250' },
];

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  // Consome o usuário atual e a ação de edição do contexto SST.
  const { currentUser, editarUsuario, isSupabaseActive } = useSST();

  // Estado dos campos editáveis do perfil (nome e avatar) e da câmera.
  const [nome, setNome] = useState(currentUser.nome);
  const [avatar, setAvatar] = useState(currentUser.avatar);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Referências: input de arquivo oculto e timer de fechamento automático.
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  // Processa o upload da galeria: valida o tamanho (máx. 10MB),
  // comprime a imagem (400x400, qualidade 0.82) e atualiza o avatar.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErroMsg('A imagem deve ter no máximo 10MB.');
        return;
      }
      try {
        const compressed = await compressImageFile(file, 400, 400, 0.82);
        setAvatar(compressed);
        setErroMsg('');
      } catch (err: any) {
        setErroMsg('Erro ao processar imagem da galeria.');
      }
    }
    e.target.value = '';
  };

  // Campos de alteração de senha
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);

  // Estados de feedback (mensagens de sucesso/erro exibidas na tela)
  const [sucessoMsg, setSucessoMsg] = useState('');
  const [erroMsg, setErroMsg] = useState('');

  // Modal fechado não renderiza nada.
  if (!isOpen) return null;

  // Salva as alterações de nome, avatar e (opcional) nova senha.
  const handleSalvarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroMsg('');
    setSucessoMsg('');

    // Se o usuário tentou alterar a senha, valida mínimo de 6 caracteres e confirmação.
    if (novaSenha || confirmarSenha) {
      if (novaSenha.length < 6) {
        setErroMsg('A nova senha deve possuir no mínimo 6 caracteres.');
        return;
      }
      if (novaSenha !== confirmarSenha) {
        setErroMsg('A confirmação da senha não confere com a nova senha.');
        return;
      }
    }

    // Monta o objeto atualizado mantendo os demais dados do usuário.
    const usuarioAtualizado = {
      ...currentUser,
      nome: nome.trim() || currentUser.nome,
      avatar: avatar.trim() || currentUser.avatar,
      ...(novaSenha ? { senha: novaSenha } : {}),
    };

    // Atualiza via editarUsuario: sincroniza estado, localStorage E banco Supabase.
    editarUsuario(currentUser.id, usuarioAtualizado);

    setSucessoMsg(
      isSupabaseActive
        ? 'Perfil atualizado com sucesso!'
        : 'Perfil atualizado com sucesso! (Supabase não configurado — os dados ficam salvos apenas localmente.)'
    );
    setNovaSenha('');
    setConfirmarSenha('');

    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setSucessoMsg('');
      onClose();
    }, 1800);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[9999] overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
      <div className="relative my-auto w-full max-w-lg bg-slate-900/95 border border-white/15 rounded-3xl p-6 text-white space-y-5 shadow-2xl backdrop-blur-2xl">
        
        {/* Botão fechar o modal */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Cabeçalho do modal: título e descrição */}
        <div className="flex items-center space-x-3 border-b border-white/10 pb-4">
          <div className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-400 rounded-2xl text-slate-950 shadow-lg">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-white">Meu Perfil & Segurança</h2>
            <p className="text-xs text-slate-400">
              Altere sua foto de avatar, nome de exibição e cadastre uma nova senha de acesso.
            </p>
          </div>
        </div>

        {/* Alerta de sucesso */}
        {sucessoMsg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{sucessoMsg}</span>
          </div>
        )}

        {/* Alerta de erro */}
        {erroMsg && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
            <X className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{erroMsg}</span>
          </div>
        )}

        <form onSubmit={handleSalvarPerfil} className="space-y-5 text-xs">
          
          {/* Seletor de foto de perfil/avatar */}
          <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
            <label className="block font-extrabold text-slate-200 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Foto de Perfil / Avatar</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Tire uma foto ou envie do dispositivo</span>
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <img 
                src={avatar} 
                alt="Avatar preview" 
                className="w-20 h-20 rounded-2xl object-cover ring-4 ring-emerald-500/40 shadow-xl shrink-0" 
              />
              
              <div className="flex-1 w-full space-y-2">
                {/* Botões de ação de envio (galeria e câmera) */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Input de arquivo oculto disparado pelo botão "Galeria de Fotos" */}
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold p-2.5 rounded-xl border border-emerald-500/40 flex items-center justify-center space-x-1.5 transition-all text-xs"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>Galeria de Fotos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold p-2.5 rounded-xl border border-purple-500/40 flex items-center justify-center space-x-1.5 transition-all text-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Usar Câmera</span>
                  </button>
                </div>

                <input 
                  type="text" 
                  value={avatar} 
                  onChange={(e) => setAvatar(e.target.value)} 
                  placeholder="Ou cole o link de uma imagem da web..." 
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-[11px]"
                />
              </div>
            </div>

            {/* Galeria de avatares padrão para seleção rápida */}
            <div className="pt-2">
              <div className="text-[11px] text-slate-400 mb-2 font-medium">Ou escolha um dos avatares padrão:</div>
              <div className="flex items-center space-x-3">
                {PRESET_AVATARS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAvatar(item.url)}
                    className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl border-2 transition-all ${
                      avatar === item.url 
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 font-bold scale-105 shadow-md' 
                        : 'border-white/10 bg-white/5 text-slate-300 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={item.url} alt={item.label} className="w-8 h-8 rounded-lg object-cover" />
                    <span className="text-xs font-bold">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Dados básicos de identificação corporativa (somente leitura) */}
          <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-slate-300 flex items-center space-x-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Dados de Identificação Corporativa</span>
              </span>
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                Apenas Leitura
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-400 text-[11px] mb-1">Nome Completo</label>
                <div className="bg-slate-900 border border-white/5 rounded-xl p-2.5 text-slate-300 font-medium cursor-not-allowed">
                  {currentUser.nome}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 text-[11px] mb-1">Cargo / Função</label>
                <div className="bg-slate-900 border border-white/5 rounded-xl p-2.5 text-slate-300 font-medium cursor-not-allowed">
                  {currentUser.cargo}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              * Para alterar seu nome, cargo ou setor, entre em contato com o Administrador da sua empresa.
            </p>
          </div>

          {/* Seção de cadastro de nova senha de acesso */}
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3">
            <div className="font-extrabold text-white flex items-center space-x-2 border-b border-white/10 pb-2">
              <KeyRound className="w-4 h-4 text-purple-400" />
              <span>Cadastrar Nova Senha de Acesso</span>
            </div>

            <p className="text-[11px] text-slate-400">
              Deixe em branco se não desejar alterar sua senha atual.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nova Senha</label>
                <div className="relative">
                  <input 
                    type={showSenha ? 'text' : 'password'} 
                    value={novaSenha} 
                    onChange={(e) => setNovaSenha(e.target.value)} 
                    placeholder="Mínimo 6 caracteres" 
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 pr-10 text-slate-200 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha(!showSenha)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-white"
                  >
                    {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Confirmar Nova Senha</label>
                <input 
                  type={showSenha ? 'text' : 'password'} 
                  value={confirmarSenha} 
                  onChange={(e) => setConfirmarSenha(e.target.value)} 
                  placeholder="Repita a nova senha" 
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Ações do rodapé: cancelar e salvar alterações */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2.5 rounded-xl border border-white/10 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>
          </div>

        </form>

      </div>

      {/* Modal de captura de foto pela câmera */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(dataUrl) => setAvatar(dataUrl)}
      />
    </div>
  );
};
