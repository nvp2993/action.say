import { state } from '../state/store.js';
import { escapeHtml, formatDayMonth } from '../utils/helpers.js';
import { syncShowsToCloud } from '../services/show.service.js';
import { logStudioActivity } from '../services/admin.service.js';

function getDatesInRange(startStr, endStr) {
  const s = startStr || endStr;
  const e = endStr || startStr;
  if (!s || !e || e < s) return s ? [s] : [];
  const days = [];
  const cur = new Date(`${s}T00:00:00`);
  const last = new Date(`${e}T00:00:00`);
  let guard = 0;
  while (cur <= last && guard < 62) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    guard++;
  }
  return days;
}

function analyzeMemberAvailability(memberId, startStr, endStr) {
  const rangeDays = getDatesInRange(startStr, endStr);
  const overlappingShows = (state.shows || []).filter(sh => {
    if (!sh || sh.isCancelled || !sh.startDate) return false;
    const shStart = sh.startDate;
    const shEnd = sh.endDate || sh.startDate;
    const inRange = shStart <= (endStr || startStr) && shEnd >= (startStr || endStr);
    if (!inRange) return false;
    return Array.isArray(sh.memberIds) && sh.memberIds.includes(memberId);
  });

  if (overlappingShows.length === 0) {
    return {
      bucket: 'free',
      badgeText: rangeDays.length > 1 ? `Rảnh ${rangeDays.length} ngày` : 'Rảnh trọn',
      subText: 'Sẵn sàng báo giá',
      shows: []
    };
  }

  const officialShows = overlappingShows.filter(s => !s.isHold);
  const holdShows = overlappingShows.filter(s => !!s.isHold);

  const busyDaySet = new Set();
  officialShows.forEach(sh => {
    getDatesInRange(
      sh.startDate < startStr ? startStr : sh.startDate,
      (sh.endDate || sh.startDate) > endStr ? endStr : (sh.endDate || sh.startDate)
    ).forEach(d => busyDaySet.add(d));
  });

  const isPartialDays = rangeDays.length > 1 && officialShows.length > 0 && busyDaySet.size < rangeDays.length;
  const isOnlyHold = officialShows.length === 0 && holdShows.length > 0;

  if (isOnlyHold || isPartialDays) {
    const primary = officialShows[0] || holdShows[0];
    const reason = isOnlyHold
      ? `Giữ lịch: ${primary.location || 'Hold'}`
      : `Chỉ bận ${busyDaySet.size}/${rangeDays.length} ngày (${primary.location || 'Show'})`;
    return {
      bucket: 'flexible',
      badgeText: isOnlyHold ? 'Đang hold' : `Bận ${busyDaySet.size}/${rangeDays.length}d`,
      subText: reason,
      shows: overlappingShows
    };
  }

  const firstOfficial = officialShows[0];
  const extra = officialShows.length > 1 ? ` (+${officialShows.length - 1})` : '';
  return {
    bucket: 'busy',
    badgeText: 'Bận show',
    subText: `${firstOfficial.location || 'Có show'}${extra}`,
    shows: officialShows
  };
}

