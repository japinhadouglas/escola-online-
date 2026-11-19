# Escola Online — Sunset Neon

## Direção visual

A interface será tematizada com uma direção própria de **sunset neon urbano**: alto contraste, rosa coral e azul piscina sobre preto azulado, com textura granulada, recortes diagonais e tipografia condensada. A referência pública usada como clima é a página oficial de GTA VI, sem copiar logos, artes, textos ou imagens proprietárias.

### Princípios

- **Impacto editorial:** cabeçalhos grandes, etiquetas curtas e composição de pôster.
- **Contraste funcional:** superfícies escuras preservam legibilidade; coral e azul indicam ação e estado.
- **Calor humano:** gradientes de pôr do sol e detalhes creme suavizam a interface educacional.
- **Movimento controlado:** brilho, ruído e deslocamentos curtos reforçam energia sem atrapalhar leitura.

### Paleta

- Coral assinatura: `#ff4f70` — ações primárias e foco.
- Azul piscina: `#35d8e8` — links, informação e presença.
- Creme: `#fff2d4` — texto de destaque.
- Noite: `#101326` e `#19172b` — superfícies e fundos.
- Violeta: `#6c4cff` — transições e profundidade.

### Layout e interação

A barra lateral vira uma coluna de navegação editorial escura; a área de conteúdo recebe camadas de gradiente e cartões com recortes sutis. Hover usa deslocamento de 2px, brilho curto e borda coral/azul. O tema continua responsivo e não altera as regras de acesso da Mentoria.

### Tipografia e voz

A hierarquia usa `Arial Narrow`, `Trebuchet MS` e fontes de sistema, com títulos em caixa alta e espaçamento amplo. A voz é direta, energética e escolar: “Entre na sua próxima aula” e “Sua turma, no seu ritmo”.

## Implementação

- Atualizar tokens globais e efeitos em `src/client/index.css`.
- Aplicar classes de tema no shell principal de `App.tsx`.
- Atualizar o login e a sala de turma sem remover funcionalidades existentes.
- Manter a filtragem e a autorização estrita da Mentoria.

## Referência consultada

- https://www.rockstargames.com/VI
