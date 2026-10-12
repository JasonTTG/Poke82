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

## Franchise mode
A league that grows one region at a time. It starts with the unevolved Pokémon of the starting regions (default Kanto + Johto,
122 Pokémon) handed out fairly to 6 teams. Each season:
- the schedule and playoff field scale with the league (default: 6 teams play 37 games and 4 make the playoffs; 16 teams play 82 and 8 make it),
- injuries happen (rare to frequent, or off): hurt Pokémon sit out and the healthiest lineup plays,
- Pokémon earn development from minutes and training (★ focus on the roster tab) and **evolve in the offseason** (branching lines let you choose),
- a new region's unevolved Pokémon form the **draft class**; expansion teams join when the grown pool can fill them (up to the team cap, default 16),
- then free agency (undrafted and released Pokémon) and trades (the AI answers offers and shops your players around),
- the franchise ends when there is no region left to draft.
Everything is configurable on the setup screen: starting region(s), starting teams, team cap, roster limit, games, playoff size, series length, draft rounds, injuries, evolution speed, trade deadline.

## Modes
- **Quick Play** (menu): 5v5 exhibition, 3v3 street ball (half court, 1s and 2s, take it back after a change of possession, first to the target) and Practice (shooting range, or a scrimmage against passive defenders). Build your own team (or roll one), cap legendaries per team, **lock yourself to one Pokémon**, or play **local co-op** with a second gamepad (each player is locked to a different Pokémon).
- **Daily Challenge**: the same draft rolls for everyone that day, a short season, and a result code to share.
- **Pokédex & Compare**, and **League codes** (hub → Save / Load → Share): a read-only snapshot anyone can open from the menu or a link.

## Gameplay
- **Abilities are badges.** Every Pokémon rolls one of its real abilities (seeded; the hidden one rolls less often) and each grants a boost in a scenario (Clutch, Sniper, Rim Guard, Heat Check, Engine…). Evolutions keep their ability when the new form can have it.
- Hot and cold streaks (🔥 / ❄), alley-oops (also set up by the AI), euro steps, post moves (LT, then right stick: drop step, hook, spin, fadeaway), hand-in-face contests (hold X), deny the pass (hold RB), box-outs (hold LT on rebounds) and timeouts (pause menu; the AI calls them too).
- Shot-meter skins (bar, ring, line, orb) and colors, instant replays and highlights (Tab / View after a big play, or the pause menu), shot charts and a fuller box score (efficiency, team comparison).
- Team logos everywhere, position-fit panels, regional forms (Alolan, Galarian, Hisuian, Paldean) as extra Pokémon in their region's pool.
- Phones and tablets: responsive layout and on-screen controls (floating stick, drag anywhere on the right for dribble moves, action buttons).

## Franchise extras
In-season evolution, hidden talent variance (and a changing form each season) with scouting before the draft, a draft lottery and tradable draft picks (draft-day trades), rookies and Rookie of the Year, an awards ceremony, a league rules menu (legendary cap, playoff size, series length, games, roster limit, injuries, variance, deadline), and all-time league records and career leaders.

## Online play
Choose **Play Online**, host a room and share the 4-letter code. Nothing to install or run: the host browser acts as the room, and a free public PeerJS matchmaking service (WebRTC, loaded from unpkg, internet needed) introduces the browsers. Strict networks can block peer-to-peer connections.
- **Exhibition**: a live 5-on-5 between two people. Both browsers run the identical match (lockstep) and exchange controller input; either player can pause and substitute.
- **Co-op vs AI**: two people on one team, each locked to a Pokémon.
- **Franchise league** and **Fantasy draft league**: several people each run a team. The host advances the calendar and ordered operations are applied on every client; human-vs-human games can be played live or simulated, and trades between people are offers the other person accepts. The host can save and resume a league (browser storage or a file). A player who drops out can walk back in (Rejoin on the Play Online screen, or automatically), and gets their team and the current league back.
To put the game online for free, upload this folder to any static host (GitHub Pages, Cloudflare Pages, Netlify) and share the link.

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
| `js/franchise.js` | franchise mode: growth, draft, evolution, injuries, free agency, trades |
| `js/ops.js`, `js/net.js` | shared-state operations and the online (WebSocket) client |
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
`p5.html` playable engine (`stress()`, `botGame()`, `bench()`), `p6.html` uniqueness/determinism/save-load regression,
`p9.html` abilities / modes, `p7.html` franchise (whole multi-season runs, trades, injuries, evolution, determinism), `p8.html` two real clients side by side for online testing (`T.connect`, `T.key`).
