// Assistente de voz: transforma a frase falada num comando do painel.
// Função pura (testada em tests/assistant.test.mjs); quem executa é o app.js.

// Minúsculas, sem acento e sem pontuação, para comparar com folga.
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PLAY = '(?:toca|tocar|toque|coloca|colocar|coloque|bota|botar|poe|por|quero ouvir|quero ver|assistir|ver|procura|procurar|busca|buscar|pesquisa|pesquisar)';
const TO = '(?:para o|para a|para|pra|pro|ate o|ate a|ate)';

const VIEWS = [
  [/^(?:youtube)$/, 'youtube'],
  [/^(?:painel|inicio|tela inicial)$/, 'dash'],
  [/^(?:apps|aplicativos|aplicativo)$/, 'home'],
  [/^(?:velocidade|velocimetro)$/, 'speed'],
  [/^(?:spotify|musica|tocando)$/, 'music'],
  [/^(?:ajustes|configuracoes|configuracao)$/, 'settings'],
];

// Casa/trabalho viram os endereços salvos.
function destination(raw) {
  const d = raw.replace(/^(?:minha |meu |o |a )/, '');
  if (/^casa$/.test(d)) return { type: 'nav', saved: 'home' };
  if (/^(?:trabalho|servico|escritorio|firma)$/.test(d)) return { type: 'nav', saved: 'work' };
  return { type: 'nav', to: raw };
}

export function parseCommand(text) {
  const t = normalize(text);
  if (!t) return { type: 'unknown' };
  let m;

  // Música e vídeo: controles
  if (/^(?:pausa|pausar|pause|para|parar|pare|silencio)(?: (?:a )?(?:musica|video))?$/.test(t)) return { type: 'pause' };
  if (/^(?:continua|continuar|continue|retoma|retomar|play|toca|tocar|despausa|volta a tocar)$/.test(t)) return { type: 'resume' };
  if (/^(?:proxima|proximo|pula|pular|avanca|avancar)(?: (?:musica|faixa))?$/.test(t)) return { type: 'next' };
  if (/^(?:anterior|volta|voltar)(?: (?:a )?(?:musica|faixa))?(?: anterior)?$/.test(t)) return { type: 'prev' };
  if (/^(?:musica|faixa) anterior$/.test(t)) return { type: 'prev' };

  // Meu carro
  if (/(?:onde (?:eu )?estacionei|onde (?:esta|ta|fica) (?:o |meu )?carro|cade (?:o |meu )?carro|achar (?:o |meu )?carro|meu carro)/.test(t)) return { type: 'parkFind' };
  if (/(?:estacionei|salva(?:r)? (?:a )?vaga|salva(?:r)? (?:o )?(?:local do )?carro|marca(?:r)? (?:onde )?(?:o )?carro)/.test(t)) return { type: 'parkSave' };

  // YouTube
  if ((m = t.match(new RegExp(`^${PLAY} (.+?) no youtube$`)))) return { type: 'youtube', query: m[1] };
  if ((m = t.match(/^youtube (.+)$/))) return { type: 'youtube', query: m[1] };

  // Navegação
  if ((m = t.match(new RegExp(`^(?:navega|navegar|navegue|ir|vai|vamos|leva|me leva|levar|rota|traca rota|tracar rota|como chego|como chegar)(?: ${TO})? (.+)$`)))) {
    return destination(m[1]);
  }

  // Ligação e mensagem
  if ((m = t.match(/^(?:liga|ligar|ligue|telefona|telefonar|chama|chamar)(?: (?:para|pra|pro|com))? (.+)$/))) return { type: 'call', name: m[1] };
  if ((m = t.match(/^(?:manda|mandar|envia|enviar|escreve|escrever)?\s*(?:uma )?mensagem(?: (?:para|pra|pro))? (.+)$/))) return { type: 'sms', name: m[1] };

  // Abrir telas
  if ((m = t.match(/^(?:abre|abrir|abra|mostra|mostrar|vai pro|vai para o|vai para a|ir para o|ir para a)? ?(.+)$/))) {
    const hit = VIEWS.find(([re]) => re.test(m[1]));
    if (hit) return { type: 'open', view: hit[1] };
  }

  // Música no Spotify (ou YouTube, se o Spotify não estiver conectado)
  if ((m = t.match(new RegExp(`^${PLAY} (.+?)(?: no spotify)?$`)))) return { type: 'music', query: m[1] };

  return { type: 'unknown' };
}

// Acha o contato favorito pelo nome falado ("ana", "ana souza", "a ana").
export function findContact(contacts, spoken) {
  const want = normalize(spoken).replace(/^(?:o |a |pro |pra )/, '');
  if (!want) return null;
  const list = contacts.filter((c) => c.name);
  return (
    list.find((c) => normalize(c.name) === want) ??
    list.find((c) => normalize(c.name).startsWith(want)) ??
    list.find((c) => normalize(c.name).split(' ').includes(want.split(' ')[0])) ??
    null
  );
}
