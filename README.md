# PokéHoops 82

Pokémon basketball: draft Pokémon through random region/type rolls (or a fantasy snake draft), play or simulate an
82-game, 30-team season with best-of-seven playoffs, and chase **82-0 and an undefeated championship**.
Playable 5-on-5 basketball (Xbox controller or keyboard) shares its ratings and rules with the simulation engine.

## Run
No build step, no npm. Needs only a browser (Chrome/Edge recommended for Gamepad API) and Python 3 for a static server:

```
python tools/serve.py        # http://localhost:8082
```

`index.html` can also be opened from a local web server of your choice (ES modules are not used, plain scripts).

## Data
`tools/fetch_data.py` pulls all 1025 species from PokéAPI (stats, types, height, weight, generation, legendary/mythical,
evolution info, sprite) into `data/pokemon.js` and `sprites/*.png` and caches raw responses in `tools/cache/`.
The game reads only the baked local files (fast, offline). One entry per species (the default form), which is also what
guarantees species uniqueness. Re-run the script to refresh.

## Layout
| File | Purpose |
|---|---|
| `js/ratings.js` | Pokémon → basketball ratings, positions, archetypes, overall (all weights in `PB.RCFG`) |
| `js/teams.js` | teams, lineups, chemistry/profile, uniqueness registry |
| `js/draft.js` | region/type roll, weighted starter/bench odds, AI drafting |
| `js/fantasy.js` | shared-pool snake draft |
| `js/sim.js` | possession simulation + `PB.Rules` shared with the playable game |
| `js/league.js` | schedule, standings, stats, playoffs, achievements |
| `js/court.js`, `js/court-ai.js` | playable engine (physics, rules, AI) |
| `js/ui-*.js`, `css/` | menus, draft, hub, game screen/HUD |
| `js/input.js` | keyboard + Gamepad API, menu focus navigation, remapping |
| `tests/*.html` | browser test pages (open via the server, results print on page / console) |

## Controls (defaults)
Offense: Left stick/WASD move · A/J pass · B/U bounce pass · **X/K or Space shoot (hold, release in the green)** · Y/I lob ·
right stick/arrows dribble moves · RB/E + A/B/X/Y icon pass · LB/Q screen · LT/Ctrl post up · RT/Shift sprint.
Defense: A switch · X steal · Y block/rebound · B take charge · right stick help · RB next defender · LB defense scheme · LT stance.
Start/Esc pause. Sticks are camera-relative. Everything is remappable in Settings.

## Display
Only official Pokémon stats are shown by default. Settings → Show toggles basketball ratings, positions, archetypes and overall.
Camera: "2K" (behind the play, default) or "Broadcast" (sideline).

## Tests
`tests/p0.html` ratings sanity, `p1.html` draft, `p2.html` sim consistency, `p3.html` season/playoffs/save,
`p5.html` playable engine (`stress()`, `botGame()`, `bench()`), `p6.html` uniqueness/determinism/save-load regression.
