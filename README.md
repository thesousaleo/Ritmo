# Ritmo

Rastreador de hábitos diários. A mesma base de código vira três coisas:

- **Site responsivo**: layout de celular (tab bar, bottom sheets) e de computador (barra lateral, duas colunas, diálogos), publicado no GitHub Pages: https://thesousaleo.github.io/Ritmo/
- **APK Android**: gerado pelo Capacitor a cada push e publicado em [Releases](../../releases/latest). Download direto: https://github.com/thesousaleo/Ritmo/releases/latest/download/ritmo.apk
- **Sincronização** entre aparelhos via Supabase (login com e-mail e senha).

## Funções

- **Hoje:** anel do dia, carrossel de dias, check animado, humor do dia, banner de pausa.
- **Tipos de hábito:** construir ou evitar; todo dia, dias fixos ou N vezes por semana (sequência em semanas).
- **Temporizador:** hábitos com duração abrem um timer que marca o hábito sozinho no fim, mesmo com o app fechado.
- **Lembretes:** horário por hábito, com notificação local no APK (repete nos dias programados; para durante pausas).
- **Pausas e férias:** períodos em que nada é cobrado e as sequências ficam congeladas.
- **Detalhe do hábito:** sequência, recorde, taxa, mapa próprio, taxa por dia da semana, marcos e notas.
- **Notas e humor:** nota curta por check-in; humor do dia de 1 a 5; a tela Consistência cruza humor e hábitos.
- **Marcos:** 7, 30, 100 e 365 dias (4, 12, 26 e 52 semanas), com celebração quando acontece.
- **Organizar:** reordenar arrastando, arquivar sem perder histórico, restaurar.
- **Desfazer:** depois de excluir, arquivar, zerar contador ou remover pausa.
- **Exportar:** histórico completo em CSV (separado por ponto e vírgula, abre no Excel).
- **Resumo semanal por e-mail:** domingo às 19h, via Edge Function `weekly-summary` + pg_cron + Resend.

## Resumo semanal por e-mail

A função `supabase/functions/weekly-summary` precisa do segredo `RESEND_API_KEY` (crie uma chave em resend.com). Sem domínio verificado, o Resend só entrega no e-mail da conta do Resend; para mandar para qualquer endereço, verifique um domínio e defina `RESEND_FROM` (por exemplo `Ritmo <resumo@seudominio.com>`).

## Como a sincronização funciona

- O app funciona sem conta. Os dados ficam no aparelho (`localStorage`).
- Ao criar uma conta, os hábitos deste aparelho sobem para ela. Ao entrar numa conta que já tem dados, o aparelho passa a mostrar os dados da conta.
- Cada toque é salvo localmente na hora e enviado em segundo plano. Sem internet, as alterações ficam numa fila e sobem quando a conexão volta.
- Os outros aparelhos recebem as mudanças em tempo real (Supabase Realtime) e também ao voltar para o app.
- Cada pessoa só lê e grava os próprios registros (Row Level Security no Postgres).

Banco: projeto Supabase `Ritmo` (sa-east-1). Tabelas `habits`, `checkins`, `moods` e `profiles`; o esquema está em `supabase/schema.sql`.

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
  App.jsx                 estado, sessão, sincronização, atalhos, Android (voltar, status bar)
  components/
    Today.jsx             tela Hoje: anel segmentado, carrossel de dias, check animado
    Stats.jsx             tela Consistência: heatmap, semana, sequências
    HabitSheet.jsx        criar e editar hábito
    HabitDetail.jsx       detalhe: estatísticas, nota, mapa, dias da semana, marcos
    TimerSheet.jsx        temporizador
    ManageSheet.jsx       reordenar, arquivados, pausas
    Overlays.jsx          aviso com desfazer, celebração de marcos
    AccountSheet.jsx      login, cadastro, nova senha, conta
    Nav.jsx               tab bar (celular) e barra lateral (desktop)
    ui.jsx                tokens de animação, Sheet responsivo, primitivos
  lib/
    habits.js             datas, regras, sequências, dados de exemplo
    sync.js               fila offline + pull/push + realtime
    native.js             lembretes, aviso do timer, exportação, tela acesa
    supabase.js           cliente e mensagens de erro em português
.github/workflows/
  pages.yml               build e publicação no GitHub Pages
  android.yml             build do APK e publicação em Releases
```

## Atalhos no computador

`N` novo hábito · `1` Hoje · `2` Consistência · `Esc` fecha diálogos

## Assinatura do APK

`signing/debug.keystore` é uma chave de assinatura de uso local (senha padrão `android`), mantida no repositório para que cada build use a mesma assinatura e as atualizações instalem por cima. Ela serve para instalação direta, não para a Play Store. Para publicar na loja, crie uma chave de release e guarde-a nos Secrets do repositório.
