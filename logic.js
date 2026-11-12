export const STATUS = Object.freeze({new:'ещё не писал',sent:'написал',replied:'ответили',skip:'не подходит'});
export function selectLeads(leads, filters, state) {
  const query = filters.query.trim().toLocaleLowerCase('ru');
  return leads.filter(item => {
    const local = state[item.id] || {};
    return (filters.language === 'all' || (filters.language === 'ru' ? item.language === 'ru' : item.language !== 'ru'))
      && (filters.category === 'all' || item.category === filters.category)
      && (filters.status === 'all' || (local.status || 'new') === filters.status)
      && (filters.view === 'all' || (filters.view === 'saved' ? local.saved : ['sent','replied'].includes(local.status)))
      && (!query || [item.name,item.handle,item.category,item.offer,item.description,item.opportunity].join(' ').toLocaleLowerCase('ru').includes(query));
  }).sort((a,b) => filters.sort === 'small' ? (a.members ?? Infinity) - (b.members ?? Infinity) || a.number-b.number : filters.sort === 'priority' ? (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || a.number-b.number : a.number-b.number);
}
export function safeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!/^[a-z0-9-]+$/i.test(key) || !item || typeof item !== 'object') continue;
    result[key] = {status:Object.hasOwn(STATUS,item.status)?item.status:'new',saved:item.saved===true};
  }
  return result;
}
export function csvCell(value) {
  let content = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(content)) content = "'" + content;
  return '"' + content.replaceAll('"','""') + '"';
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:','http:','mailto:'].includes(url.protocol) ? url.href : '#'; } catch { return '#'; }
}
