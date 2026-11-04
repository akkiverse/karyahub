// The business's own item details (CR-0013): its fields, the entries of its pick-lists and its units, on one screen.
// The owner adds fields at the start or later; staff who manage inventory add list entries and units.
import { icon } from '../ui/icons.js';
import { escapeHtml } from '../format.js';
import { isSynced } from '../ids.js';
import { UNIT_NAMES, BUILT_IN_UNIT_IDS } from '../domain/inventory.js';
import { FIELD_TYPES, MAX_FIELDS, STARTER_FIELDS, fieldsOf, activeFields, entriesOf } from '../domain/fields.js';

const e = escapeHtml;
const err = (m, k) => (m && m[k] ? `<span class="field-error" id="err-${k}">${e(m[k])}</span>` : '');
const bad = (m, k) => (m && m[k] ? `aria-invalid="true" aria-describedby="err-${k}"` : '');
const FLAGS = [['required', 'Needed on every item'], ['in_list', 'Show in the item list'], ['in_filter', 'Filter by it (pick-lists)'], ['on_bills', 'Print on bills']];

function noticeHtml(ui) {
  const n = ui.fields && ui.fields.notice;
  return n ? `<p class="notice ${n.error ? 'notice-error' : ''}" role="${n.error ? 'alert' : 'status'}" tabindex="-1" data-testid="fields-notice">${icon(n.error ? 'alert' : 'check', { size: 18 })}<span>${e(n.text)}</span></p>` : '';
}

