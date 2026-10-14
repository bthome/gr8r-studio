export const STATUS = ['backlog', 'todo', 'progress', 'review', 'done'];
export const PRIORITY = ['urgent', 'high', 'medium', 'low', 'none'];
export const LABEL = ['design', 'frontend', 'backend', 'research', 'content', 'bug', 'qa', 'growth'];
export const PSTATUS = ['planning', 'active', 'risk', 'hold', 'complete'];
export const ROLE = ['Owner', 'Admin', 'Member', 'Guest'];
export const CATALOG = { status: STATUS, priority: PRIORITY, label: LABEL, projectStatus: PSTATUS, role: ROLE };

export function check(kind, value) {
  const list = CATALOG[kind];
  if (!list) throw new Error(`unknown catalog ${kind}`);
  if (!list.includes(value)) throw new Error(`${kind} ${value} is not in the catalog`);
  return value;
}
