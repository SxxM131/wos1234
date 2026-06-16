/**
 * Google Form → Vercel webhook → Supabase
 *
 * Supabase sb_secret_ keys reject Google Apps Script's User-Agent, so this script
 * never calls Supabase directly. Set WEBHOOK_URL and WEBHOOK_SECRET in Script properties.
 *
 * Sheet row layout (email collection OFF):
 *   row[0] timestamp, row[1] Player ID, row[2] Player Name, row[3] Alliance, ...
 *
 * Re-submits for the same Player ID replace the entire application server-side
 * (DELETE + INSERT preferences for that cycle).
 */
const WEBHOOK_URL = "https://wos1234.vercel.app/api/google-form-submit";

function onFormSubmit(e) {
  const row = e.values;
  Logger.log("row 전체: " + JSON.stringify(row));

  const playerId = parseInt(String(row[1]).split(".")[0], 10);
  const name = row[2];
  const alliance = row[3];
  const speedupMon = Number(row[4]);
  const monBlocks = parseBlocks(row[5]);
  const speedupTue = Number(row[6]);
  const tueBlocks = parseBlocks(row[7]);
  const speedupThu = Number(row[8]);
  const thuBlocks = parseBlocks(row[9]);

  Logger.log("playerId: " + playerId);

  if (isNaN(playerId)) {
    Logger.log("유효하지 않은 Player ID: " + row[1]);
    return;
  }

  const payload = {
    player_id: playerId,
    name: name,
    alliance: alliance,
    days: {
      mon: { speedup: speedupMon, blocks: monBlocks },
      tue: { speedup: speedupTue, blocks: tueBlocks },
      thu: { speedup: speedupThu, blocks: thuBlocks },
    },
  };

  const result = postToWebhook(payload);
  if (!result) {
    Logger.log("웹훅 호출 실패 — playerId: " + playerId);
    return;
  }

  Logger.log(
    "웹훅 응답 [" + result.status + "]: " + JSON.stringify(result.body)
  );

  if (result.status >= 200 && result.status < 300 && result.body.success) {
    Logger.log("신청 완료: " + playerId);
  } else {
    Logger.log("신청 거부 또는 오류: " + playerId);
  }
}

/** Run once in editor to verify webhook URL + secret. */
function testWebhookConnection() {
  const result = postToWebhook({
    player_id: 0,
    name: "__connection_test__",
    alliance: "NWO",
    days: {},
  });
  if (!result) {
    Logger.log("FAIL — no response");
    return;
  }
  Logger.log("status: " + result.status + ", body: " + JSON.stringify(result.body));
  if (result.status === 400 || result.status === 409) {
    Logger.log("OK — webhook reachable (validation rejected test payload as expected)");
  } else if (result.status === 401) {
    Logger.log("FAIL — check WEBHOOK_SECRET in Script properties");
  } else if (result.status === 503) {
    Logger.log("FAIL — GOOGLE_FORM_WEBHOOK_SECRET not set on Vercel");
  }
}

function parseBlocks(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map(function (s) {
      var m = s.trim().match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter(function (n) {
      return !isNaN(n);
    });
}

function getWebhookConfig() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("WEBHOOK_URL") || WEBHOOK_URL;
  const secret = props.getProperty("WEBHOOK_SECRET");
  if (!secret) {
    Logger.log("WEBHOOK_SECRET 스크립트 속성이 없습니다.");
    return null;
  }
  return { url: url, secret: secret };
}

function postToWebhook(payload) {
  const config = getWebhookConfig();
  if (!config) return null;

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-Webhook-Secret": config.secret,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const res = UrlFetchApp.fetch(config.url, options);
  const status = res.getResponseCode();
  const text = res.getContentText();
  var body = null;
  try {
    body = JSON.parse(text);
  } catch (e) {
    body = { raw: text };
  }
  return { status: status, body: body };
}
