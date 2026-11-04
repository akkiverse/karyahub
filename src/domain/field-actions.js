// What the owner and staff can do with the business's own item details (CR-0013): fields, list entries and units.
// For a real business each change is only written on this device; the sync module sends it to the server, which
// checks it again. The demo business keeps everything on the device.
import { can } from './access.js';
import { uid } from '../ids.js';
import { BUILT_IN_UNIT_IDS } from './inventory.js';
import {
  FIELD_TYPES, activeFields, canAddField, fieldNameProblem, entryNameProblem, unitNameProblem, detailOf, MAX_FIELDS,
} from './fields.js';

const DENIED = "Your access doesn't include this. Ask your business owner.";

export function createFieldActions({ store, currentUser = () => null }) {
  const denied = (perm) => { const u = currentUser(); return u && !can(u, perm) ? { error: DENIED } : null; };
  const find = (list, id) => (store.get()[list] || []).find((x) => x.id === id);

  /** values: name, type, required, in_list, in_filter, on_bills. A pick-list can't change kind; text and number can when every value fits. */
  function saveField(values, id = null) {
    const no = denied('manage_settings');
    if (no) return no;
    const s0 = store.get();
    const name = String(values.name || '').trim().replace(/\s+/g, ' ');
    const type = id ? find('item_fields', id).type : values.type;
    const errors = {};
    const problem = fieldNameProblem(s0, name, id);
    if (problem) errors.name = problem;
    if (!FIELD_TYPES[type]) errors.type = 'Pick what kind of detail it is.';
    if (!id && !errors.name && !canAddField(s0)) errors.name = `You can have up to ${MAX_FIELDS} item fields in use. Stop one you don't use first.`;
    if (id && values.type && values.type !== type) {
      if (type === 'list' || values.type === 'list') errors.type = "A pick-list can't change into another kind of field. Add a new field and move the values.";
      else if (values.type === 'number') {
        const bad = (s0.items || []).map((i) => detailOf(s0, i, find('item_fields', id))).filter((x) => x && !Number.isFinite(Number(x)));
        if (bad.length) errors.type = `These values aren't numbers: ${[...new Set(bad)].slice(0, 5).join(', ')}. Correct them before the change.`;
      }
    }
    if (Object.keys(errors).length) return { errors };
    const on = (x) => x === true || x === 'on' || x === 'true';
    const body = { name, required: on(values.required), in_list: on(values.in_list), in_filter: on(values.in_filter) && (values.type || type) === 'list', on_bills: on(values.on_bills) };
    let savedId = id;
    store.update((s) => {
      if (id) {
        const f = s.item_fields.find((x) => x.id === id);
        Object.assign(f, body, id && values.type ? { type: values.type } : {});
        return;
      }
      savedId = `fd-${uid()}`;
      const order = Math.max(0, ...(s.item_fields || []).map((x) => x.order || 0)) + 1;
      s.item_fields = [...(s.item_fields || []), { id: savedId, type, stopped: false, order, ...body }];
    });
    return { id: savedId };
  }

  function setFieldStopped(id, stopped) {
    const no = denied('manage_settings');
    if (no) return no;
    const f = find('item_fields', id);
    if (!f) return { error: "That field isn't there." };
    if (!stopped) {
      const p = fieldNameProblem({ ...store.get(), item_fields: store.get().item_fields.filter((x) => x.id !== id) }, f.name);
      if (p) return { error: p };
      if (!canAddField(store.get())) return { error: `You can have up to ${MAX_FIELDS} item fields in use. Stop one you don't use first.` };
    }
    store.update((s) => { s.item_fields.find((x) => x.id === id).stopped = Boolean(stopped); });
    return { ok: true };
  }

  /** Add the starter fields for this kind of business that it doesn't have yet. */
  function addStarters(list) {
    const no = denied('manage_settings');
    if (no) return no;
    let added = 0;
    for (const [name, type] of list) {
      if (!canAddField(store.get()) || fieldNameProblem(store.get(), name)) continue;
      if (saveField({ name, type, in_list: name === 'Brand', in_filter: type === 'list' && name === 'Brand' }).id) added += 1;
    }
    return { added };
  }

  function addEntry(fieldId, name) {
    const no = denied('manage_inventory');
    if (no) return no;
    const f = find('item_fields', fieldId);
    if (!f || f.type !== 'list') return { error: "That isn't a pick-list." };
    const problem = entryNameProblem(store.get(), fieldId, name);
    if (problem) return { error: problem };
    const id = `le-${uid()}`;
    store.update((s) => { s.list_entries = [...(s.list_entries || []), { id, field_id: fieldId, name: String(name).trim().replace(/\s+/g, ' '), stopped: false }]; });
    return { id };
  }
  function renameEntry(id, name) {
    const no = denied('manage_inventory');
    if (no) return no;
    const e = find('list_entries', id);
    if (!e) return { error: "That entry isn't there." };
    const problem = entryNameProblem(store.get(), e.field_id, name, id);
    if (problem) return { error: problem };
    store.update((s) => { s.list_entries.find((x) => x.id === id).name = String(name).trim().replace(/\s+/g, ' '); });
    return { ok: true };
  }
  function setEntryStopped(id, stopped) {
    const no = denied('manage_inventory');
    if (no) return no;
    if (!find('list_entries', id)) return { error: "That entry isn't there." };
    store.update((s) => { s.list_entries.find((x) => x.id === id).stopped = Boolean(stopped); });
    return { ok: true };
  }

  function addUnit(name, whole) {
    const no = denied('manage_inventory');
    if (no) return no;
    const problem = unitNameProblem(store.get(), name, BUILT_IN_UNIT_IDS);
    if (problem) return { error: problem };
    const id = `un-${uid()}`;
    store.update((s) => { s.units = [...(s.units || []), { id, name: String(name).trim(), whole: Boolean(whole), stopped: false }]; });
    return { id };
  }
  function changeUnit(id, name, whole) {
    const no = denied('manage_inventory');
    if (no) return no;
    if (!find('units', id)) return { error: "That unit isn't there." };
    const problem = unitNameProblem(store.get(), name, BUILT_IN_UNIT_IDS, id);
    if (problem) return { error: problem };
    store.update((s) => { Object.assign(s.units.find((x) => x.id === id), { name: String(name).trim(), whole: Boolean(whole) }); });
    return { ok: true };
  }
  function setUnitStopped(id, stopped) {
    const no = denied('manage_inventory');
    if (no) return no;
    if (!find('units', id)) return { error: "That unit isn't there." };
    store.update((s) => { s.units.find((x) => x.id === id).stopped = Boolean(stopped); });
    return { ok: true };
  }

  return { saveField, setFieldStopped, addStarters, addEntry, renameEntry, setEntryStopped, addUnit, changeUnit, setUnitStopped, activeFields: () => activeFields(store.get()) };
}
