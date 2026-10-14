// League codes: a compact, shareable snapshot of a league (standings, leaders, awards, bracket, history) anyone can open read-only.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions, L = PB.League;
  const LC = PB.LeagueCode = {};

  LC.make = function (G) {
    const lg = G.league; if (!lg) throw new Error('Start a season first');
    const lead = (key, n) => L.leaders(G, key, n, false).map(r => [r.id, +r.v.toFixed(3), L.teamOf(G, r.id)]);
    const o = {
      v: 1, mode: G.mode, who: G.userTeam, season: G.fr ? G.fr.year : 1, day: lg.day, phase: lg.phase, games: lg.games, champion: lg.champion,
      teams: G.teams.map(t => [t.name, t.abbr, t.city, t.nick, t.conf, t.div, t.id]),
      rec: lg.rec.map(r => [r.w, r.l, r.pf, r.pa, r.strk]),
      leaders: { ppg: lead('ppg', 8), rpg: lead('rpg', 8), apg: lead('apg', 8), spg: lead('spg', 6), bpg: lead('bpg', 6) },
      single: !!lg.single,
    };
    if (lg.awards) { const a = lg.awards; o.awards = { mvp: a.mvp, dpoy: a.dpoy, roy: a.roy, sixth: a.sixth, scoring: a.scoring, rebounding: a.rebounding, assists: a.assists, playoffMvp: a.playoffMvp, allLeague: a.allLeague, teams: [a.mvp, a.dpoy, a.roy, a.sixth, a.scoring, a.rebounding, a.assists, a.playoffMvp].map(id => id == null ? null : L.teamOf(G, id)) }; }
    if (lg.po) o.po = { single: !!lg.po.single, rounds: lg.po.rounds.map(r => r.map(s => [s.hi, s.lo, s.hiSeed, s.loSeed, s.w[0], s.w[1], s.need || 4])) };
    if (G.fr) o.history = G.fr.history.map(h => [h.y, h.champ, h.mvp, h.rec, h.teams, h.games, h.gens]);
    return o;
  };
  const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = str => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
  const pipe = async (bytes, Ctor, fmt) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new Ctor(fmt))).arrayBuffer());
  LC.encode = async function (obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) { try { return 'PH1z' + b64(await pipe(raw, CompressionStream, 'deflate-raw')); } catch (e) { PB.warn('leaguecode', e); } }
    return 'PH1p' + b64(raw);
  };
  LC.decode = async function (code) {
    code = String(code || '').trim().replace(/^.*#league=/, '');
    if (!/^PH1[zp]/.test(code)) throw new Error('That is not a league code');
    const body = unb64(code.slice(4));
    const raw = code[3] === 'z' ? await pipe(body, DecompressionStream, 'deflate-raw') : body;
    return JSON.parse(new TextDecoder().decode(raw));
  };

  // ---------- viewer ----------
  const view = { tab: 'standings', data: null };
  const mon = id => { const m = PB.BYID[id]; return m ? `${UI.spr(m, 24)} ${esc(m.dispName)}` : '?'; };
  UI.openLeagueCode = function (data) { view.data = data; view.tab = 'standings'; UI.go('lview', {}); };
  S.lview = {
    back() { UI.go('menu', {}, true); },
    render() {
      const d = view.data; if (!d) return '<div class="panel">No league loaded.</div>';
      const T = id => ({ id, name: d.teams[id][0], abbr: d.teams[id][1], city: d.teams[id][2], nick: d.teams[id][3] });
      const lab = id => `<span>${UI.logo(T(id), 16)} ${esc(d.teams[id][0])}</span>`;
      const pct = r => (r[0] + r[1]) ? r[0] / (r[0] + r[1]) : 0;
      const order = d.teams.map((t, i) => i).sort((a, b) => pct(d.rec[b]) - pct(d.rec[a]) || (d.rec[b][2] - d.rec[b][3]) - (d.rec[a][2] - d.rec[a][3]));
      const tabs = [['standings', 'Standings'], ['leaders', 'Leaders'], ['awards', 'Awards'], ['playoffs', 'Playoffs']].concat(d.history ? [['history', 'History']] : []);
      let body = '';
      if (view.tab === 'standings') {
        const tbl = (title, ids) => `<div class="panel"><h3>${title}</h3><table class="t"><thead><tr><th>#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">PCT</th><th class="n">PPG</th><th class="n">OPP</th><th class="n">STRK</th></tr></thead><tbody>${ids.map((id, i) => { const r = d.rec[id], gp = r[0] + r[1]; return `<tr><td class="dim">${i + 1}</td><td>${lab(id)}</td><td class="n">${r[0]}</td><td class="n">${r[1]}</td><td class="n">${gp ? pct(r).toFixed(3).replace(/^0/, '') : '.000'}</td><td class="n">${gp ? (r[2] / gp).toFixed(1) : '-'}</td><td class="n">${gp ? (r[3] / gp).toFixed(1) : '-'}</td><td class="n">${r[4] > 0 ? 'W' + r[4] : r[4] < 0 ? 'L' + -r[4] : '-'}</td></tr>`; }).join('')}</tbody></table></div>`;
        body = d.single ? tbl('League', order) : ['East', 'West'].map(c => tbl(c + 'ern Conference', order.filter(id => d.teams[id][4] === c))).join('');
      } else if (view.tab === 'leaders') {
        const nm = { ppg: 'Points', rpg: 'Rebounds', apg: 'Assists', spg: 'Steals', bpg: 'Blocks' };
        body = `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${Object.keys(d.leaders).map(k => `<div class="panel"><h3>${nm[k]} per game</h3>${d.leaders[k].map((r, i) => `<div class="row between"><span>${i + 1}. ${mon(r[0])} <span class="dim">${esc(d.teams[r[2]][1])}</span></span><b>${(+r[1]).toFixed(1)}</b></div>`).join('') || '<div class="dim">No data.</div>'}</div>`).join('')}</div>`;
      } else if (view.tab === 'awards') {
        const a = d.awards;
        body = a ? `<div class="panel">${[['Most Valuable Pokémon', 0, a.mvp], ['Defensive Player of the Year', 1, a.dpoy], ['Rookie of the Year', 2, a.roy], ['Sixth Pokémon', 3, a.sixth], ['Scoring title', 4, a.scoring], ['Rebounding title', 5, a.rebounding], ['Assists title', 6, a.assists], ['Playoffs MVP', 7, a.playoffMvp]].filter(x => x[2] != null).map(([n, i, id]) => `<div class="row between" style="padding:3px 0"><b>${n}</b><span>${mon(id)} <span class="dim">${a.teams[i] != null ? esc(d.teams[a.teams[i]][1]) : ''}</span></span></div>`).join('')}</div>
          <div class="panel" style="margin-top:10px"><h3>All-League First Team</h3><div class="row wrap">${(a.allLeague[0] || []).map(id => `<span class="tag">${mon(id)}</span>`).join(' ')}</div></div>` : '<div class="panel dim">Awards come out at the end of the season.</div>';
      } else if (view.tab === 'playoffs') {
        const po = d.po;
        body = po ? `<div class="panel"><div class="bracket" style="grid-template-columns:repeat(${po.rounds.length},1fr)">${po.rounds.map((r, i) => `<div><h3>Round ${i + 1}</h3>${r.map(s => `<div class="series"><div class="row between ${s[4] === s[6] ? 'w' : ''}"><span>(${s[2]}) ${lab(s[0])}</span><b>${s[4]}</b></div><div class="row between ${s[5] === s[6] ? 'w' : ''}"><span>(${s[3]}) ${lab(s[1])}</span><b>${s[5]}</b></div></div>`).join('') || '<div class="dim">TBD</div>'}</div>`).join('')}</div></div>` : '<div class="panel dim">The playoffs have not started.</div>';
      } else if (view.tab === 'history') {
        body = `<div class="panel"><table class="t"><thead><tr><th>Season</th><th class="n">Teams</th><th class="n">GP</th><th>Champion</th><th>MVP</th></tr></thead><tbody>${d.history.map(h => `<tr><td>${h[0]}</td><td class="n">${h[4]}</td><td class="n">${h[5]}</td><td>${h[1] != null ? lab(h[1]) : '-'}</td><td>${h[2] != null ? mon(h[2]) : '-'}</td></tr>`).join('')}</tbody></table></div>`;
      }
      return `<div class="row between wrap" style="margin-bottom:8px"><div><h2 style="margin:0">League view <span class="tag">READ ONLY</span></h2><div class="dim">${d.mode === 'franchise' ? 'Franchise · season ' + d.season : d.mode === 'fantasy' ? 'Fantasy league' : 'Random draft league'} · ${d.phase === 'done' ? 'season complete' : d.phase === 'playoffs' ? 'playoffs' : 'day ' + d.day} · ${d.teams.length} teams${d.champion != null ? ' · champion ' + esc(d.teams[d.champion][1]) : ''}</div></div><button data-act="goMenu">Close</button></div>
        <div class="tabs" style="margin-bottom:8px">${tabs.map(([k, l]) => `<button class="${view.tab === k ? 'on' : ''}" data-act="lvTab" data-t="${k}">${l}</button>`).join('')}</div>${body}`;
    },
  };
  A.lvTab = (el, d) => { view.tab = d.t; UI.refresh(); };

  // ---------- entry points ----------
  A.goLeagueCode = () => {
    UI.modal(`<h2>Open a league code</h2><div class="dim" style="margin-bottom:8px">Paste a code or link someone shared with you (it opens read-only: standings, leaders, awards and the bracket).</div><textarea id="lc-in" rows="4" style="width:100%;font:12px monospace;background:var(--bg2);color:var(--ink);border:1px solid var(--line);border-radius:6px" placeholder="PH1z…"></textarea>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="primary" data-act="lcOpen">Open</button><button data-act="closeModal">Cancel</button></div>`);
  };
  A.lcOpen = async () => {
    try { const d = await LC.decode(document.getElementById('lc-in').value); UI.closeModal(); UI.openLeagueCode(d); }
    catch (e) { PB.toast(e.message || 'Could not read that code', 3500); }
  };
  // sharing from the hub's Save / Load tab
  const saveTab = UI.hubTabs.save;
  UI.hubTabs.save = function (G, lg) {
    const html = saveTab(G, lg);
    return html + `<div class="panel" style="max-width:700px;margin-top:12px"><h3>Share this league</h3>
      <div class="row wrap"><button data-act="lcCopy" data-w="code">Copy league code</button><button data-act="lcCopy" data-w="link">Copy link</button></div></div>`;
  };
  A.lcCopy = async (el, d) => {
    try {
      const code = await LC.encode(LC.make(PB.G));
      const text = d.w === 'link' ? location.origin + location.pathname + '#league=' + code : code;
      if (navigator.clipboard) await navigator.clipboard.writeText(text); else throw new Error('no clipboard');
      PB.toast('Copied (' + Math.round(text.length / 1024 * 10) / 10 + ' KB)');
    } catch (e) { PB.toast('Could not copy: ' + e.message, 3500); }
  };
  window.addEventListener('load', () => {
    const m = /#league=(.+)$/.exec(location.hash);
    if (m) LC.decode(m[1]).then(d => { UI.openLeagueCode(d); }).catch(() => PB.toast('That league link is not valid', 3500));
  });
})(window.PB);
