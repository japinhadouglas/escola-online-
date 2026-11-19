# ESCOLA ONLINE — Plataforma Nacional de Comunicação e Aula Virtual

Plataforma educacional profissional desenvolvida para escolas públicas (redes municipais e estaduais) e particulares. Combina ambiente virtual de aprendizagem, comunicação em canais organizados, videoconferência **WebRTC** em tempo real (**Sala do Futuro**), compartilhamento de tela nativo, quadro branco digital colaborativo e governança multi-tenant com estrita conformidade com a LGPD.

---

## 🏛️ 1. Arquitetura e Principais Recursos

- **Sala do Futuro (WebRTC + Socket.io)**:
  - Áudio e vídeo em alta definição com mesh WebRTC e servidores STUN integrados.
  - Compartilhamento de tela nativo (tela inteira, janela de aplicativo ou aba do navegador).
  - Lousa digital colaborativa em tempo real com caneta, formas geométricas, marca-texto e borracha.
  - Fila de "Levantar a mão" e reações rápidas (👏, 👍, 💡, ❤️, 😊).
  - Moderação pedagógica pelo professor: silenciar alunos individualmente ou em massa, conceder/revogar permissão de tela, remover participantes e encerrar aula.
- **Canais de Turma e Mensagens Instantâneas**:
  - Canais por disciplina (`#geral`, `#matemática`, `#português`, `#ciências`).
  - Canais de avisos oficiais com bloqueio para postagem exclusiva de docentes/coordenação.
- **Ambiente de Aprendizagem (LMS)**:
  - Repositório de materiais didáticos e documentos (PDFs, links, guias).
  - Publicação de atividades avaliativas com prazos e pontuação máxima.
  - Entrega de trabalhos pelos estudantes e atribuição de notas/feedbacks pelos professores.
- **Segurança Multi-Tenant e LGPD**:
  - Senhas com hash Bcrypt seguro (fator de custo 12) — nenhuma senha em texto puro.
  - Sessões JWT assinadas e transmitidas com proteção CSRF e XSS.
  - Rate limiting e bloqueio temporário após tentativas consecutivas incorretas (anti-brute force).
  - Isolamento estrito por `schoolId` validado no servidor (proteção contra IDOR/BOLA).
  - Trilha de auditoria (Audit Log) imutável registrando logins, alterações e eventos pedagógicos.
- **Responsividade Multiplataforma**:
  - Compatível com computadores, notebooks, tablets e smartphones (Android e iOS / iPhone).

---

## 🚀 2. Como Executar o Projeto

### Pré-requisitos
- Node.js (v18 ou superior)
- npm (v9 ou superior)

### Passo 1: Instalar dependências
```bash
npm install
```

### Passo 2: Inicializar o Banco de Dados e Popular com Dados de Teste
```bash
npx prisma db push
npx tsx prisma/seed.ts
```

### Passo 3: Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```
Abra o navegador em: **`http://localhost:5173`** (ou porta indicada no terminal).

---

## 👥 3. Credenciais para Demonstração e Testes

A plataforma possui botões de **Acesso Rápido de 1 Clique** na tela de login, mas você também pode digitar as credenciais abaixo:

| Perfil | RA / Matrícula | Senha | Nome do Usuário | Turmas / Acesso |
| :--- | :--- | :--- | :--- | :--- |
| **Aluno** | `RA202601` | `aluno123` | Lucas Silva | 8º Ano A, 7º Ano B |
| **Aluno 2** | `RA202602` | `aluno123` | Beatriz Oliveira | 8º Ano A |
| **Professor** | `PROF01` | `prof123` | Prof. Carlos Eduardo (Matemática) | Gestão do 8º Ano A |
| **Professora** | `PROF02` | `prof123` | Profª. Mariana Costa (Português) | Gestão do 8º Ano A |
| **Coordenação** | `COORD01` | `coord123` | Juliana Prado | Coordenação Pedagógica |
| **Direção / Admin** | `ADMIN01` | `admin123` | Roberto Andrade | Gestão Total da Escola |

---

## 🧪 4. Executando a Suíte de Testes Automatizados

Para executar os testes automatizados cobrindo autenticação, RBAC e segurança multi-tenant (IDOR):
```bash
npm run test
```

---

## 🌐 5. Endpoints Principais da API (`/api/v1`)

- `POST /api/v1/auth/login`: Autenticação segura com proteção anti-brute force.
- `GET /api/v1/auth/me`: Dados do usuário logado e turmas matriculadas.
- `GET /api/v1/classes`: Listagem de turmas com isolamento de tenant.
- `GET /api/v1/classes/:id`: Detalhes da turma, canais, professores, materiais e atividades.
- `GET /api/v1/classes/:id/channels/:channelId/messages`: Histórico de mensagens do canal.
- `POST /api/v1/classes/:id/channels/:channelId/messages`: Envio de mensagens no canal.
- `POST /api/v1/assignments`: Criação de atividades pelo professor.
- `POST /api/v1/assignments/:id/submit`: Envio de entrega pelo estudante.
- `POST /api/v1/materials`: Cadastro de material didático.
- `GET /api/v1/schools/dashboard-stats`: Estatísticas consolidadas do dashboard.
- `GET /api/v1/users`: Listagem de usuários da escola (Admin / Coordenador).
- `POST /api/v1/users/batch`: Importação em lote de estudantes e professores.
- `GET /api/v1/audit`: Consulta da trilha de auditoria e conformidade LGPD.

---

## 📜 6. Licença e Uso
Desenvolvido com foco no ecossistema de educação pública e privada do Brasil.
