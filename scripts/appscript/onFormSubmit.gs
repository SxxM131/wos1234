const SUPABASE_URL = 'https://kyajoltvdhvlcntxpdhn.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5YWpvbHR2ZGh2bGNudHhwZGhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM0MDUwMSwiZXhwIjoyMDk0OTE2NTAxfQ.hZFi87yvzpK9ITKZ0o5YbUoUOv0zUyQfZ-G9LPIHXDU';


function onFormSubmit(e) {
  const row = e.values;
  Logger.log('row 전체: ' + JSON.stringify(row));

  const gameId     = parseInt(String(row[2]).split('.')[0], 10);
  const name       = row[3];
  const alliance   = row[4];
  const speedupMon = Number(row[5]);
  const monBlocks  = parseBlocks(row[6]);
  const speedupTue = Number(row[7]);
  const tueBlocks  = parseBlocks(row[8]);
  const speedupThu = Number(row[9]);
  const thuBlocks  = parseBlocks(row[10]);

  Logger.log(`gameId: ${gameId}`);

  const cycleId = getCurrentCycleId();
  if (!cycleId) { Logger.log('cycleId 없음'); return; }

  if (!isReservationOpen()) {
    Logger.log('예약 마감됨 — 제출 무시: ' + gameId);
    return;
  }

  if (isNaN(gameId)) {
    Logger.log('유효하지 않은 Game ID: ' + row[2]);
    return;
  }

  const days = { mon: monBlocks, tue: tueBlocks, thu: thuBlocks };
  for (const [day, blocks] of Object.entries(days)) {
    if (blocks.length === 0) continue;
    if (isDuplicateForDay(gameId, cycleId, day)) {
      Logger.log(`중복 신청 무시 (${day}): ${gameId}`);
      return;
    }
  }

  upsertPlayer(gameId, name, alliance, speedupMon, speedupTue, speedupThu);
  insertPreferences(gameId, cycleId, monBlocks, tueBlocks, thuBlocks);
  Logger.log('신청 완료: ' + gameId);
}

function parseBlocks(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function getCurrentCycleId() {
  const res = supabaseFetch('GET', '/rest/v1/settings?key=eq.current_cycle_id&select=value');
  return res?.[0]?.value ? parseInt(res[0].value, 10) : null;
}

function isReservationOpen() {
  const res = supabaseFetch('GET', '/rest/v1/settings?key=eq.reservation_open&select=value');
  return res?.[0]?.value !== 'false';
}

function isDuplicateForDay(gameId, cycleId, day) {
  const prefs = supabaseFetch('GET',
    `/rest/v1/preferences?player_id=eq.${gameId}&day_of_week=eq.${day}&cycle_id=eq.${cycleId}&limit=1&select=id`
  );
  return prefs?.length > 0;
}

function upsertPlayer(gameId, name, alliance, speedupMon, speedupTue, speedupThu) {
  const body = {
    game_id: gameId,
    name,
    alliance,
    speedup_mon: speedupMon,
    speedup_tue: speedupTue,
    speedup_thu: speedupThu,
  };
  Logger.log('upsertPlayer body: ' + JSON.stringify(body));
  const result = supabaseFetch('POST', '/rest/v1/players?on_conflict=game_id', body,
    { Prefer: 'resolution=merge-duplicates' }
  );
  Logger.log('upsertPlayer result: ' + JSON.stringify(result));
}

function insertPreferences(gameId, cycleId, monBlocks, tueBlocks, thuBlocks) {
  const rows = [];
  const days = { mon: monBlocks, tue: tueBlocks, thu: thuBlocks };
  for (const [day, blocks] of Object.entries(days)) {
    for (const block of blocks) {
      rows.push({
        player_id: gameId,
        day_of_week: day,
        block_start_utc: block,
        cycle_id: cycleId,
      });
    }
  }
  if (rows.length === 0) return;
  const result = supabaseFetch('POST', '/rest/v1/preferences?on_conflict=player_id,day_of_week,block_start_utc,cycle_id',
    rows, { Prefer: 'resolution=ignore-duplicates' }
  );
  Logger.log('insertPreferences result: ' + JSON.stringify(result));
}

function supabaseFetch(method, path, body = null, extraHeaders = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      ...extraHeaders,
    },
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);
  const res = UrlFetchApp.fetch(SUPABASE_URL + path, options);
  const text = res.getContentText();
  const status = res.getResponseCode();
  Logger.log(`[${method}] ${path} → status: ${status}, body: ${text}`);
  if (status >= 400) {
    Logger.log(`Supabase 오류 [${status}] ${path}: ${text}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return null; }
}
