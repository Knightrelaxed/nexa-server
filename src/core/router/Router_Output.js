/**
 * ============================================================
 * [N.E.X.A] router/Router_Output.js
 * Normalisasi & pembersihan output LLM (em-dash, domain aksi, struktur routing)
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

/**
 * Normalizes router output to guarantee multi-action array and backwards compatibility.
 */
function _normalizeRoutingOutput(routingData, sentimentScore, meta = {}) {
  if (!routingData || typeof routingData !== 'object') {
    return {
      intent: 'NORMAL_CHAT',
      actions: [{ intent: 'NORMAL_CHAT', extracted_data: {} }],
      extracted_data: {},
      reply_message: '',
      mood: sentimentScore || 'NEUTRAL',
      god_mode_trigger: false,
      _injectedTraits: meta.injectedTraits || [],
      _injectedPlaybook: meta.injectedPlaybook || null,
      _topicContext: meta.topicContext || 'DEFAULT'
    };
  }

  // Normalize multi-action array
  if (Array.isArray(routingData.actions) && routingData.actions.length > 0) {
    if (!routingData.intent) {
      routingData.intent = routingData.actions[0].intent || 'NORMAL_CHAT';
    }
    if (!routingData.extracted_data || Object.keys(routingData.extracted_data).length === 0) {
      routingData.extracted_data = routingData.actions[0].extracted_data || {};
    }
    if ((!routingData.actions[0].extracted_data || Object.keys(routingData.actions[0].extracted_data).length === 0) && routingData.extracted_data) {
      routingData.actions[0].extracted_data = routingData.extracted_data;
    }
  } else if (routingData.intent) {
    routingData.actions = [{
      intent: routingData.intent,
      extracted_data: routingData.extracted_data || {}
    }];
  } else {
    routingData.intent = 'NORMAL_CHAT';
    routingData.actions = [{ intent: 'NORMAL_CHAT', extracted_data: {} }];
    routingData.extracted_data = {};
  }

  // Defensively normalize any action names back to their parent domain
  for (const act of routingData.actions) {
    _fixActionDomain(act);
  }
  if (routingData.actions.length > 0) {
    routingData.intent = routingData.actions[0].intent || 'NORMAL_CHAT';
    routingData.extracted_data = routingData.actions[0].extracted_data || {};
  }

  const detectedMood = (sentimentScore !== 'NEUTRAL') ? sentimentScore : (routingData.mood || 'NEUTRAL');
  routingData.mood = String(detectedMood).toUpperCase();
  if (typeof routingData.reply_message === 'string') {
    routingData.reply_message = _cleanEmDashes(routingData.reply_message);
  }
  routingData._injectedTraits = meta.injectedTraits || [];
  routingData._injectedPlaybook = meta.injectedPlaybook || null;
  routingData._topicContext = meta.topicContext || 'DEFAULT';
  return routingData;
}

const _FINANCE_ACTION_NAMES = new Set([
  'RECORD', 'RECORD_MULTIPLE', 'READ_LATEST', 'READ_ANALYTICS', 'EDIT', 'DELETE',
  'UNDO_DELETE', 'IMPORT_FROM_EMAIL', 'CONFIRM_TRANSACTION', 'UPDATE_PENDING',
  'CANCEL_TRANSACTION', 'CATEGORY_BREAKDOWN', 'PERIOD_COMPARISON', 'TOP_EXPENSES',
  'ACCOUNT_BALANCES', 'DAILY_TREND', 'SMART_SUMMARY', 'MONTHLY_SUMMARY',
  'SAVING_RATE', 'BALANCE_TREND'
]);

const _DEVICE_ACTION_NAMES = new Set([
  'TOGGLE_FLASHLIGHT', 'LOCK_SCREEN', 'GO_HOME_SCREEN', 'GO_BACK', 'SHOW_RECENTS',
  'SET_VOLUME', 'FORCE_DND', 'GET_BATTERY_STATUS', 'GET_SCREEN_STATUS', 'GET_LIGHT_STATUS', 'GET_NETWORK_INFO', 'TOGGLE_WIFI',
  'SPEAK_TEXT', 'TAKE_PHOTO', 'TAKE_SCREENSHOT', 'DUMP_UI_HIERARCHY', 'LAUNCH_APP'
]);

function _fixActionDomain(act) {
  if (!act || typeof act !== 'object') return;
  const it = String(act.intent || '').toUpperCase();
  const ed = act.extracted_data || {};

  if (_FINANCE_ACTION_NAMES.has(it) || (ed && ed.nominal && it !== 'FINANCE')) {
    act.extracted_data = { ...ed, action: ed.action || it };
    act.intent = 'FINANCE';
  } else if (_DEVICE_ACTION_NAMES.has(it)) {
    act.extracted_data = { ...ed, action: ed.action || it };
    act.intent = 'DEVICE_CONTROL';
  } else if (it === 'CREATE' || it === 'CREATE_MULTIPLE' || it === 'READ_TODAY' || it === 'READ_TOMORROW' || it === 'READ_UPCOMING') {
    if (ed.summary || ed.start || ed.events || ed.semester_start) {
      act.extracted_data = { ...ed, action: ed.action || it };
      act.intent = 'CALENDAR';
    } else if (ed.title || ed.dueDate || ed.tasks) {
      act.extracted_data = { ...ed, action: ed.action || it };
      act.intent = 'TASK';
    }
  }
}

/**
 * Clean em-dashes and en-dashes from any text string to keep language natural and non-robotic.
 */
function _cleanEmDashes(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ', ')
    .replace(/\s+,/g, ',')
    .trim();
}

module.exports = {
  _normalizeRoutingOutput,
  _FINANCE_ACTION_NAMES,
  _DEVICE_ACTION_NAMES,
  _fixActionDomain,
  _cleanEmDashes
};
