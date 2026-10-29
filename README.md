# Ritmo

Rastreador de hábitos diários. A mesma base de código vira três coisas:

- **Site responsivo**: layout de celular (tab bar, bottom sheets) e de computador (barra lateral, duas colunas, diálogos), publicado no GitHub Pages: https://thesousaleo.github.io/Ritmo/
- **APK Android**: gerado pelo Capacitor a cada push e publicado em [Releases](../../releases/latest). Download direto: https://github.com/thesousaleo/Ritmo/releases/latest/download/ritmo.apk
- **Sincronização** entre aparelhos via Supabase (login com e-mail e senha).

## Funções

**Tarefas**
- Listas com cor e ícone, Entrada, visões Hoje, Amanhã, Próximos 7 dias, Todas, Concluídas e por etiqueta.
- Subtarefas, descrição, etiquetas, prioridade (alta, média, baixa), data, hora, duração, repetição e lembrete.
- Entrada rápida que entende português: “Reunião amanhã às 15h #trabalho !1 ^Pessoal”, “Academia toda segunda e quarta 7h”, “Pagar aluguel dia 5 todo mês”.
- Concluir uma tarefa repetida cria o registro da conclusão e move a tarefa para a próxima data.
- Kanban por lista, com colunas próprias e arrastar entre colunas.
- No computador, arrastar uma tarefa para uma lista, etiqueta, Hoje ou Amanhã.

**Agenda**
- Eventos próprios (dia inteiro ou com horário, vários dias, repetição, lembrete, local, cor).
- Visões de mês, semana (3 dias no celular), dia e lista dos próximos 30 dias, com tarefas e eventos juntos.
- Arrastar para reagendar; clicar num horário vazio cria tarefa ou evento; tarefas sem data podem ser arrastadas para a grade.

**Matriz e foco**
- Matriz de Eisenhower ligada à prioridade: arrastar entre quadrantes muda a prioridade.
- Pomodoro (foco, pausa curta e longa, rodadas configuráveis) e cronômetro, ligados a uma tarefa ou hábito, com sessões e estatísticas sincronizadas.

**Hábitos** (continuam iguais)
- Construir ou evitar; todo dia, dias fixos ou N vezes por semana; temporizador; lembretes; pausas; notas e humor; marcos; detalhe por hábito; resumo semanal por e-mail.
- Os hábitos do dia também aparecem na visão Hoje das tarefas, junto da agenda do dia.

**Geral**
- Busca em tarefas, eventos e hábitos (tecla /).
- Atalhos no computador: N novo item, 1 a 6 trocam de módulo, Esc fecha painéis.
- Exportação do histórico em CSV; sincronização offline entre aparelhos.

## Resumo semanal por e-mail

A função `supabase/functions/weekly-summary` precisa do segredo `RESEND_API_KEY` (crie uma chave em resend.com). Sem domínio verificado, o Resend só entrega no e-mail da conta do Resend; para mandar para qualquer endereço, verifique um domínio e defina `RESEND_FROM` (por exemplo `Ritmo <resumo@seudominio.com>`).

## Como a sincronização funciona

- O app funciona sem conta. Os dados ficam no aparelho (`localStorage`).
- Ao criar uma conta, os hábitos deste aparelho sobem para ela. Ao entrar numa conta que já tem dados, o aparelho passa a mostrar os dados da conta.
- Cada toque é salvo localmente na hora e enviado em segundo plano. Sem internet, as alterações ficam numa fila e sobem quando a conexão volta.
- Os outros aparelhos recebem as mudanças em tempo real (Supabase Realtime) e também ao voltar para o app.
- Cada pessoa só lê e grava os próprios registros (Row Level Security no Postgres).

Banco: projeto Supabase `Ritmo` (sa-east-1). Tabelas `habits`, `checkins`, `moods`, `profiles`, `lists`, `tasks`, `events` e `focus_sessions`; o esquema está em `supabase/schema.sql`.

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras de hábitos e motor de sincronização
npm run build      # gera dist/
```

APK local (precisa do Android Studio): `npm run android`.

## Estrutura

```
src/
  App.jsx                 navegação, painéis abertos, teclado, botão voltar do Android
  store.js                estado e ações: hábitos, tarefas, listas, agenda, foco, conta
  components/
    Nav.jsx               trilho de módulos e painel de listas (computador), abas e gaveta (celular)
    tasks/                TasksView, TaskRow, QuickAdd, TaskDetail, DatePicker, KanbanBoard, ListSheet
    calendar/             CalendarView (mês, semana, dia, lista), EventSheet, CreateSheet
    MatrixView.jsx        matriz de Eisenhower
    FocusView.jsx         Pomodoro e cronômetro
    SearchSheet.jsx       busca
    Today.jsx, Stats.jsx, HabitSheet.jsx, HabitDetail.jsx, TimerSheet.jsx, ManageSheet.jsx   hábitos
    AccountSheet.jsx, Overlays.jsx, ui.jsx
  lib/
    tasks.js              tarefas, visões, repetição, entrada rápida, matriz, Kanban, busca
    calendar.js           grade do mês, ocorrências de eventos, blocos sobrepostos
    focus.js              estado do Pomodoro e estatísticas
    habits.js             regras de hábitos
    data.js               estado completo, exemplos e armazenamento local
    sync.js               fila offline + envio/leitura + tempo real
    dnd.js                arrastar e soltar (mouse e toque)
    native.js             lembretes, avisos, exportação
ci/e2e.mjs                teste no navegador
.github/workflows/        site (Pages), APK (Releases) e teste no navegador
```

## Testes

- `npm test`: regras de hábitos, tarefas, repetição, entrada rápida, agenda, foco e sincronização.
- Workflow **Testar no navegador**: abre o app com Playwright em tamanho de celular e de computador, cria tarefas, arrasta itens no Kanban, na agenda e na matriz, confere o que foi gravado e publica capturas de tela no branch `ci-shots`.

## Assinatura do APK

`signing/debug.keystore` é uma chave de assinatura de uso local (senha padrão `android`), mantida no repositório para que cada build use a mesma assinatura e as atualizações instalem por cima. Ela serve para instalação direta, não para a Play Store. Para publicar na loja, crie uma chave de release e guarde-a nos Secrets do repositório.
