// A business's own item details (CR-0013): fields (Brand, Size...), the entries of its pick-lists and its units.
// Pure functions over the on-device copy. The server holds the same rules (backend/karyahub/data/item_fields.py).

export const FIELD_TYPES = { text: 'Text', number: 'Number', list: 'Pick-list' };
export const MAX_FIELDS = 15;
export const RESERVED = new Set(['sno', 'code', 'name', 'unit', 'sale price', 'sale', 'cost price', 'cost', 'hsn', 'gst rate', 'gst', 'low stock at', 'low', 'opening stock', 'opening', 'quantity', 'qty']);
/** What each kind of business is offered when it has no fields yet (the owner taps to add; nothing is added alone). */
export const STARTER_FIELDS = {
  service: [['Brand', 'list'], ['Model', 'text']],
  trader: [['Brand', 'list'], ['Material type', 'list'], ['Size', 'text'], ['Colour', 'list']],
  shop: [['Brand', 'list'], ['Material type', 'list'], ['Size', 'text'], ['Colour', 'list']],
  other: [['Brand', 'list'], ['Size', 'text']],
};

/** Words as a person compares them: no case, and spaces, dots, dashes and underscores all alike. */
export const fnorm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_\-./]+/g, ' ').trim();

export const fieldsOf = (state) => (state.item_fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
export const activeFields = (state) => fieldsOf(state).filter((f) => !f.stopped);
/** The entries a person may pick from a list (merged duplicates are hidden, stopped ones are not offered). */
export const pickable = (state, fieldId) => (state.list_entries || [])
  .filter((e) => e.field_id === fieldId && !e.alias_of && !e.stopped)
  .sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));
/** Every entry of a list that the owner manages (stopped ones too, merged duplicates never). */
export const entriesOf = (state, fieldId) => (state.list_entries || [])
  .filter((e) => e.field_id === fieldId && !e.alias_of)
  .sort((a, b) => a.name.localeCompare(b.name, 'en-IN'));
export const entryById = (state, id) => {
  const e = (state.list_entries || []).find((x) => x.id === id);
  return e && e.alias_of ? (state.list_entries || []).find((x) => x.id === e.alias_of) || e : e;
};
export const findEntry = (state, fieldId, text) => {
  const key = fnorm(text);
  return key ? entriesOf(state, fieldId).find((e) => fnorm(e.name) === key) || null : null;
};

/** What an item holds for one field, as words ('' when empty). */
export function detailOf(state, item, field) {
  const v = item.attrs && item.attrs[field.id];
  if (v === undefined || v === null || v === '') return '';
  if (field.type === 'list') { const e = entryById(state, v); return e ? e.name : ''; }
  return String(v);
}
/** The item's details as [{field, text}] for the fields that have a value; `only` picks fields by a flag, e.g. 'in_list'. */
export function detailsOf(state, item, only = null) {
  return activeFields(state)
    .filter((f) => !only || f[only])
    .map((f) => ({ field: f, text: detailOf(state, item, f) }))
    .filter((d) => d.text);
}
/** Brand: Havells · Size: 0.75 sq mm */
export const detailsLine = (state, item, only = null) => detailsOf(state, item, only).map((d) => `${d.field.name}: ${d.text}`).join(' · ');
/** All the words a search may match: the values of every field the item has (stopped fields too). */
export const detailWords = (state, item) => fieldsOf(state).map((f) => detailOf(state, item, f)).filter(Boolean).join(' ');

/** Add the item's on-bill details to the name that goes on a bill line: Wire (Havells, 0.75 sq mm). */
export function billName(state, item) {
  const extra = detailsOf(state, item, 'on_bills').map((d) => d.text);
  return extra.length ? `${item.name} (${extra.join(', ')})` : item.name;
}

// ---------- checking what a person types ----------
/** The name of a new field: why it can't be used, or '' when fine. */
export function fieldNameProblem(state, name, editingId = null) {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 40) return 'Give the field a name of 2 to 40 characters.';
  if (RESERVED.has(fnorm(n))) return `"${n}" is already a standard column. Pick another name.`;
  if (activeFields(state).some((f) => f.id !== editingId && fnorm(f.name) === fnorm(n))) return `You already have a field called ${n}.`;
  return '';
}
export const canAddField = (state) => activeFields(state).length < MAX_FIELDS;
export function entryNameProblem(state, fieldId, name, editingId = null) {
  const n = String(name || '').trim();
  if (!n || n.length > 60) return 'Type a name of up to 60 characters.';
  const twin = entriesOf(state, fieldId).find((e) => e.id !== editingId && fnorm(e.name) === fnorm(n));
  return twin ? `${twin.name} is already in this list.` : '';
}
export function unitNameProblem(state, name, builtIn, editingId = null) {
  const n = String(name || '').trim();
  if (!n || n.length > 12) return 'Give the unit a name of up to 12 characters.';
  if (/^[\d.,\s]+$/.test(n)) return 'A unit is a word, for example Coil or Box.';
  const key = fnorm(n);
  if (builtIn.some((u) => fnorm(u) === key)) return `${n} is already one of your units.`;
  if ((state.units || []).some((u) => u.id !== editingId && !u.alias_of && fnorm(u.name) === key)) return `${n} is already one of your units.`;
  return '';
}
/** What the item form's details give back: {attrs, pending, errors}. A list value typed that isn't in the list is `pending` (added with the item). */
export function readDetails(state, values) {
  const attrs = {};
  const pending = [];
  const errors = {};
  for (const f of activeFields(state)) {
    const key = `attr:${f.id}`;
    const raw = String(values[key] ?? '').trim();
    if (!raw) {
      if (f.required) errors[key] = `Give the ${f.name}.`;
      continue;
    }
    if (f.type === 'text') {
      if (raw.length > 120) errors[key] = `${f.name} can have up to 120 characters.`;
      else attrs[f.id] = raw.replace(/\s+/g, ' ');
    } else if (f.type === 'number') {
      const n = Number(raw.replace(/,/g, ''));
      if (!Number.isFinite(n)) errors[key] = `${f.name} must be a number.`;
      else attrs[f.id] = n;
    } else {
      const hit = findEntry(state, f.id, raw);
      if (hit) attrs[f.id] = hit.id;
      else if (raw.length > 60) errors[key] = `${f.name} can have up to 60 characters.`;
      else pending.push({ field_id: f.id, name: raw.replace(/\s+/g, ' ') });
    }
  }
  return { attrs, pending, errors };
}
