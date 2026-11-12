# Rotas do mapa

O botao **Escritorio mais proximo** solicita a localizacao ao navegador e acompanha
novas posicoes com `watchPosition`. Se o GPS for negado ou ficar indisponivel,
consulta a regiao aproximada do IP. O IP nao fornece acompanhamento em tempo real.

As rotas por ruas usam a API OSRM (`/route/v1/driving/` com `overview=full` e
`geometries=geojson`). A distancia e o tempo exibidos vem da rota viaria; o
tempo nao inclui transito em tempo real. O servico recebe a origem e o destino
quando o visitante ativa o recurso. O mapa nunca desenha uma linha reta como
substituto de uma rota que falhou.

## Publicacao comercial

Por padrao o projeto usa `https://router.project-osrm.org` para demonstracao.
O [servidor demo do OSRM](https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server)
**restringe uso comercial**, tem limite de uma requisicao por segundo e nao
garante disponibilidade. Antes de publicar a proposta comercial, configure um
servico OSRM proprio ou contratado e autorizado para uso comercial:

```bash
VITE_OSRM_BASE_URL=https://seu-servidor-osrm.example npm run build
```

O servidor precisa permitir requisicoes CORS do dominio do site. O endereco
deve apontar para a raiz da API, antes de `/route/v1/driving/`. A configuracao
e incorporada ao bundle pelo Vite no build; ela nao e uma chave secreta.

A geolocalizacao precisa de HTTPS em producao (ou `localhost` em testes). Os
servicos de localizacao por IP sao externos e podem estar indisponiveis; a
interface sinaliza isso e oferece nova tentativa sem inventar a posicao.
## Rotacao do mapa

- Ao exibir a rota, o mapa gira para o destino ficar a frente do visitante.
- No celular, com bussola disponivel, o mapa passa a girar conforme a direcao
  do aparelho, em torno da posicao do visitante. No iPhone a permissao e pedida
  no toque do botao **Escritorio mais proximo** (exigencia do Safari). Sem
  bussola, o rumo do GPS em movimento (por exemplo, dirigindo) e usado.
- No computador: botao direito do mouse (ou Ctrl) + arrastar gira o mapa.
- O botao da bussola mostra o norte; toca-lo liga/desliga o giro automatico.
  O botao de maximizar (Brasil inteiro) sempre volta o norte para cima.

## Precisao da localizacao

O GPS de alta precisao e acompanhado sem `timeout`: em GPS "frio" a primeira
leitura pode levar mais de 10 s. Enquanto nao chega, uma leitura rapida da
rede (ou, sem ela, a regiao do IP) aparece provisoriamente e e substituida
quando o satelite responde. A precisao (±metros) aparece no painel e como
circulo no mapa.

A posicao exata depende de o navegador liberar a localizacao. Ela fica
bloqueada (e o mapa mostra a regiao do IP, com o motivo) quando:
- a permissao foi negada nas configuracoes do navegador/celular;
- o site e aberto sem HTTPS;
- o site esta dentro de um iframe sem `allow="geolocation"` (alguns
  visualizadores de preview fazem isso). Abra o endereco publicado diretamente.

Para diagnostico, `?mapdebug` na URL expoe a instancia do mapa em
`window.__scMap`.

## Rota ate qualquer unidade

Alem do botao **Escritorio mais proximo** (destino automatico), o visitante
pode tracar a rota ate a unidade que quiser:

- na lista, pelo botao de seta ao lado de cada cidade;
- no mapa, abrindo uma unidade e tocando em **Tracar rota ate aqui**;
- em modo rota, pelo seletor de destino no painel, tocando em outro marcador
  ou em outra cidade da lista (o GPS e a bussola continuam ligados).

Com um destino escolhido, a rota nao troca sozinha quando outra unidade fica
mais perto. A opcao **Mais proximo de voce**, no seletor, volta ao automatico.

## Desempenho

Fora do Safari, o MapLibre usa um unico worker por padrao. O mapa define de 2
a 3 (`setWorkerCount`) para a linha da rota nao esperar na fila dos blocos
carregados durante o zoom.

## Aviso de chegada

Quando o visitante chega ao escritorio do destino, aparece um aviso no topo da
janela ("Voce chegou!", com nome e endereco da unidade), toca um leve som de
confirmacao (`src/map/lib/arrivalSound.ts`, sintetizado pela Web Audio API —
sem arquivo externo — e destravado no toque que inicia a rota) e o aparelho
vibra (onde o navegador permite). O aviso fica fixo na janela, entao aparece mesmo
com a pagina rolada para longe do mapa. Botoes: **Concluir rota** (encerra o
modo rota) e **X** (fecha o aviso e mantem o mapa; o painel passa a mostrar
"Voce esta na unidade").

Regras (em `src/map/lib/arrival.ts`), para nao avisar por engano:
- considera-se chegada a ate 50 m do escritorio, mais a margem de erro do
  proprio GPS (no maximo +50 m);
- so vale GPS. A regiao do IP nunca dispara o aviso (erra por quilometros);
- leituras com precisao pior que 150 m sao ignoradas;
- sao necessarias duas leituras seguidas dentro do raio (uma basta se a
  precisao for de ate 30 m);
- depois de avisar, so avisa de novo se o visitante se afastar mais de 250 m
  e voltar. Trocar o destino zera tudo;
- se o visitante ja estiver no local ao pedir a rota, o aviso diz "Voce ja
  esta aqui!".

O aviso e exibido enquanto a pagina esta aberta. Notificacoes com o navegador
fechado ou em segundo plano exigiriam um servico no servidor (push) e o GPS do
celular nao e atualizado em segundo plano, entao nao fazem parte desta versao.
