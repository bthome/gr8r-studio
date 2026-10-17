/* =====================================================================
   SETTINGS · AUTH · ONBOARDING · DESIGN SYSTEM · SYSTEM STATES
   ===================================================================== */
import { dOff, esc, fmtDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S, me } from '../core/store.js';
import { av, pIcon } from '../ui/helpers.js';
import { permsTable, teamsGrid } from './members.js';
import { page404 } from './errors.js';
import { SHORTCUTS } from '../overlays/modals.js';

export const SET_NAV = [
  [
    'General',
    [
      ['workspace', 'Workspace', 'building-2'],
      ['files', 'Files', 'folder'],
      ['appearance', 'Appearance', 'palette'],
    ],
  ],
  [
    'Workspace',
    [
      ['members', 'Members', 'users'],
      ['teams', 'Teams', 'users-round'],
      ['projects', 'Projects', 'folder-kanban'],
      ['permissions', 'Permissions', 'shield'],
    ],
  ],
  ['Notifications', [['signals', 'Signals', 'bell']]],
  [
    'Personal',
    [
      ['profile', 'Profile', 'user'],
      ['preferences', 'Preferences', 'sliders-horizontal'],
      ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
    ],
  ],
];
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${k}">`;
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;
export function pageSettings() {
  const sec = S.ui.params.sec || S.ui.settings || 'appearance';
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', 'Appearance'];
  return `<div class="set">
    <nav class="set-nav" aria-label="Settings">${SET_NAV.map(([g, items]) => `<div class="gh">${g}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${n}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${settingsBody(sec, title[1])}</div></div>
  </div>`;
}
export function settingsBody(sec, title) {
  const P = S.prefs;
  const d = D();
  const H = lead => `<h1>${title}</h1><p class="lead">${lead}</p>`;
  switch (sec) {
    case 'files':
      return (
        H('The folder where mate files are kept.') +
        `<div class="sblock"><div class="field" style="max-width:520px"><label class="label" for="files-path">Folder</label><input class="input" id="files-path" value="${esc(d.filesPath || '')}" placeholder="/Users/you/gr8r-files"></div><button class="btn btn-primary" data-a="saveFilesPath" style="margin-top:12px">Save path</button></div>`
      );
    case 'appearance':
      return (
        H('Customize how Gr8r looks on this device.') +
        `
      <div class="sblock" style="margin-top:0"><h2>Theme</h2><div class="themecards" style="margin-top:12px" role="radiogroup" aria-label="Theme">${[
        ['light', 'Light'],
        ['dark', 'Dark'],
        ['system', 'System'],
      ]
        .map(([k, n]) => {
          const L = { bg: '#FBFAF8', s: '#F2F1EE', t: '#1D1C1A', b: '#E3E1DC', a: '#4B5BD6' },
            Dk = { bg: '#1D1D1C', s: '#151514', t: '#ECEAE5', b: '#333230', a: '#8E9AF3' };
          const pv = c =>
            `<div class="s" style="background:${c.s}"><i style="background:${c.b};width:70%"></i><i style="background:${c.a};width:55%"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.b};width:60%"></i></div><div class="m" style="background:${c.bg}"><i style="background:${c.t};width:45%;height:7px"></i><i style="background:${c.b}"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.a};width:30%;height:10px;margin-top:4px"></i></div>`;
          return `<button class="tcard ${P.theme === k ? 'on' : ''}" role="radio" aria-checked="${P.theme === k}" data-a="setTheme" data-v="${k}"><div class="tprev" style="${k === 'system' ? 'grid-template-columns:1fr 1fr;display:grid' : ''}">${k === 'system' ? `<div style="display:grid;grid-template-columns:30% 1fr">${pv(L)}</div><div style="display:grid;grid-template-columns:30% 1fr">${pv(Dk)}</div>` : pv(k === 'light' ? L : Dk)}</div><span class="row" style="font-weight:500;font-size:13px;gap:6px">${ic(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'monitor', 14)}${n}${P.theme === k ? `<span class="sp"></span><span style="color:var(--accent)">${ic('circle-check', 15)}</span>` : ''}</span></button>`;
        })
        .join('')}</div></div>
      <div class="sblock"><h2>Accent color</h2>${srow(
        'Accent',
        'Used for primary buttons, focus rings, and selection.',
        `<div class="swatches" role="radiogroup" aria-label="Accent color">${[
          ['indigo', '#4B5BD6'],
          ['blue', '#2F6CD4'],
          ['violet', '#7348CC'],
          ['teal', '#1A7F7A'],
          ['rose', '#B93D68'],
          ['graphite', '#34332F'],
        ]
          .map(
            ([k, c]) =>
              `<button class="sw ${P.accent === k ? 'on' : ''}" style="--c:${c}" role="radio" aria-checked="${P.accent === k}" data-a="setPref" data-k="accent" data-v="${k}" aria-label="${k}" data-tip="${k[0].toUpperCase() + k.slice(1)}">${P.accent === k ? ic('check', 13) : ''}</button>`,
          )
          .join('')}</div>`,
      )}</div>
      <div class="sblock"><h2>Density</h2>
        ${srow('Sidebar density', 'Compact fits more projects on screen.', `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.side === k ? 'on' : ''}" data-a="setPref" data-k="side" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`)}
        ${srow('Task display', 'Row height in lists and card padding on boards.', `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.density === k ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`)}
        ${srow(
          'Motion',
          'Reduce animations for drawers, modals, and transitions.',
          sel(
            'motion',
            [
              ['system', 'Follow system'],
              ['reduce', 'Reduce motion'],
            ],
            P.motion,
          ),
        )}
      </div>`
      );
    case 'language':
      return (
        H('Language and regional formats.') +
        srow(
          'Language',
          'The language used throughout the interface.',
          sel('lang', ['English (US)', 'English (UK)', 'Deutsch', 'Español', 'Français', '日本語'], P.lang),
        ) +
        srow('Spellcheck', 'Check spelling in descriptions and comments.', tog('spell', P.spell !== false))
      );
    case 'datetime':
      return (
        H('How dates and times appear across the workspace.') +
        srow(
          'Time zone',
          'Used for due dates and reminders.',
          sel('tz', ['(GMT-08:00) Pacific Time', '(GMT-05:00) Eastern Time', '(GMT+00:00) London', '(GMT+01:00) Berlin', '(GMT+08:00) Singapore'], P.tz),
        ) +
        srow(
          'Date format',
          `Preview: <b>${fmtDate(dOff(8))}</b>`,
          sel(
            'dateFmt',
            [
              ['MMM d', 'Oct 1'],
              ['d/M', '1/10'],
              ['M/d', '10/1'],
              ['yyyy-MM-dd', '2026-10-01'],
            ],
            P.dateFmt,
          ),
        ) +
        srow(
          'Start week on',
          'Affects calendars and the timeline.',
          sel(
            'weekStart',
            [
              ['1', 'Monday'],
              ['0', 'Sunday'],
              ['6', 'Saturday'],
            ],
            P.weekStart,
          ),
        ) +
        srow(
          'Time format',
          '',
          sel(
            'timeFmt',
            [
              ['12', '12-hour (2:30 PM)'],
              ['24', '24-hour (14:30)'],
            ],
            P.timeFmt || '12',
          ),
        )
      );
    case 'members':
      return (
        H(`${d.members.length} people have access to ${esc(d.ws.name)}.`) +
        `<div class="row" style="margin-bottom:12px"><button class="btn btn-secondary" data-a="go" data-r="members">Open member directory</button></div>
      <div class="panel" style="overflow:hidden">${d.members.map(m => `<div class="mini" style="min-height:52px;cursor:default" data-ctx="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:500">${esc(m.name)}</div><div class="faint" style="font-size:12px">${esc(m.email)}</div></div>${m.status === 'invited' ? '<span class="badge amber">Invited</span>' : ''}${m.role === 'Owner' ? `<span class="pillbtn">${ic('crown', 13)}Owner</span>` : `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${m.role}${ic('chevron-down', 12)}</button>`}<button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="Options">${ic('ellipsis', 14)}</button></div>`).join('')}</div>`
      );
    case 'teams':
      return H('Teams group people and projects.') + teamsGrid();
    case 'projects': {
      const arch = d.projects.filter(p => p.archived);
      return (
        H('Defaults for new projects and archived work.') +
        srow(
          'Default project view',
          'The tab that opens when you open a project.',
          sel(
            'defaultTab',
            [
              ['board', 'Board'],
              ['list', 'List'],
              ['table', 'Table'],
              ['overview', 'Overview'],
              ['timeline', 'Timeline'],
            ],
            P.defaultTab || 'board',
          ),
        ) +
        srow('Show completed tasks on boards', '', tog('showDoneBoard', P.showDoneBoard !== false)) +
        `<div class="sblock"><h2>Archived projects</h2>${arch.length ? arch.map(p => `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="restoreProject" data-id="${p.id}">Restore</button><button class="btn btn-danger-ghost btn-sm" data-a="delProject" data-id="${p.id}">Delete</button></div></div>`).join('') : `<p class="faint" style="padding:12px 0">No archived projects. Archived projects are hidden from the sidebar but keep all their tasks.</p>`}<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-a="go" data-r="archive">${ic('archive', 13)}Open archive</button></div></div>`
      );
    }
    case 'permissions':
      return (
        H('Control what each role can do.') +
        srow('Members can create projects', '', tog('permCreate', P.permCreate !== false)) +
        srow('Members can invite guests', 'Guests only see projects they are added to.', tog('permGuests', P.permGuests !== false)) +
        srow('Allow public share links', 'Anyone with the link can view a project.', tog('permPublic', !!P.permPublic)) +
        `<div class="sblock"><h2>Role permissions</h2><div style="margin-top:12px">${permsTable()}</div></div>`
      );
    case 'signals':
      return (
        H('Signals come from the first mate. There is no email and no push.') +
        srow('Review waiting', 'A captain decision is in the outbox.', tog('sigReview', true, 'sig')) +
        srow('Unlinked task', 'A row has no firstmate id.', tog('sigUnlinked', true, 'sig')) +
        srow('Stalled relay', 'An outbox event has no ack.', tog('sigStalled', true, 'sig'))
      );
    case 'profile': {
      const err = S.ui.errors.pname2;
      return (
        H('How you appear to others in the workspace.') +
        `<form data-submit="saveProfile" class="col" style="gap:16px;max-width:440px">
      <div class="row" style="gap:14px">${av(d.me, 'xl', false)}<div><div class="label" style="margin-bottom:6px">Avatar color</div><div class="swatches">${['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'].map(c => `<button type="button" class="sw ${me().c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="avColor" data-v="${c}" aria-label="Color"></button>`).join('')}</div></div></div>
      <div class="field"><label class="label" for="pf-name">Full name</label><input class="input ${err ? 'is-error' : ''}" id="pf-name" value="${esc(P.name)}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
      <div class="field"><label class="label" for="pf-title">Title</label><input class="input" id="pf-title" value="${esc(P.title)}"></div>
      <div><button class="btn btn-primary" data-a="saveProfile" id="pf-save">Save profile</button></div></form>`
      );
    }
    case 'preferences':
      return (
        H('Personal defaults for how you work.') +
        srow(
          'Open on launch',
          'The page you see when Gr8r opens.',
          sel(
            'home',
            [
              ['home', 'Home'],
              ['mytasks', 'My Tasks'],
              ['inbox', 'Inbox'],
            ],
            P.home,
          ),
        ) +
        srow(
          'Open tasks in',
          'Side panel keeps your place in the list.',
          sel(
            'openTasks',
            [
              ['drawer', 'Side panel'],
              ['full', 'Full page'],
            ],
            P.openTasks,
          ),
        ) +
        srow('Confirm before deleting tasks', '', tog('confirmDel', P.confirmDel !== false))
      );
    case 'shortcuts':
      return (
        H('Move faster with the keyboard.') +
        SHORTCUTS.map(
          ([g, list]) =>
            `<div class="sblock" style="margin-top:18px"><h2>${g}</h2>${list.map(([n, k]) => `<div class="srow" style="padding:9px 0"><span>${n}</span><span class="row" style="gap:4px">${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`,
        ).join('')
      );
  }
  return page404();
}
export function strengthMeter(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  const c = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][s];
  const n = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][s];
  return pw
    ? `<div class="row" style="gap:8px"><div class="strength grow" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < s ? 'on' : ''}" style="--c:${c}"></i>`).join('')}</div><span style="font-size:11.5px;color:${c};width:60px;text-align:right">${n}</span></div>`
    : '';
}
