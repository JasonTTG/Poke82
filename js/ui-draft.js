// Main-mode draft UI: region/type roll, candidate cards, roster sidebar, needs.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions;

  function sidebar(G, D) {
    const T = G.teams[G.userTeam];
    const picks = T.roster;
    const slots = [];
    for (let i = 0; i < 12; i++) {
      const id = picks[i];
      const m = id ? PB.BYID[id] : null;
      const lbl = i < 5 ? 'S' + (i + 1) : 'B' + (i - 4);
      slots.push(m ? `<div class="slot fill" data-act="inspect" data-id="${m.id}" tabindex="0"><span class="dim" style="width:22px;font-size:11px">${lbl}</span>${UI.spr(m, 40)}<div class="grow"><b>${esc(m.dispName)}</b><div>${UI.vis().P ? UI.posBadges(m) : ''}</div></div>${UI.vis().O ? UI.ovrBadge(m.ovr).replace('class="ovr', 'style="font-size:15px;min-width:32px" class="ovr') : ''}</div>`
        : `<div class="slot ${i === D.pick ? 'sel' : ''}"><span class="dim" style="width:22px;font-size:11px">${lbl}</span><span class="dim">${i === D.pick ? 'on the clock' : 'empty'}</span></div>`);
    }
    const needs = PB.needs(picks);
    return `<div class="panel"><h3>Your roster (${picks.length}/12)</h3><div class="slots">${slots.join('')}</div>
      ${UI.vis().R && needs.length ? '<h3 style="margin-top:12px">Needs</h3>' + needs.map(n => `<div class="need">${n}</div>`).join('') : ''}
      ${picks.length >= 5 ? `<button class="small" style="margin-top:10px" data-act="openLineupFromDraft">Arrange lineup</button>` : ''}</div>`;
  }

  function phaseInfo(D) {
    return D.pick < 5 ? { name: 'Starting Five Draft', n: D.pick + 1, of: 5 } : { name: 'Bench Draft', n: D.pick - 4, of: 7 };
  }

  S.draft = {
    back() { UI.go('menu', {}, true); },
    top() { return `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div><button class="small" data-act="saveDraft">Save</button><button class="small" data-act="goMenu">Menu</button>`; },
    render() {
      const G = PB.G, D = G.draft;
      if (D.phase === 'done') return `<div class="panel center"><h2>Draft complete</h2><button class="primary" data-act="toLineupPost" autofocus>Set lineup & start season</button></div>`;
      const info = phaseInfo(D);
      const strong = D.pick < 5;
      const bias = PB.DRAFT.bias[D.pick];
      let main;
      if (!D.roll) {
        main = `<div class="panel center" style="padding:30px"><h2>Pick ${D.pick + 1} of 12</h2>

          <div class="rollbox"><div class="rollitem"><small>Region</small>?</div><div class="rollitem"><small>Type</small>?</div></div>
          <button class="gold" style="font-size:20px;padding:12px 40px" data-act="roll" autofocus>🎲 ROLL</button></div>`;
      } else {
        const rr = D.rerolls || (D.rerolls = { region: 1, type: 1 });
        const rolling = UI._rolling;
        const cands = D.cands.map(id => PB.BYID[id]);
        main = `<div class="rollbox"><div class="rollitem ${rolling && rolling !== 'type' ? 'rolling' : ''}" id="rl-region"><small>Region</small>${PB.REGIONS[D.roll.gen]}</div><div class="rollitem ${rolling && rolling !== 'region' ? 'rolling' : ''}" id="rl-type" style="border-color:${PB.TYPE_COLORS[D.roll.type]}"><small>Type</small>${PB.cap(D.roll.type)}</div></div>
          ${rolling ? '' : `<div class="row center" style="margin-bottom:12px"><button data-act="reroll" data-w="region" ${rr.region ? '' : 'disabled'}>Reroll region (${rr.region})</button><button data-act="reroll" data-w="type" ${rr.type ? '' : 'disabled'}>Reroll type (${rr.type})</button></div>
          <div class="cards">${cands.map(m => UI.mcard(m, { btn: 'Draft', btnAct: 'draftPick' })).join('')}</div>`}`;
      }
      const MD = G.daily && G.daily.mod && PB.MODS[G.daily.mod];
      return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">${info.name} — Pick ${info.n} of ${info.of}</h2></div>${MD ? `<div class="tag" title="${esc(MD.desc)}">${G.daily.endless ? 'Challenge' : 'Daily modifier'}: <b>${esc(MD.name)}</b> · ${esc(MD.desc)}</div>` : ''}</div>
        <div class="layout2"><div>${main}</div>${sidebar(G, D)}</div>`;
    },
    inspectActions(id) {
      const D = PB.G.draft;
      return D.cands && D.cands.includes(id) ? `<button class="primary" data-act="draftPick" data-id="${id}">Draft ${esc(PB.BYID[id].dispName)}</button>` : '';
    },
  };

  // flicker the region/type boxes, then reveal the (deterministic, already rolled) result and the candidates
  function animateRoll(which, combo) {
    UI._rolling = which; UI.refresh();
    const r = document.getElementById('rl-region'), t = document.getElementById('rl-type');
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (r && which !== 'type') r.innerHTML = '<small>Region</small>' + PB.REGIONS[PB.rng.int(1, 9)];
      if (t && which !== 'region') t.innerHTML = '<small>Type</small>' + PB.cap(PB.rng.pick(PB.TYPES));
      if (n > 11) { clearInterval(iv); UI._rolling = null; if (UI.cur === 'draft') UI.refresh(); }
    }, 70);
  }
  // every roll comes from its own generator seeded by (game seed, pick number, kind), so using a re-roll never shifts later rolls: two players on the same seed see the same roll at each pick
  const pickRng = (G, pick, kind) => { let h = (G.seed >>> 0) ^ Math.imul(pick + 1, 2654435761); for (const c of kind) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return new PB.RNG(h >>> 0); };
  A.roll = () => {
    const G = PB.G, D = G.draft;
    if (D.roll || UI._rolling) return;
    const rng = pickRng(G, D.pick, 'roll');
    const combo = PB.rollCombo(G, rng);
    D.roll = combo; D.cands = PB.genCandidates(G, rng, D.pick, combo.gen, combo.type, undefined, G.userTeam).map(m => m.id);
    animateRoll('both', combo);
  };
  A.reroll = (el, d) => {
    const G = PB.G, D = G.draft;
    const rr = D.rerolls || (D.rerolls = { region: 1, type: 1 });
    if (!D.roll || UI._rolling || !rr[d.w]) return;
    const rng = pickRng(G, D.pick, d.w);
    const combo = PB.rerollCombo(G, rng, D.roll, d.w);
    if (!combo) { PB.toast('No other option'); return; }
    rr[d.w]--;
    D.roll = combo; D.cands = PB.genCandidates(G, rng, D.pick, combo.gen, combo.type, undefined, G.userTeam).map(m => m.id);
    animateRoll(d.w, combo);
  };

  A.draftPick = (el, d) => {
    const G = PB.G, D = G.draft, id = +d.id;
    if (!D.cands || !D.cands.includes(id)) return;
    if (UI.modalOpen()) UI.closeModal();
    if (PB.logPick) PB.logPick(G, 'main', 'main', G.daily ? 'Daily draft' : 'Random draft', { n: D.pick, t: G.userTeam, id, alts: D.cands.filter(x => x !== id) });
    PB.Registry.claim(G, id, G.userTeam);
    D.roll = null; D.cands = null; D.pick++;
    PB.toast('Drafted ' + PB.BYID[id].dispName + '!');
    const T = G.teams[G.userTeam];
    if (D.pick === 5) { PB.autoLineup(T); UI.go('lineup', { ctx: 'postStarters' }); return; }
    if (D.pick > 5) { T.bench = T.roster.filter(x => !T.starters.includes(x)).sort((x, y) => PB.BYID[y].ovr - PB.BYID[x].ovr); }
    if (D.pick >= 12) { D.phase = 'done'; UI.go('lineup', { ctx: 'postDraft' }); return; }
    D.phase = D.pick < 5 ? 'starters' : 'bench';
    UI.refresh();
  };
  A.openLineupFromDraft = () => {
    const G = PB.G, T = G.teams[G.userTeam];
    if (T.roster.length >= 5) { PB.autoLineupPartial(T); UI.go('lineup', { ctx: 'midDraft' }); }
  };
  A.toLineupPost = () => UI.go('lineup', { ctx: 'postDraft' });
  A.saveDraft = () => { const r = PB.Save.save(PB.G, 1); PB.toast(r.ok ? 'Draft saved (slot 1)' : 'Save failed'); };

  // partial roster lineup (during bench draft): starters = best five of current picks
  PB.autoLineupPartial = function (team) {
    const have = team.roster.length;
    if (have >= 12) return PB.autoLineup(team);
    const mons = team.roster.map(id => PB.BYID[id]);
    const first5 = team.starters.length === 5 && team.starters.every(id => team.roster.includes(id));
    if (!first5) {
      const five = mons.slice(0, 5);
      team.starters = PB.bestAssignment(five).map(m => m.id);
    }
    team.bench = team.roster.filter(id => !team.starters.includes(id));
  };
})(window.PB);
