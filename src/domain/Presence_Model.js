/**
 * ============================================================
 * N.E.X.A — PRESENCE MODEL (Presence_Model.js)
 * Real-time Physical Situational & Environmental Context
 * ============================================================
 * Tracks real-time physical telemetry streamed from Android Sensor ContextEngine:
 * Geofence location, room light lux, screen state, battery, and last physical events.
 * Provides toPromptBlock() for rich situational awareness in Live Voice & Router.
 * ============================================================
 */

'use strict';

class PresenceModel {
  constructor() {
    this.place = 'UNKNOWN';
    this.lightCondition = 'NORMAL';
    this.lightLux = 50;
    this.isScreenOn = false;
    this.batteryLevel = null;
    this.lastPickupAt = null;
    this.lastEvent = null;
    this.updatedAt = Date.now();
  }

  updateFromContextEvent(event, report = {}) {
    if (!event) return;
    this.lastEvent = event;
    this.updatedAt = Date.now();

    if (event === 'USER_ARRIVED_HOME') this.place = 'RUMAH';
    else if (event === 'USER_LEFT_HOME') this.place = 'LUAR_RUMAH';
    else if (event === 'USER_ARRIVED_WORK') this.place = 'KAMPUS';

    if (event === 'LIGHT_CHANGED' || report.lux !== undefined) {
      this.lightLux = typeof report.lux === 'number' ? report.lux : this.lightLux;
      this.lightCondition = report.condition || (this.lightLux < 15 ? 'GELAP' : this.lightLux > 100 ? 'TERANG' : 'NORMAL');
    }

    if (event.includes('PICKUP')) {
      this.lastPickupAt = Date.now();
    }
  }

  toPromptBlock() {
    const ageMinutes = Math.round((Date.now() - this.updatedAt) / 60000);
    const pickupStr = this.lastPickupAt
      ? new Date(this.lastPickupAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB'
      : 'Belum tercatat';

    return `\n\n[SITUASI FISIK TUAN SAAT INI (Update ${ageMinutes}m lalu)]:
• Lokasi Geofence: ${this.place}
• Kondisi Cahaya: ${this.lightCondition} (${this.lightLux} lux)
• Waktu Terakhir Angkat HP: ${pickupStr}
• Kejadian Sensor Terakhir: ${this.lastEvent || 'Standby'}`;
  }

  snapshot() {
    return {
      place: this.place,
      lightCondition: this.lightCondition,
      lightLux: this.lightLux,
      isScreenOn: this.isScreenOn,
      batteryLevel: this.batteryLevel,
      lastPickupAt: this.lastPickupAt,
      lastEvent: this.lastEvent,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = new PresenceModel();
