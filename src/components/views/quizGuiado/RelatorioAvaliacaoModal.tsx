import React from 'react';
import { ResultadoAvaliacaoSST } from '../../../types';
import { ProvaAvaliacaoPDFModal } from './ProvaAvaliacaoPDFModal';

interface RelatorioAvaliacaoModalProps {
  resultado: ResultadoAvaliacaoSST | null;
  isOpen: boolean;
  onClose: () => void;
  modoInicial?: 'visualizar' | 'imprimir' | 'baixar_pdf';
}

export const RelatorioAvaliacaoModal: React.FC<RelatorioAvaliacaoModalProps> = (props) => {
  return <ProvaAvaliacaoPDFModal {...props} />;
};

