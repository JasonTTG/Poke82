# PokéHoops 82

Pokémon basketball: draft Pokémon through random region/type rolls (or a fantasy snake draft), play or simulate an
82-game, 30-team season with best-of-seven playoffs, and chase **82-0 and an undefeated championship**.
Playable 5-on-5 basketball (Xbox controller or keyboard) shares its ratings and rules with the simulation engine.

## Run
No build step, no npm. Needs only a browser (Chrome/Edge recommended for Gamepad API) and Python 3 for a static server:

```
python tools/serve.py        # a local static server (no-cache) at http://localhost:8082; online play does not need it
```

`index.html` can also be opened from a local web server of your choice (ES modules are not used, plain scripts).

## Franchise mode
A league of unevolved Pokémon that develop and evolve. The default setup is **16 teams in two conferences, 15-Pokémon rosters, a season that scales with the league (16 teams play 34 games, 30 teams 64) and 8 playoff teams (the top 4 of each conference)**, with no expansion (the team cap equals the starting teams unless you raise it).
- **Mixed generations (default pool)**: the starting league and every draft class come from a random list of unevolved Pokémon of *every* generation. Legendaries and mythicals are limited (default one per team, capped by the legendary rule) and every draft class has the same number of them. A **classic** pool (one region at a time) is still available on the setup screen.
- **Drafts**: 2 rounds plus a few extra prospects (default 8) that become free agents, so teams can cover injuries. Draft classes are fixed as soon as a season starts.
- **Draft lottery**: the teams that miss the playoffs enter an animated lottery for the top picks; you can rewatch it from the draft screen.
- **Picks as assets**: trade draft picks (this year's and the next two) and attach **protections** (top 3 / 5 / 10): a protected pick that lands in its range stays with its original team and the new owner gets that team's next pick instead.
- **Scouting all season**: the Scouting tab shows next year's class (ratings stay hidden); spend your season's scouting points on grades for hidden talent and ceiling.
- You can only draft when you are on the clock.
- Each season the schedule scales with the league, injuries happen (rare to frequent, or off), Pokémon earn development and **evolve** (branching lines let you choose), then free agency and trades (the AI answers offers and shops your players around).
- The franchise ends when no full draft class is left. With the default setup that is **7 seasons** (the starting league plus 6 draft classes of 40); the setup screen shows how long the league you configured can run.
Everything is configurable on the setup screen: pool, teams and team cap, roster limit, conferences, games, playoff size, series length, draft rounds, extra prospects, legends per class and per team, injuries, evolution speed, variance, trade deadline.

## Modes
- **Quick Play** (menu): 5v5 exhibition, 3v3 street ball (half court, 1s and 2s, take it back after a change of possession, first to the target) and Practice (shooting range, or a scrimmage against passive defenders). Build your own team (or roll one), cap legendaries per team, **lock yourself to one Pokémon**, or play **local co-op** with a second gamepad (each player is locked to a different Pokémon).
- **Daily Challenge** (the menu's centerpiece): one attempt per UTC day. Everyone gets the same 30-team draft rolls (some days with a modifier such as *No legendaries*, *One legend*, *Role players*, *Before Galar*, *Hoenn and later*). You only draft: your 82 games and the playoffs then play out on screen, with a live W-L chart, then you get a result code and a team card to share. **Endless Draft** is the same thing with no daily limit: you pick one of the challenges (or none), optionally hide the suggested positions, and can enter a seed to draft the same rolls as a friend; your recent runs are listed.
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

## Added in the latest round
- **League hub**: Power Rankings (weekly, with movement and your trend line), Grades (every Pokémon's time with each team is tracked; picks are graded on what the player actually produced for the drafting team, trades only on what each asset did for the team that received it, with draft picks followed to the player taken, bar charts of every asset's contribution, a running-value line chart and a GM grade), Advanced stats (PER, TS%, USG%, AST%, REB%, WS estimate, sortable), Shot Charts (season heat maps per player / team / shots allowed / league, real locations for games you play, estimated for simulated ones), Record Book (single game, season, team and career records, with a toast when one falls), Season Report (finish, playoff run, performers, awards, moments, moves, season grade, copyable text and team card). Franchise adds **natures** (stable per Pokémon line, +/- rating tilts, a rule you can switch off).
- **Career pages**: click a Pokémon, then Career: season by season stats, honors, career highs, all-time rank, evolution history.
- **Fouls**: foul counts on the court, foul trouble messages, fouling out, team bonus, and late-game intentional fouls by the trailing team (both in live play and in simulation). No technical fouls.
- **Positions** are balanced (primary positions are about 19/21/22/20/18% PG/SG/SF/PF/C) and overall is normalised within position so bigs are not automatically the best Pokémon.
- **Team customization** (roster tab): logo shape and symbol, jersey colors and court paint; online leagues see each other's looks. **Team card**: a PNG of your lineup to download or copy.
- **Save slots**: eight, with names, details, rename, copy, export / import files and delete (menu → Manage saves, or the hub's Save / Load tab). Slot 1 is the autosave.
- **Sound**: menu music (generated), crowd noise in games, sound effects; separate master, effects and music sliders and mutes in Settings.
- **Phones**: portrait layout for every menu and the hub; games stay landscape (a rotate prompt shows in portrait). On-screen buttons use icons and words, and change depending on whether you have the ball (shoot / pass / lob / post up...), are off the ball (call for the ball), or defend (steal / switch / block / box out / deny pass...).
- **Spectating** (Play Online screens: enter the room code, then *Watch*): follow a live match (you can join mid-game and catch up) or a franchise / fantasy league read-only; the host sees how many are watching.

## Latest additions
- **Awards**: All-League / MVP ballots need a real rotation player (minutes floor), a thin position can no longer inflate a player, and an All-League slot only goes to a player who ranks near the top overall. Added All-Rookie teams, MVP vote shares and an **Award Counts** page (every honor each Pokémon has won, all-time, plus championships by team).
- **Grades**: draft grades follow the player's whole career with the team that drafted him (production above a bench player, honors, and a projection that fades as games are played) against similar picks in the same class; trade grades count only the time a player or pick-draftee spent with the new team; the season grade is out of 100 with a visible breakdown (record, playoffs, vs. expectation).
- **More stats**: Milestones tab (double-doubles, triple-doubles, 20/30/40-point games, 15+ rebounds, 10+ assists, 5+ steals / blocks / threes, foul-outs, season and career), team splits (home, away, close, blowouts, overtime, vs. winning teams) and your team's record with each player in the lineup.
- **Fouls**: coaches sit players in foul trouble by quarter and score; in live games a player in trouble can play it safe (fewer fouls, softer defense) or be ridden hard; late-game fouling can be switched on from the pause menu; fouls show on the sub screen.
- **Badges and fatigue you can see**: a pop-up rises over a player when an ability changes a play, the controlled player's badge shows under his name, the pause and tip-off screens list badges; tired players slow down, stoop and sweat, get a pulsing energy bar, "TIRED" tag and an energy strip.
- **Performance settings**: graphics detail (high / medium / low), resolution scale and a frame-rate limit, with presets, plus a quick Graphics button in the pause menu.
- Daily and Endless runs keep their lineup, so a team card can be made any time from the run history. Draft re-rolls no longer change what the next roll is for a given seed.

## Reliability, accessibility and housekeeping
- **Online**: connections retry and use a TURN relay fallback; guests see a latency pill and a "connection lost" banner; if the host disappears any player can host the league from their own copy or save it to a file; Settings and the online screen have **Copy problem report** (recent connection events and errors).
- **Offers and injuries**: AI teams send trade offers during the season; a rejected trade suggests what to add or drop; injuries show recovery progress, an expected return date and can suffer setbacks.
- **Games**: foul-trouble banner for your players, box-out callouts on rebounds, more blocks and steals; **Auto strategy** shows every offense and defense tried with its margin of error.
- **Accessibility**: colorblind palette, text size, reduced-motion support, button roles and labels.
- **Hosting**: sprites are packed into a few sheets (`python tools/fetch_data.py` downloads the single sprite files, then `python tools/build_atlas.py` rebuilds `sprites/atlas/` and `data/atlas.js`; the single files are not kept in the repo); a service worker (`sw.js`) and web manifest let the game be installed and run offline; `vercel.json` sets long cache lifetimes for sprites.
- **Stats**: one Stats tab with a row of views (Leaders, Players, Team stats, Advanced, Milestones) and a Playoffs toggle that applies to all of them; Shot Charts stays its own tab.
- **Code**: league hooks (`PB.League.hooks.beforeRecord / afterRecord / afterFinish`) replace function wrapping; one `PB.gameScore`; graphics split out of `ui-game.js` into `game-gfx.js`, extra match rules into `court-rules.js`; errors are logged by `PB.warn` / `PB.Diag` instead of being swallowed.

## Data
`tools/fetch_data.py` (and `fetch_extras.py` for abilities and regional forms) pull all species from PokéAPI (stats, types, height, weight, generation, legendary/mythical,
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
| `js/ops.js`, `js/net.js` | shared-state operations and the online (peer-to-peer) client, spectators |
| `js/hub2.js`, `grades.js`, `advstats.js`, `career.js`, `shotzones.js`, `recordbook.js`, `seasonreport.js`, `natures.js` | league hub extras (power rankings, grades, advanced stats, careers, shot charts, records, season report, natures) |
| `js/teamcard.js`, `teamlook.js`, `saveslots.js`, `audio.js`, `touch.js` | team card / customization, save slots, sound, on-screen controls |
| `js/court.js`, `js/court-ai.js` | playable engine (physics, rules, AI) |
| `js/ui-*.js` (franchise: `ui-franchise*.js`, the lottery and scouting are in `ui-franchise3.js`), `css/` | menus, draft, hub, game screen/HUD |
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
`tests/p5.html` playable engine (`stress()`, `botGame()`, `bench()`), `p6.html` uniqueness/determinism/save-load regression,
`p9.html` abilities / modes, `p12.html` franchise defaults (mixed pool, conferences, classes, protected picks, scouting, how many seasons a league runs), `p10.html` positions, daily modifiers, fouls, grades, natures, advanced stats, career, shot zones, record book, team looks, `p11.html` three clients (host, guest, spectator) for spectator mode, `p13.html` grades (stints, picks, trades, season grade), `p14.html` live engine (inbounder, badge pop-ups, foul rules, late fouls), `mvp.html` MVP spread over many simulated seasons, `p7.html` franchise (whole multi-season runs, trades, injuries, evolution, determinism), `p8.html` two real clients side by side for online testing (`T.connect`, `T.key`).
