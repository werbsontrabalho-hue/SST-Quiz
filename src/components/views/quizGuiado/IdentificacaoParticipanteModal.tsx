import React, { useState } from 'react';
import { User, Building2, Play, X, ShieldCheck, Sparkles } from 'lucide-react';

interface IdentificacaoParticipanteModalProps {
  isOpen: boolean;
  pinSala: string;
  nomeSala?: string;
  modalidade?: 'avaliacao' | 'interativo';
  erroExterno?: string;
  onClose: () => void;
  onConfirmar: (dados: { nome: string; matricula?: string; cpf?: string; cpf_ou_empresa?: string }) => void;
}

export const IdentificacaoParticipanteModal: React.FC<IdentificacaoParticipanteModalProps> = ({
  isOpen,
  pinSala,
  nomeSala,
  modalidade = 'avaliacao',
  erroExterno,
  onClose,
  onConfirmar,
}) => {
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [erroMsg, setErroMsg] = useState('');

  if (!isOpen) return null;

  const isInterativo = modalidade === 'interativo';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      setErroMsg(isInterativo ? 'Por favor, informe seu Nome ou Apelido para continuar.' : 'Por favor, informe seu Nome Completo para continuar.');
      return;
    }
    if (!isInterativo && !matricula.trim()) {
      setErroMsg('Por favor, informe sua Matrícula / Registro.');
      return;
    }
    setErroMsg('');
    onConfirmar({
      nome: nome.trim(),
      matricula: isInterativo ? (matricula.trim() || 'INTERATIVO') : matricula.trim(),
      cpf_ou_empresa: isInterativo ? 'Modo Interativo' : matricula.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white space-y-5">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2.5 rounded-2xl border ${isInterativo ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">
                {isInterativo ? 'Entrada no Quiz Interativo' : 'Identificação Obrigatória SST'}
              </h3>
              <p className="text-xs text-slate-400">Entrada na Sala (PIN: {pinSala})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {nomeSala && (
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl text-xs space-0.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Treinamento SST:</span>
            <div className="font-extrabold text-emerald-400 text-sm line-clamp-1">{nomeSala}</div>
          </div>
        )}

        <p className="text-xs text-slate-300 leading-relaxed">
          {isInterativo 
            ? 'Informe somente seu nome ou apelido para participar do ranking ao vivo:'
            : 'Ao escanear o QR Code de uma Avaliação Teórica SST, informe obrigatoriamente:'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isInterativo ? 'Nome ou Apelido *' : 'Nome Completo *'}</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={isInterativo ? 'Ex: Carlos / Carlinhos' : 'Ex: Carlos Eduardo Silva'}
              autoFocus
              className="w-full bg-slate-950 border border-white/20 rounded-2xl px-4 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          {!isInterativo && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Matrícula / Registro *</span>
              </label>
              <input
                type="text"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                placeholder="Ex: MAT-10492"
                className="w-full bg-slate-950 border border-white/20 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          )}

          {erroMsg && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold">
              {erroMsg}
            </div>
          )}

          {erroExterno && !erroMsg && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold">
              {erroExterno}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-xl transition-all transform hover:scale-102 mt-2"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>Confirmar e Entrar no Quiz</span>
          </button>

        </form>

      </div>
    </div>
  );
};
