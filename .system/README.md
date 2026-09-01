# .system — stan systemu pracy nad Grainem

Ten katalog jest **stanem** modelu pracy opisanego w skillu `.claude/skills/director/` (tożsamość dyrektora,
pełny model, narzędzia). Skill mówi *jak*; ten katalog mówi *co jest teraz*. Jest **commitowany** — to jest to,
co czyni handoff między sesjami i maszynami prawdziwym. `.temp/` pozostaje wyłącznie scratchem (artefakty
stresowe, klony, sondy) i jest gitignorowany.

| ścieżka | co | mutuje |
|---|---|---|
| `issues/NNN-slug/issue.md`, `log.md` | tickety (status w linii 3) i dzienniki pracy | `tk.mjs` |
| `queue.json` (+ `queue.md` renderowane) | kolejka toru 1 | `queue.mjs` |
| `handoff.json` (+ `handoff.md`) | stan intencji między sesjami: w locie, decyzje w toku, na kogo czekamy, następne kroki | `handoff.mjs` |
| `escalations.json` (+ `escalations.md`) | kanał lead → dyrektor (lista eskalacji §6) | `escalate.mjs` |
| `decisions.md` | rozstrzygnięcia i lekcje — **czytane przed każdą decyzją o silniku** | `decide.mjs`, `escalate rule` |
| `plan.md` | dziennik fal: start, merge, audyty, zamknięcie z wersjami | `wave.mjs` |
| `research/` | dokumenty toru 2 (katalog pytań G, projekt dźwigni `where`) | projektanci Opus |
| `cache/` | gitignorowane: `last-suite.json` i inne pochodne | narzędzia |

**Zasada:** żaden plik tutaj nie jest pisany ręcznie. Ręczny zapis omija normalizację, rendering i dziennik — i
psuje handoff. Jeśli narzędzia brakuje, dopisz je do skilla, nie obchodź go.