function fieldForm(state, ui, allow) {
  const f = ui.fields || {};
  const editing = f.editing ? (state.item_fields || []).find((x) => x.id === f.editing) : null;
  const v = f.values || (editing ? { name: editing.name, type: editing.type, required: editing.required, in_list: editing.in_list, in_filter: editing.in_filter, on_bills: editing.on_bills } : { type: 'list' });
  const errors = f.errors || {};
  return `<form class="panel field-form" data-form="inv-field" data-field="${e(editing ? editing.id : '')}" novalidate>
    <h3>${editing ? `Change ${e(editing.name)}` : 'Add a detail'}</h3>
    <div class="form-grid">
      <label class="field">Name<input name="name" value="${e(v.name ?? '')}" placeholder="for example Brand or Size" ${bad(errors, 'name')} autocomplete="off" data-testid="field-name">${err(errors, 'name')}</label>
      <label class="field">Kind<select name="type" ${bad(errors, 'type')} data-testid="field-type">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${err(errors, 'type')}</label>
    </div>
    <p class="muted small">Pick-list: choose from a list that you build (brands, colours). Text and number: type it for each item.</p>
    <div class="check-row">${FLAGS.map(([k, l]) => `<label class="check-line"><input type="checkbox" name="${k}" ${v[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="actions">${editing ? '<button type="button" class="btn btn-ghost" data-action="inv-field-cancel">Cancel</button>' : ''}<button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Add detail'}</button></div>
  </form>`;
}

function fieldsPanel(state, ui, allow, me) {
  const manage = allow('manage_settings');
  const all = fieldsOf(state);
  const used = activeFields(state).length;
  const kind = (me && me.business && me.business.business_type) || '';
  const starters = (STARTER_FIELDS[kind] || STARTER_FIELDS.other).filter(([n]) => !all.some((x) => x.name.toLowerCase() === n.toLowerCase()));
  const rows = all.map((x) => `<tr class="${x.stopped ? 'is-stopped' : ''}" data-field="${e(x.id)}">
      <td><strong>${e(x.name)}</strong>${x.stopped ? ' <span class="tag tag-past">Stopped</span>' : ''}<br><span class="muted small">${[FIELD_TYPES[x.type], x.required && 'Needed', x.in_list && 'In list', x.in_filter && 'Filter', x.on_bills && 'On bills'].filter(Boolean).join(' · ')}</span></td>
      <td class="num">${manage ? `<button type="button" class="btn btn-ghost btn-small" data-action="inv-field-edit" data-id="${e(x.id)}">${icon('pencil', { size: 16 })} Change</button>
        <button type="button" class="btn btn-ghost btn-small" data-action="inv-field-stop" data-id="${e(x.id)}" data-stopped="${x.stopped ? 'false' : 'true'}">${x.stopped ? 'Use again' : 'Stop using'}</button>` : ''}</td></tr>`).join('');
  return `<div class="panel" aria-labelledby="h-fields">
    <div class="panel-head"><h2 class="panel-title" id="h-fields">Item details</h2><span class="muted small">${used} of ${MAX_FIELDS} in use</span></div>
    ${all.length ? `<div class="table-wrap"><table class="table" data-testid="fields-table"><thead><tr><th scope="col">Detail, kind and where it shows</th><th scope="col"><span class="sr-label">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p class="muted">No details yet. Fixed on every item: name, code, unit, prices, HSN, GST and stock. Add the rest your business needs, such as Brand, Size or Colour.</p>'}
    ${manage && !all.length && starters.length ? `<div class="starters" data-testid="starters"><p class="small"><strong>Suggested to start:</strong> ${starters.map(([n, t]) => `${e(n)} (${FIELD_TYPES[t].toLowerCase()})`).join(', ')}.</p><button type="button" class="btn btn-secondary" data-action="inv-field-starters">${icon('plus', { size: 18 })} Add these ${starters.length}</button></div>` : ''}
    ${manage ? '' : `<p class="notice">${icon('shield', { size: 18 })}<span>Only the owner changes which details items have. You can add brands and units below.</span></p>`}
  </div>${manage ? fieldForm(state, ui, allow) : ''}`;
}

function entryRow(state, ui, ent, manage) {
  const renaming = ui.fields && ui.fields.renaming === ent.id;
  if (renaming && manage) {
    const m = ui.fields.errors || {};
    return `<li class="entry"><form class="entry-form" data-form="inv-entry-rename" data-id="${e(ent.id)}" novalidate><label class="sr-label" for="rn-${e(ent.id)}">New name</label><input id="rn-${e(ent.id)}" name="name" value="${e(ui.fields.values?.name ?? ent.name)}" data-autofocus ${bad(m, 'name')}>${err(m, 'name')}<button type="submit" class="btn btn-primary btn-small">Save</button><button type="button" class="btn btn-ghost btn-small" data-action="inv-entry-cancel">Cancel</button></form></li>`;
  }
  return `<li class="entry ${ent.stopped ? 'is-stopped' : ''}" data-entry="${e(ent.id)}"><span>${e(ent.name)}${ent.stopped ? ' <span class="tag tag-past">Stopped</span>' : ''}</span>${manage ? `<span class="entry-actions"><button type="button" class="btn btn-ghost btn-small" data-action="inv-entry-rename" data-id="${e(ent.id)}">Rename</button><button type="button" class="btn btn-ghost btn-small" data-action="inv-entry-stop" data-id="${e(ent.id)}" data-stopped="${ent.stopped ? 'false' : 'true'}">${ent.stopped ? 'Use again' : 'Stop'}</button></span>` : ''}</li>`;
}

function listPanel(state, ui, field, manage) {
  const list = entriesOf(state, field.id);
  const add = ui.fields && ui.fields.addTo === field.id ? ui.fields : {};
  return `<div class="panel" aria-labelledby="h-${e(field.id)}" data-list="${e(field.id)}">
    <div class="panel-head"><h2 class="panel-title" id="h-${e(field.id)}">${e(field.name)} list</h2><span class="muted small">${list.length} ${list.length === 1 ? 'entry' : 'entries'}</span></div>
    ${list.length ? `<ul class="entries" data-testid="entries-${e(field.id)}">${list.map((x) => entryRow(state, ui, x, manage)).join('')}</ul>` : `<p class="muted">Nothing in this list yet.</p>`}
    ${manage ? `<form class="inline-add" data-form="inv-entry" data-field="${e(field.id)}" novalidate><label class="field">Add to ${e(field.name)}<input name="name" value="${e(add.values?.name ?? '')}" placeholder="for example Polycab" autocomplete="off" ${bad(add.errors, 'name')}>${err(add.errors, 'name')}</label><button type="submit" class="btn btn-secondary">${icon('plus', { size: 18 })} Add</button></form>` : ''}
  </div>`;
}

function unitsPanel(state, ui, manage) {
  const own = (state.units || []).filter((u) => !u.alias_of).slice().sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));
  const f = ui.fields || {};
  const add = f.addUnit ? f : {};
  const rows = own.map((u) => {
    if (f.renamingUnit === u.id && manage) {
      return `<li class="entry"><form class="entry-form" data-form="inv-unit-change" data-id="${e(u.id)}" novalidate><label class="sr-label" for="un-${e(u.id)}">Unit name</label><input id="un-${e(u.id)}" name="name" value="${e(f.values?.name ?? u.name)}" maxlength="12" data-autofocus ${bad(f.errors, 'name')}>${err(f.errors, 'name')}<label class="check-line"><input type="checkbox" name="whole" ${(f.values ? f.values.whole : u.whole) ? 'checked' : ''}> Whole numbers only</label><button type="submit" class="btn btn-primary btn-small">Save</button><button type="button" class="btn btn-ghost btn-small" data-action="inv-entry-cancel">Cancel</button></form></li>`;
    }
    return `<li class="entry ${u.stopped ? 'is-stopped' : ''}" data-unit="${e(u.id)}"><span>${e(u.name)} <span class="muted small">${u.whole ? 'whole numbers' : 'decimals allowed'}</span>${u.stopped ? ' <span class="tag tag-past">Stopped</span>' : ''}</span>${manage ? `<span class="entry-actions"><button type="button" class="btn btn-ghost btn-small" data-action="inv-unit-change" data-id="${e(u.id)}">Change</button><button type="button" class="btn btn-ghost btn-small" data-action="inv-unit-stop" data-id="${e(u.id)}" data-stopped="${u.stopped ? 'false' : 'true'}">${u.stopped ? 'Use again' : 'Stop'}</button></span>` : ''}</li>`;
  }).join('');
  return `<div class="panel" aria-labelledby="h-units" data-testid="units-panel">
    <div class="panel-head"><h2 class="panel-title" id="h-units">Units</h2><span class="muted small">${BUILT_IN_UNIT_IDS.length} built in${own.length ? `, ${own.length} of your own` : ''}</span></div>
    <p class="muted small">Built in: ${BUILT_IN_UNIT_IDS.map((u) => e(UNIT_NAMES[u])).join(', ')}.</p>
    ${own.length ? `<ul class="entries">${rows}</ul>` : '<p class="muted">No units of your own yet. Add one such as Coil, Box or Dozen.</p>'}
    ${manage ? `<form class="inline-add" data-form="inv-unit" novalidate><label class="field">New unit<input name="name" value="${e(add.values?.name ?? '')}" maxlength="12" placeholder="for example Coil" autocomplete="off" ${bad(add.errors, 'name')}>${err(add.errors, 'name')}</label><label class="check-line"><input type="checkbox" name="whole" ${add.values?.whole ? 'checked' : ''}> Whole numbers only</label><button type="submit" class="btn btn-secondary">${icon('plus', { size: 18 })} Add unit</button></form>` : ''}
  </div>`;
}

export function fieldsScreen({ state, ui, allow, me }) {
  const manageStock = allow('manage_inventory');
  const lists = activeFields(state).filter((x) => x.type === 'list');
  const demo = !isSynced(state);
  return `<section class="page page-wide" aria-labelledby="page-title">
    <a class="back" href="#/inventory">${icon('arrowLeft', { size: 18 })} Inventory</a>
    <header class="page-head"><h1 id="page-title" tabindex="-1">Item details and lists</h1><p class="muted">${demo ? 'The demo keeps these on this device. ' : ''}The details your items carry, the lists you pick them from, and your units. The CSV template follows them.</p></header>
    ${noticeHtml(ui)}
    ${fieldsPanel(state, ui, allow, me)}
    ${lists.map((x) => listPanel(state, ui, x, manageStock)).join('')}
    ${unitsPanel(state, ui, manageStock)}
  </section>`;
}
