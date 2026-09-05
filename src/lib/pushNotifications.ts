// ============================================================================
// pushNotifications.ts — AVISOS NO CELULAR (estilo WhatsApp)
// ----------------------------------------------------------------------------
// - Com o app ABERTO ou em 2º plano: mostra o aviso na hora (som + faixa).
// - Com o app FECHADO: precisa do Firebase configurado (veja o passo a passo
//   no final deste arquivo). Sem ele, o aviso chega ao abrir o app.
// - Na Web (localhost): não faz nada (só funciona no app do celular).
// ============================================================================

import { getSupabaseClient } from './supabase';
import { isNativePlatform, platformName } from './capacitor';

export interface PushMessage {
  titulo: string;
  mensagem: string;
  tipo?: string;
}

// Mostrador de diagnóstico: guarda o passo atual para exibir na tela de
// login (ex.: "sino: registrado ✓"). Ajuda a descobrir onde trava.
export function pushStatusAtual(): string {
  try {
    return localStorage.getItem('sst_push_status') || 'sino: ainda não iniciado';
  } catch {
    return 'sino: ainda não iniciado';
  }
}

function definirPushStatus(s: string) {
  try {
    localStorage.setItem('sst_push_status', s);
    window.dispatchEvent(new CustomEvent('sst-push-status', { detail: s }));
  } catch {
    // Ignora.
  }
}

// Guarda o código do celular (token) na nuvem para saber para onde enviar.
// Registra pelo entregador (atualiza o dono mesmo se o código já existir);
// se ele falhar, tenta o cadastro direto na tabela.
async function salvarTokenNaNuvem(usuarioId: string, token: string, usuarioEmail?: string) {
  const email = (usuarioEmail || '').trim().toLowerCase() || null;
  try {
    const client = getSupabaseClient();
    if (!client || !usuarioId || !token) {
      definirPushStatus('sino: faltou dado para salvar');
      return;
    }
    // 1) Tenta pelo entregador (caminho principal).
    try {
      const { data, error } = await client.functions.invoke('enviar-push', {
        body: { action: 'registrar', usuario_id: usuarioId, email, token, plataforma: platformName() },
      });
      if (!error && (data as any)?.success) {
        definirPushStatus('sino: registrado ✓');
        return;
      }
    } catch {
      // Cai para o cadastro direto abaixo.
    }
    // 2) Cadastro direto (reserva).
    const { error } = await client.from('push_tokens').insert({
      usuario_id: usuarioId,
      email,
      token,
      plataforma: platformName(),
      atualizado_em: new Date().toISOString(),
    });
    if (error) {
      // 23505 = código já cadastrado: está valendo.
      if ((error as any)?.code === '23505') {
        definirPushStatus('sino: registrado ✓');
      } else {
        definirPushStatus('sino: nuvem recusou (' + error.message.slice(0, 60) + ')');
      }
    } else {
      definirPushStatus('sino: registrado ✓');
    }
  } catch (e: any) {
    definirPushStatus('sino: erro ao salvar (' + String(e?.message || e).slice(0, 60) + ')');
  }
}

// Mostra o aviso na tela do celular (faixa + som), mesmo em 2º plano.
async function mostrarAvisoNaTela(msg: PushMessage) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 100000),
          title: msg.titulo || 'SST Quiz',
          body: msg.mensagem || 'Você tem uma novidade!',
          sound: undefined,
        },
      ],
    });
  } catch {
    // Sem plugin: ignora (o aviso interno do app continua funcionando).
  }
}

// Liga as notificações. Chame 1x após o login.
// onMessage: o que fazer com o aviso dentro do app (ex.: colocar na lista).
// Retorna uma função de limpeza (para desligar os ouvintes).
export function initPushNotifications(
  usuarioId: string | undefined,
  onMessage: (msg: PushMessage) => void,
  usuarioEmail?: string
): () => void {
  let limpeza: Array<() => void> = [];
  let parado = false;

  if (!isNativePlatform()) {
    definirPushStatus('sino: modo web (só funciona no app)');
    return () => {};
  }

  (async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Ouvintes PRIMEIRO (antes de registrar): se o código chegar rápido,
      // ninguém perde o aviso.
      // 1) Quando o código do celular chegar, salva na nuvem.
      definirPushStatus('sino: ouvindo...');
      const reg = await PushNotifications.addListener('registration', (t) => {
        if (!parado && usuarioId && t?.value) {
          definirPushStatus('sino: código recebido, salvando...');
          salvarTokenNaNuvem(usuarioId, t.value, usuarioEmail);
        }
      });
      limpeza.push(() => reg.remove());

      // 1b) Se o registro falhar (ex.: sem Google Play Services), mostra o motivo.
      const regErr = await PushNotifications.addListener('registrationError', (e: any) => {
        const motivo = String(e?.error || e?.message || e || 'desconhecido').slice(0, 80);
        console.warn('[push] Falha no registro do celular:', motivo);
        definirPushStatus('sino: falhou (' + motivo + ')');
      });
      limpeza.push(() => regErr.remove());

      // 2) Quando um aviso chegar com o app aberto/fundo: mostra na tela + avisa o app.
      const recebida = await PushNotifications.addListener(
        'pushNotificationReceived',
        (n) => {
          const msg: PushMessage = {
            titulo: n?.title || 'SST Quiz',
            mensagem: n?.body || 'Você tem uma novidade!',
            tipo: (n?.data as any)?.tipo,
          };
          mostrarAvisoNaTela(msg);
          try {
            onMessage(msg);
          } catch {
            // Nunca quebra o app por causa de um aviso.
          }
        }
      );
      limpeza.push(() => recebida.remove());

      // 3) Quando o usuário TOCA no aviso: só repassa para o app.
      const tocada = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (a) => {
          const msg: PushMessage = {
            titulo: a?.notification?.title || 'SST Quiz',
            mensagem: a?.notification?.body || 'Você tem uma novidade!',
            tipo: (a?.notification?.data as any)?.tipo,
          };
          try {
            onMessage(msg);
          } catch {
            // Nunca quebra o app por causa de um aviso.
          }
        }
      );
      limpeza.push(() => tocada.remove());

      // 4) Pede permissão ("Permitir notificações?" — só aparece 1x).
      definirPushStatus('sino: pedindo permissão...');
      const permissao = await PushNotifications.requestPermissions();
      if (permissao.receive !== 'granted' || parado) {
        definirPushStatus('sino: permissão negada');
        return;
      }

      // 5) Registra o celular e pega o código (token) dele.
      definirPushStatus('sino: registrando celular...');
      await PushNotifications.register();
    } catch {
      // Celular sem suporte: segue o jogo sem avisos externos.
    }
  })();

  return () => {
    parado = true;
    limpeza.forEach((fn) => {
      try {
        fn();
      } catch {
        // Ignora.
      }
    });
    limpeza = [];
  };
}