export function renderCrewBoardTabHtml() {
  const startDate = state.checkStart || state.selectedYear + '-' + String(state.selectedMonth || 1).padStart(2, '0') + '-01';
  const endDate = state.checkEnd || startDate;
  const savedAvatars = JSON.parse(localStorage.getItem('as_member_avatars_2026') || '{}');

  if (!Array.isArray(state.crewBoardSelectedIds)) {
    state.crewBoardSelectedIds = [];
  }
  const validMemberIds = new Set((state.members || []).map(m => m.id));
  state.crewBoardSelectedIds = state.crewBoardSelectedIds.filter(id => validMemberIds.has(id));

  const items = [...(state.members || [])]
    .sort((a, b) => {
      if (a.id === state.currentUserId) return -1;
      if (b.id === state.currentUserId) return 1;
      return (Number(a.order) || 99) - (Number(b.order) || 99);
    })
    .map(m => ({
      member: m,
      info: analyzeMemberAvailability(m.id, startDate, endDate)
    }));

  const freeItems = items.filter(x => x.info.bucket === 'free');
  const flexItems = items.filter(x => x.info.bucket === 'flexible');
  const busyItems = items.filter(x => x.info.bucket === 'busy');
  const selectedIds = state.crewBoardSelectedIds;

  const renderAvatar = (m) => {
    const prof = state.memberProfiles?.[m.id] || {};
    const src = prof.avatarUrl || prof.avatar || savedAvatars[m.id] || '';
    if (src) {
      return `<img src="${escapeHtml(src)}" alt="${escapeHtml(m.name)}" class="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0" />`;
    }
    return `
      <span style="background-color:${m.bg || '#334155'};color:${m.text || '#ffffff'}" class="w-9 h-9 rounded-xl text-[11px] font-black uppercase flex items-center justify-center shrink-0">
        ${escapeHtml((m.shortLabel || m.name || 'AS').slice(0, 2))}
      </span>
    `;
  };

  const renderMemberCard = ({ member: m, info }, tone) => {
    const isChecked = selectedIds.includes(m.id);
    const toneStyles = {
      free: {
        card: isChecked ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20' : 'bg-white border-slate-200/90 hover:border-emerald-300',
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        sub: 'text-emerald-700'
      },
      flexible: {
        card: isChecked ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/20' : 'bg-white border-amber-200/90 hover:border-amber-400',
        pill: 'bg-amber-50 text-amber-800 border-amber-200',
        sub: 'text-amber-800'
      },
      busy: {
        card: isChecked ? 'bg-slate-100 border-slate-500 ring-2 ring-slate-400/20' : 'bg-slate-50/80 border-slate-200/80',
        pill: 'bg-rose-50 text-rose-700 border-rose-200',
        sub: 'text-slate-500'
      }
    }[tone];

    const firstShowId = info.shows?.[0]?.id;

    return `
      <div class="rounded-2xl border p-2.5 transition flex flex-col justify-between gap-2 ${toneStyles.card}">
        <div class="flex items-start justify-between gap-1.5">
          <div onclick="appActions.toggleCrewBoardSelect('${escapeHtml(m.id)}')" class="flex items-center gap-2 min-w-0 cursor-pointer flex-1">
            ${renderAvatar(m)}
            <div class="min-w-0">
              <div class="font-black text-xs text-slate-900 uppercase truncate">${escapeHtml(m.name)}</div>
              <div class="text-[10.5px] font-semibold truncate ${toneStyles.sub}">${escapeHtml(info.subText)}</div>
            </div>
          </div>
          <input
            type="checkbox"
            ${isChecked ? 'checked' : ''}
            onchange="appActions.toggleCrewBoardSelect('${escapeHtml(m.id)}')"
            aria-label="Chọn ${escapeHtml(m.name)}"
            class="w-4 h-4 rounded accent-slate-900 cursor-pointer shrink-0 mt-0.5"
          />
        </div>

        <div class="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-100">
          <span class="px-2 py-0.5 rounded-full border text-[10px] font-extrabold truncate ${toneStyles.pill}">${escapeHtml(info.badgeText)}</span>
          ${tone !== 'busy' ? `
            <button
              type="button"
              onclick="appActions.openAddModal('${escapeHtml(startDate)}', '${escapeHtml(m.id)}', '${escapeHtml(endDate)}')"
              class="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] font-extrabold shrink-0 transition"
            >+ Nổ</button>
          ` : (firstShowId ? `
            <button
              type="button"
              onclick="appActions.openShowDetail('${escapeHtml(firstShowId)}')"
              class="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold shrink-0 transition"
            >Xem show</button>
          ` : '')}
        </div>
      </div>
    `;
  };

  const selectedNames = selectedIds
    .map(id => (state.members || []).find(m => m.id === id)?.name)
    .filter(Boolean);

  return `
    <div id="crew-board-scroll-list" class="flex-1 min-h-0 overflow-y-auto custom-scroll bg-[#F5F5F7] px-3 sm:px-5 py-3.5 text-xs">
      <div class="max-w-5xl mx-auto space-y-3 ${selectedIds.length > 0 ? 'pb-20' : 'pb-4'}">
        <!-- Header & Khoảng ngày kiểm tra -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div class="flex items-center justify-between sm:justify-start gap-3">
            <div>
              <div class="text-[9.5px] font-extrabold tracking-wider text-slate-400 uppercase">CHECK LỰC LƯỢNG BÁO GIÁ</div>
              <h2 class="font-black text-sm text-slate-900 uppercase">TÌNH HÌNH NHÂN SỰ (${formatDayMonth(startDate)}${endDate !== startDate ? ` → ${formatDayMonth(endDate)}` : ''})</h2>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-2.5 py-1.5">
              <span class="text-[10px] font-extrabold text-slate-400">TỪ</span>
              <input type="date" value="${escapeHtml(startDate)}" onchange="appActions.setCheckDate('checkStart', this.value)" class="bg-transparent font-mono font-bold text-[11.5px] text-slate-900 focus:outline-none" />
              <span class="text-slate-400 font-bold">→</span>
              <input type="date" min="${escapeHtml(startDate)}" value="${escapeHtml(endDate)}" onchange="appActions.setCheckDate('checkEnd', this.value)" class="bg-transparent font-mono font-bold text-[11.5px] text-slate-900 focus:outline-none" />
            </div>

            <div class="px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[10.5px] font-extrabold flex items-center gap-1.5 shrink-0">
              <span class="text-emerald-700">${freeItems.length} rảnh trọn</span>
              <span class="text-slate-300">•</span>
              <span class="text-amber-700">${flexItems.length} linh động</span>
              <span class="text-slate-300">•</span>
              <span class="text-rose-700">${busyItems.length} bận</span>
            </div>
          </div>
        </div>

        <!-- 1. Rảnh trọn -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 font-black text-xs text-slate-900">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Rảnh trọn (${freeItems.length}/${items.length})</span>
            </div>
            <span class="text-[10.5px] text-slate-400 font-semibold">Trống toàn bộ khoảng ngày đang chọn</span>
          </div>
          ${freeItems.length === 0 ? `
            <div class="py-3 text-center text-[11px] text-slate-400">Không có ai rảnh trọn trong khoảng ngày này.</div>
          ` : `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              ${freeItems.map(item => renderMemberCard(item, 'free')).join('')}
            </div>
          `}
        </div>

        <!-- 2. Linh động được (Hold hoặc chỉ bận 1 phần ngày) -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 font-black text-xs text-slate-900">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Linh động được (${flexItems.length}/${items.length})</span>
            </div>
            <span class="text-[10.5px] text-slate-400 font-semibold">Đang giữ lịch hoặc chỉ kẹt vài ngày</span>
          </div>
          ${flexItems.length === 0 ? `
            <div class="py-2.5 text-center text-[11px] text-slate-400">Không có trường hợp linh động.</div>
          ` : `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              ${flexItems.map(item => renderMemberCard(item, 'flexible')).join('')}
            </div>
          `}
        </div>

        <!-- 3. Bận cứng -->
        <div class="bg-white rounded-2xl border border-slate-200/80 p-3 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 font-black text-xs text-slate-900">
              <span class="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>Bận show (${busyItems.length}/${items.length})</span>
            </div>
            <span class="text-[10.5px] text-slate-400 font-semibold">Đã có show chính thức</span>
          </div>
          ${busyItems.length === 0 ? `
            <div class="py-2.5 text-center text-[11px] text-slate-400">Không có ai bị bận cứng.</div>
          ` : `
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              ${busyItems.map(item => renderMemberCard(item, 'busy')).join('')}
            </div>
          `}
        </div>
      </div>

      <!-- Thanh thao tác nhanh khi đã tick chọn NS -->
      ${selectedIds.length > 0 ? `
        <div class="fixed bottom-16 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-2xl bg-slate-900 text-white rounded-2xl px-3.5 py-2.5 shadow-xl border border-slate-700/80 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[10px] font-bold text-slate-400 uppercase">Đã chọn ${selectedIds.length} NS</div>
            <div class="font-extrabold text-xs text-amber-300 truncate">${escapeHtml(selectedNames.join(', '))}</div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="appActions.holdSelectedCrewFromBoard()" class="px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[11px] transition">⏳ Giữ lịch</button>
            <button type="button" onclick="appActions.bookSelectedCrewFromBoard()" class="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-[11px] transition">⚡ Nổ show</button>
            <button type="button" onclick="appActions.clearCrewBoardSelection()" class="px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] transition">✕</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export async function holdCrewRangeForMembers(memberIds, startDate, endDate) {
  const list = Array.isArray(memberIds) ? memberIds.filter(Boolean) : [];
  if (!list.length) return;
  const s = startDate || new Date().toISOString().slice(0, 10);
  const e = endDate || s;
  const label = `Giữ lịch (${formatDayMonth(s)}${e !== s ? ` - ${formatDayMonth(e)}` : ''})`;

  const newHold = {
    id: 'hold_' + Date.now(),
    stt: Math.max(300, ...(state.shows || []).map(sItem => Number(sItem.stt) || 0)) + 1,
    location: label,
    note: label,
    startDate: s,
    endDate: e,
    memberIds: list,
    ownerId: state.currentUserId,
    creatorId: state.currentUserId,
    isHold: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  state.shows.push(newHold);
  state.crewBoardSelectedIds = [];
  await syncShowsToCloud?.();
  await logStudioActivity?.(`Giữ lịch cho ${list.length} NS (${s} → ${e})`);
}
