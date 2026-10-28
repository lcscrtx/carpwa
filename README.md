# Painel do Carro

PWA para iPhone que vira um painel de carro com o celular na vertical. É HTML, CSS e JavaScript puro, sem dependências.

## O que tem

- **Apps:** grade com Navegar, Música, Telefone, Mensagens, Casa, Trabalho, Velocidade, Painel e Ajustes.
- **Dock:** relógio, atalhos rápidos, botão para manter a tela acesa e botão que alterna entre Apps e Painel.
- **Painel:** hora, velocidade, destinos e contatos favoritos.
- **Velocímetro:** usa o GPS do iPhone.
- **Navegação:** abre a rota no Waze, no Apple Mapas ou no Google Maps. Guarda os 5 destinos recentes.
- **Música:** abre o Apple Music, o Spotify, o YouTube Music ou o Deezer.
- **Telefone e Mensagens:** usam até 4 favoritos. A ligação sai pelo Bluetooth do rádio.
- **Uso offline:** funciona sem internet depois da primeira visita.
- **Spotify:** mostra o que está tocando, com capa, barra de progresso, ⏮ ⏯ ⏭, modo aleatório e playlists. Controla qualquer aparelho com Spotify aberto, como o app do iPhone.

Tudo fica salvo no próprio aparelho, no `localStorage`.

## Conectar o Spotify

Exige conta Premium. O app usa Authorization Code com PKCE, então não precisa de client secret. O Client ID do app "Painel do Carro" já vem fixo em `public/spotify.js` (`CLIENT_ID`); basta tocar em **Conectar Spotify** e entrar na conta.

Cada endereço do painel precisa estar nas Redirect URIs do app em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard):

- **Versão publicada:** algo como `https://seu-site/`.
- **Teste no PC:** `http://127.0.0.1:4173/` (qualquer porta funciona). O Spotify **não aceita `localhost`**, nem IP da rede via HTTP.

O Spotify precisa estar aberto em algum aparelho para os comandos funcionarem. Os tokens ficam no `localStorage`.

## Rodar

Requer Node.js 20 ou superior.

```sh
npm run dev     # http://localhost:4173
npm test
npm run icons   # gera de novo os PNGs em icons/
```

## No iPhone

O GPS, o modo offline e a instalação exigem **HTTPS**. Publique a pasta em um host estático, como GitHub Pages, Vercel ou Netlify. Depois:

1. Abra o endereço no Safari.
2. Toque em Compartilhar → Adicionar à Tela de Início.

A cada publicação, mude `VERSION` em `public/sw.js`.
