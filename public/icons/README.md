# Ícones de item

Solte aqui arquivos `<itemId>.png` (ex.: `2438.png` para Acrobatic War Boots) e o
builder passa a usá-los sozinho — não precisa mexer em código. Sem o arquivo, ele
desenha um glifo genérico pelo tipo da peça.

O id é o `ID` que aparece na base (`base/itens/**/<item>.md`) e no dropdown.

**Por que não vem pronto:** o dump não tem sprite de item. A coluna `icon` do
`raw-db-items.json` é uma flag de 4 valores, e o site de origem
(`rtm-database.pages.dev`) renderiza item como texto — só existem
`assets/classes/*.gif`. Os sprites reais estão no cliente do jogo.
