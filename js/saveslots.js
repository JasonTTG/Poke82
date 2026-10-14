// Save slot manager: eight slots with names, details, rename, copy, export / import (a file you can keep or send), delete. Slot 1 stays the autosave.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = PB.Save, A = UI.actions;
  const N = S.SLOTS = 8;
  const KEY = n => 'poke82_save_' + n;
  const metaKey = n => KEY(n) + '_meta';
  const readMeta = n => { try { return JSON.parse(localStorage.getItem(metaKey(n))); } catch (e) { return null; } };
  const putMeta = (n, m) => localStorage.setItem(metaKey(n), JSON.stringify(m));
  S.size = n => { try { return (localStorage.getItem(KEY(n)) || '').length; } catch (e) { return 0; } };

  // keep a slot's name when it is saved over, and note when it was last loaded
  const origSave = S.save;
  S.save = function (G, slot) {
    slot = slot || 1;
    const old = readMeta(slot), r = origSave.call(S, G, slot);
    if (r.ok) { const m = readMeta(slot) || {}; if (old && old.name) m.name = old.name; try { putMeta(slot, m); } catch (e) { PB.warn('saveslots', e); } }
    return r;
  };
  const origLoad = S.load;
  S.load = function (slot) {
    const G = origLoad.call(S, slot);
    if (G) { const m = readMeta(slot || 1); if (m) { m.played = Date.now(); try { putMeta(slot || 1, m); } catch (e) { PB.warn('saveslots', e); } } }
    return G;
  };
  S.rename = (n, name) => { const m = readMeta(n); if (!m) return false; m.name = String(name || '').trim().slice(0, 30); putMeta(n, m); return true; };
  S.copy = (from, to) => {
    const str = localStorage.getItem(KEY(from)), m = readMeta(from); if (!str || !m) return false;
    try { localStorage.setItem(KEY(to), str); putMeta(to, Object.assign({}, m, { name: m.name ? m.name + ' (copy)' : '', t: Date.now() })); return true; } catch (e) { return false; }
  };
  S.exportText = n => { const str = localStorage.getItem(KEY(n)), m = readMeta(n); if (!str || !m) return null; return JSON.stringify({ kind: 'poke82-save', v: 1, meta: m, data: str }); };
  S.importText = (txt, to) => {
    const o = JSON.parse(txt);
    if (!o || o.kind !== 'poke82-save' || typeof o.data !== 'string' || !o.meta) throw new Error('That file is not a PokéHoops save');
    const G = S.deserialize(o.data); S.relink(G);         // throws on a corrupt league
    localStorage.setItem(KEY(to), o.data); putMeta(to, Object.assign({}, o.meta, { t: Date.now(), name: o.meta.name || 'Imported' }));
  };
  S.recent = k => { const a = []; for (let n = 1; n <= N; n++) { const m = readMeta(n); if (m) a.push({ n, m }); } return a.sort((x, y) => (y.m.played || y.m.t) - (x.m.played || x.m.t)).slice(0, k); };

  // ---------- UI ----------
  const modeName = m => m.mode === 'fantasy' ? 'Fantasy' : m.mode === 'franchise' ? 'Franchise' : 'Main';
  const kb = n => { const b = S.size(n); return b ? Math.round(b / 1024) + ' KB' : ''; };
  const usage = () => { let t = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); t += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { PB.warn('saveslots', e); } return t * 2; };   // UTF-16, about 5 MB budget
  UI.saveManagerHtml = function (ctx) {
    const inGame = ctx === 'game';
    const rows = []; for (let n = 1; n <= N; n++) {
      const m = readMeta(n);
      rows.push(m ? `<div class="panel row between wrap" style="gap:8px;padding:8px 12px"><div style="min-width:230px;flex:1"><b>${n}${n === 1 ? ' · autosave' : ''}${m.name ? ' · ' + esc(m.name) : ''}</b><div class="dim" style="font-size:12px">${esc(m.team || '')} · ${modeName(m)}${m.year ? ' S' + m.year : ''} · ${esc(m.phase || '')} ${esc(m.rec || '')}</div><div class="dim" style="font-size:11px">Saved ${new Date(m.t).toLocaleString()}${m.played ? ' · played ' + new Date(m.played).toLocaleDateString() : ''} · ${kb(n)}</div></div>
        <div class="row wrap"><button class="small ${inGame ? '' : 'primary'}" data-act="loadSlot" data-slot="${n}">Load</button>${inGame ? `<button class="small" data-act="doSave" data-slot="${n}">Save here</button>` : ''}<button class="small" data-act="svRename" data-n="${n}">Rename</button><button class="small" data-act="svCopy" data-n="${n}">Copy</button><button class="small" data-act="svExport" data-n="${n}">Export</button><button class="small" data-act="svDelete" data-n="${n}">Delete</button></div></div>`
        : `<div class="panel row between wrap" style="gap:8px;padding:8px 12px;opacity:.85"><div><b>${n}${n === 1 ? ' · autosave' : ''}</b> <span class="dim">Empty</span></div><div class="row wrap">${inGame ? `<button class="small" data-act="doSave" data-slot="${n}">Save here</button>` : ''}<button class="small" data-act="svImport" data-n="${n}">Import file…</button></div></div>`);
    }
    const u = usage(), pct = Math.min(100, Math.round(u / 5242880 * 100));
    return `<div class="col" style="gap:6px;max-width:760px"><div class="row between wrap"><div class="dim" style="font-size:12px">Browser storage used: about ${(u / 1048576).toFixed(1)} MB of ~5 MB (${pct}%). Export a save to keep a copy outside the browser.</div><button class="small" data-act="svImport" data-n="0">Import file…</button></div>${rows.join('')}<input type="file" id="sv-file" accept=".json,application/json" style="display:none"></div>`;
  };
  const slotSelect = (id, skip) => `<select id="${id}">${Array.from({ length: N }, (_, i) => i + 1).filter(n => n !== skip).map(n => { const m = readMeta(n); return `<option value="${n}">${n}${n === 1 ? ' (autosave)' : ''} — ${m ? 'overwrite: ' + esc(m.name || m.team || 'save') : 'empty'}</option>`; }).join('')}</select>`;
  const refresh = () => { if (UI.cur === 'saves' || UI.cur === 'hub' || UI.cur === 'menu') UI.refresh(); };
  A.svRename = (el, d) => { const m = readMeta(+d.n) || {}; UI.modal(`<h2>Rename save ${d.n}</h2><input type="text" id="sv-name" value="${esc(m.name || '')}" maxlength="30" placeholder="${esc(m.team || 'Name')}" style="width:100%"><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="primary" data-act="svRenameOk" data-n="${d.n}" autofocus>Save</button><button data-act="closeModal">Cancel</button></div>`); };
  A.svRenameOk = (el, d) => { S.rename(+d.n, document.getElementById('sv-name').value); UI.closeModal(); refresh(); };
  A.svCopy = (el, d) => UI.modal(`<h2>Copy save ${d.n}</h2><div class="dim" style="margin-bottom:8px">Choose where the copy goes.</div>${slotSelect('sv-to', +d.n)}<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="primary" data-act="svCopyOk" data-n="${d.n}" autofocus>Copy</button><button data-act="closeModal">Cancel</button></div>`);
  A.svCopyOk = (el, d) => { const ok = S.copy(+d.n, +document.getElementById('sv-to').value); UI.closeModal(); PB.toast(ok ? 'Copied' : 'Could not copy (storage may be full)', 3000); refresh(); };
  A.svDelete = (el, d) => UI.modal(`<h2>Delete save ${d.n}?</h2><div class="dim">This cannot be undone. Export it first if you might want it back.</div><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="primary" data-act="svDeleteOk" data-n="${d.n}">Delete</button><button data-act="closeModal" autofocus>Keep it</button></div>`);
  A.svDeleteOk = (el, d) => { S.remove(+d.n); UI.closeModal(); refresh(); };
  A.svExport = (el, d) => {
    const t = S.exportText(+d.n); if (!t) return PB.toast('Nothing to export');
    const m = readMeta(+d.n), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'application/json' }));
    a.download = 'pokehoops-' + (m.name || m.team || 'save').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  A.svImport = (el, d) => {
    const input = document.getElementById('sv-file'); if (!input) return;
    input.onchange = () => {
      const f = input.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = () => {
        let to = +d.n;
        const go = slot => { try { S.importText(rd.result, slot); PB.toast('Imported into slot ' + slot); } catch (e) { PB.toast('Import failed: ' + e.message, 4000); } input.value = ''; UI.closeModal(); refresh(); };
        if (to) { go(to); return; }
        UI.modal(`<h2>Import a save</h2><div class="dim" style="margin-bottom:8px">${esc(f.name)}</div>${slotSelect('sv-into', 0)}<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="primary" data-act="svImportOk" autofocus>Import</button><button data-act="closeModal">Cancel</button></div>`);
        A.svImportOk = () => go(+document.getElementById('sv-into').value);
      };
      rd.readAsText(f);
    };
    input.click();
  };
  A.goSaves = () => UI.go('saves');
  UI.screens.saves = { back() { UI.go('menu', {}, true); }, render() { return `<div class="panel" style="max-width:800px;margin:16px auto"><h2>Saved games</h2>${UI.saveManagerHtml('menu')}<div class="row" style="margin-top:12px"><button data-act="goMenu">Back</button></div></div>`; } };

  // the in-game Save / Load tab uses the manager too
  UI.hubTabs.save = function (G) {
    if (PB.Net && PB.Net.onlineLeague && PB.Net.onlineLeague()) return UI.onlineSaveTab(G, G.league);
    return `${UI.saveManagerHtml('game')}<div class="col" style="max-width:760px;margin-top:8px"><div class="dim" style="font-size:12px">Seed ${G.seed}</div><label><input type="checkbox" ${G.settings.autosave === false ? '' : 'checked'} data-change="toggleAuto"> Autosave to slot 1 after each game / sim</label></div>`;
  };
})(window.PB);
