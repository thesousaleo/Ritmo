#!/usr/bin/env bash
# Roda um comando e, se falhar, publica o final da saída como anotação de erro no GitHub Actions.
# Uso: ci/run.sh "Título" comando args...
title="$1"; shift
log=$(mktemp)
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  # Erros de compilação primeiro (Java/Kotlin/Gradle); se não houver, o final da saída
  picked=$(grep -E "error:|^e: |What went wrong|ERROR:" -A4 "$log" | head -n 60)
  [ -z "$picked" ] && picked=$(grep -v '^\s*$' "$log" | tail -n 40)
  body=$(printf '%s\n' "$picked" | sed 's/%/%25/g' | sed ':a;N;$!ba;s/\n/%0A/g' | sed 's/\r//g')
  echo "::error title=${title}::${body}"
fi
exit "$status"
