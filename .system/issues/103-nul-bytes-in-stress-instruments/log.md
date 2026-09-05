
## 2026-09-05 11:00 — Naprawa: perl -pi -e 's/\x00/\\x00/g'; suita 2260/2260. Przyczyna: workerzy Opus piszą separator '\0' przez Write z realnym znakiem. Zapobieganie: test tests/no-nul-bytes.test.mjs skanujący wszystkie *.mjs w plugins/grain — do 102 workera jako dopisek albo osobno.
