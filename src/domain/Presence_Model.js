/**
 * ============================================================
 * N.E.X.A — PRESENCE MODEL (Presence_Model.js)
 * Real-time Physical Situational & Environmental Context
 * ============================================================
 * Tracks real-time physical telemetry streamed from Android Sensor ContextEngine:
 * Geofence location, room light lux/condition, screen state, battery, and last physical events.
 * Provides toPromptBlock() for rich situational awareness in Live Voice & Router.
 * ============================================================
 */

'use strict';

class PresenceModel {
  constructor() {
    this.place = null;
    this.placeAt = null;
    this.light = null; // { condition: string, lux: number|null, at: number }
    this.isScreenOn = null;
    this.batteryLevel = null;
    this.lastPickupAt = null;
    this.lastEvent = null;
    this.lastEventAt = null;
  }

  updateFromContextEvent(event, report = {}) {
    if (!event) return;
    const now = Date.now();
    const d = report.details || report;
    this.lastEvent = event;
    this.lastEventAt = now;

    // 1. Geofence Location Mapping
    const PLACES = {
      USER_ARRIVED_HOME: 'RUMAH',
      USER_LEFT_HOME:    'LUAR_RUMAH',
      USER_ARRIVED_WORK: 'KAMPUS',
      USER_LEFT_WORK:    'LUAR_KAMPUS'
    };

    if (PLACES[event]) {
      this.place = PLACES[event];
      this.placeAt = now;
    } else if (event.startsWith('GEOFENCE_ENTER_')) {
      this.place = event.slice(15);
      this.placeAt = now;
    } else if (event.startsWith('GEOFENCE_EXIT_')) {
      this.place = 'LUAR';
      this.placeAt = now;
    }

    // 2. Light & Ambient Room Condition
    const rawLux = (d.lux !== undefined && d.lux !== null) ? Number(d.lux) : (typeof report.lux === 'number' ? report.lux : null);
    const rawState = String(d.state || report.state || report.condition || '').toUpperCase();

    const isLightEvent = event === 'ROOM_DARK_NIGHT' ||
                         event === 'LIGHT_CHANGED' ||
                         (rawLux !== null && Number.isFinite(rawLux)) ||
                         rawState === 'DARK' ||
                         rawState === 'BRIGHT';

    if (isLightEvent) {
      let condition = 'NORMAL';
      if (event === 'ROOM_DARK_NIGHT' || rawState === 'DARK' || (rawLux !== null && rawLux < 15)) {
        condition = 'GELAP';
      } else if (rawState === 'BRIGHT' || (rawLux !== null && rawLux > 100)) {
        condition = 'TERANG';
      }

      this.light = {
        condition,
        lux: (rawLux !== null && Number.isFinite(rawLux)) ? rawLux : (this.light?.lux ?? null),
        at: now
      };
    }

    // 3. Physical Device Pickup
    if (event.includes('PICKUP')) {
      this.lastPickupAt = now;
    }
  }

  _ago(ts) {
    if (!ts) return null;
    const minutes = Math.round((Date.now() - ts) / 60000);
    return minutes <= 0 ? 'baru saja' : `${minutes}m lalu`;
  }

  toPromptBlock() {
    const lines = [];

    const placeStr = this.place
      ? `${this.place}${this.placeAt ? ` (${this._ago(this.placeAt)})` : ''}`
      : 'Belum diketahui';
    lines.push(`- Lokasi Fisik: ${placeStr}`);

    let lightStr = 'Belum diketahui';
    if (this.light) {
      const luxStr = this.light.lux !== null ? ` (${this.light.lux} lux)` : '';
      const ageStr = this.light.at ? ` (${this._ago(this.light.at)})` : '';
      lightStr = `${this.light.condition}${luxStr}${ageStr}`;
    }
    lines.push(`- Kondisi Cahaya: ${lightStr}`);

    const screenStr = this.isScreenOn === null
      ? 'Belum diketahui'
      : (this.isScreenOn ? 'Menyala' : 'Mati');
    lines.push(`- Layar HP: ${screenStr}`);

    if (this.batteryLevel !== null) {
      lines.push(`- Baterai HP: ${this.batteryLevel}%`);
    }

    const pickupStr = this.lastPickupAt
      ? new Date(this.lastPickupAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'
      : 'Belum tercatat';
    lines.push(`- Terakhir Angkat HP: ${pickupStr}`);

    if (this.lastEvent) {
      const eventAge = this.lastEventAt ? ` (${this._ago(this.lastEventAt)})` : '';
      lines.push(`- Sensor Terakhir: ${this.lastEvent}${eventAge}`);
    }

    return `\n\n[SITUASI FISIK TUAN (TELEMETRI SENSOR)]:
${lines.join('\n')}
Gunakan informasi ini sebagai konteks pendukung alami saat relevan. Jangan membaca rincian sensor seperti robot.`;
  }

  snapshot() {
    return {
      place: this.place,
      placeAt: this.placeAt,
      light: this.light,
      isScreenOn: this.isScreenOn,
      batteryLevel: this.batteryLevel,
      lastPickupAt: this.lastPickupAt,
      lastEvent: this.lastEvent,
      lastEventAt: this.lastEventAt
    };
  }
}

module.exports = new PresenceModel();
