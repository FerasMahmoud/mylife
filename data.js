/**
 * MyLife Personal Health Tracking PWA - Data Layer
 *
 * Provides window.DataStore: the single data interface for the entire app.
 *   - IndexedDB for offline-first local storage
 *   - Google Apps Script REST API for cloud sync
 *   - Background sync engine (push/pull every 30s when online)
 *
 * Usage:
 *   await DataStore.init('https://script.google.com/macros/s/.../exec');
 *   const rows = await DataStore.get('health', { from: '2026-01-01', to: '2026-02-12' });
 *   await DataStore.save('health', { date: '2026-02-12', weight_kg: 75 });
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Column definitions for every sheet (Sheets array <==> JS object conversion)
  // ---------------------------------------------------------------------------
  const COLUMNS = {
    health:      ['date', 'weight_kg', 'bmi', 'bp_systolic', 'bp_diastolic', 'heart_rate', 'blood_sugar', 'notes'],
    medications: ['date', 'name', 'dosage', 'time', 'category', 'taken'],
    appointments:['date', 'time', 'doctor', 'specialty', 'location', 'notes'],
    fitness:     ['date', 'type', 'exercise', 'duration_min', 'sets', 'reps', 'weight_kg', 'calories_burned', 'notes'],
    nutrition:   ['date', 'meal', 'food', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'notes'],
    water:       ['date', 'time', 'amount_ml'],
    sleep:       ['date', 'bedtime', 'wake_time', 'hours', 'quality', 'notes'],
    mood:        ['date', 'time', 'mood', 'stress', 'energy', 'gratitude', 'notes'],
    meditation:  ['date', 'duration_min', 'type', 'notes'],
    habits:      ['date', 'habit_id', 'completed'],
    habit_defs:  ['id', 'name', 'icon', 'category', 'target', 'active'],
    goals:       ['id', 'type', 'title', 'target', 'current', 'deadline', 'status'],
    profile:     ['key', 'value']
  };

  // All object stores that live in IndexedDB
  const ALL_STORES = [
    'health', 'medications', 'appointments', 'fitness', 'nutrition',
    'water', 'sleep', 'mood', 'meditation', 'habits', 'habit_defs',
    'goals', 'profile', 'sync_queue'
  ];

  // Stores that have a 'date' index (everything except meta-stores)
  const DATE_INDEXED_STORES = [
    'health', 'medications', 'appointments', 'fitness', 'nutrition',
    'water', 'sleep', 'mood', 'meditation', 'habits'
  ];

  // How long before locally-cached data is considered stale (ms)
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  // Background sync interval (ms)
  const SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds

  // Maximum retries for a sync queue item before it is skipped
  const MAX_RETRIES = 3;

  // DB constants
  const DB_NAME = 'mylife-db';
  const DB_VERSION = 1;

  // Track when stores were last refreshed from the cloud
  // Key: "sheet|from|to"  Value: timestamp
  const _lastPullTimestamps = {};

  // ---------------------------------------------------------------------------
  // Helpers — Sheets array <-> JS object
  // ---------------------------------------------------------------------------

  /**
   * Convert an array (one Sheets row) into a keyed object using the column map
   * for the given sheet.
   */
  function rowArrayToObject(sheet, arr) {
    const cols = COLUMNS[sheet];
    if (!cols) return null;
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      obj[cols[i]] = (i < arr.length) ? arr[i] : null;
    }
    return obj;
  }

  /**
   * Convert a keyed object back to an ordered array suitable for Sheets.
   */
  function objectToRowArray(sheet, obj) {
    const cols = COLUMNS[sheet];
    if (!cols) return [];
    return cols.map(c => (obj[c] !== undefined && obj[c] !== null) ? obj[c] : '');
  }

  // ---------------------------------------------------------------------------
  // DataStore
  // ---------------------------------------------------------------------------

  window.DataStore = {

    /** @type {IDBDatabase|null} */
    _db: null,

    /** @type {string|null} Google Apps Script deployment URL */
    _scriptUrl: 'https://script.google.com/macros/s/AKfycbxmROAfZyDkEFUsWcqwIqAflx9UE8N37kywWDmqavqRCr_f5ph0Q__x6oIA-1ZXdvwysw/exec',

    /** @type {number|null} setInterval handle for background sync */
    _syncInterval: null,

    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    /**
     * Initialise the data store. Call once at app startup.
     *
     * @param {string} [scriptUrl] - Apps Script URL. If omitted, falls back to
     *   localStorage value or null (offline-only mode).
     * @returns {Promise<boolean>} true if IndexedDB opened successfully
     */
    async init(scriptUrl) {
      try {
        // Script URL
        if (scriptUrl) {
          this.setScriptUrl(scriptUrl);
        } else {
          this._scriptUrl = this.getScriptUrl();
        }

        // Open (or create) IndexedDB
        this._db = await this._openDB();

        // Start background sync
        this._startBackgroundSync();

        // Sync on reconnect
        window.addEventListener('online', () => {
          this.syncNow().catch(() => {});
        });

        return true;
      } catch (err) {
        console.error('[DataStore] init failed:', err);
        return false;
      }
    },

    // -----------------------------------------------------------------------
    // CRUD — get / save / update / delete
    // -----------------------------------------------------------------------

    /**
     * Read records from a store.
     *
     * Always returns instantly from IndexedDB. If online and the data is stale
     * (older than 5 minutes since last pull), a background pull is triggered.
     *
     * @param {string} sheet
     * @param {object} [options]
     * @param {string} [options.from]  - 'YYYY-MM-DD' range start (inclusive)
     * @param {string} [options.to]    - 'YYYY-MM-DD' range end (inclusive)
     * @param {string} [options.date]  - exact date filter (shortcut)
     * @param {number} [options.limit] - max records to return
     * @returns {Promise<object[]>}
     */
    async get(sheet, options = {}) {
      const db = await this._getDB();
      const tx = db.transaction(sheet, 'readonly');
      const store = tx.objectStore(sheet);

      let results = [];

      // Determine date range
      const from = options.date || options.from || null;
      const to   = options.date || options.to   || null;

      if (from && to && DATE_INDEXED_STORES.includes(sheet)) {
        // Use the date index with a key range
        const index = store.index('date');
        const range = IDBKeyRange.bound(from, to);
        results = await this._getAllFromIndex(index, range);
      } else {
        results = await this._getAllFromStore(store);
      }

      // Filter out soft-deleted records
      results = results.filter(r => !r._deleted);

      // Apply limit
      if (options.limit && options.limit > 0) {
        results = results.slice(0, options.limit);
      }

      // Trigger background pull if stale
      if (this.isOnline() && this._scriptUrl) {
        const pullKey = `${sheet}|${from || ''}|${to || ''}`;
        const lastPull = _lastPullTimestamps[pullKey] || 0;
        if (Date.now() - lastPull > STALE_THRESHOLD_MS) {
          // Fire-and-forget background pull
          this._pullFromSheets(sheet, from, to).catch(() => {});
          _lastPullTimestamps[pullKey] = Date.now();
        }
      }

      return results;
    },

    /**
     * Save (append) a new record to a store.
     *
     * The record is written to IndexedDB immediately and enqueued for sync.
     * If online, an immediate sync attempt is made in the background.
     *
     * @param {string} sheet
     * @param {object} row - data object (column names as keys)
     * @returns {Promise<object>} the saved record (with generated id)
     */
    async save(sheet, row) {
      const db = await this._getDB();
      const now = Date.now();

      const record = Object.assign({}, row, {
        _synced: false,
        _modified: now,
        _deleted: false
      });

      // Write to the sheet's store
      const id = await new Promise((resolve, reject) => {
        const tx = db.transaction(sheet, 'readwrite');
        const store = tx.objectStore(sheet);
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      record.id = id;

      // Add to sync_queue
      await this._enqueue(sheet, 'append', record);

      // Attempt immediate sync (fire-and-forget)
      if (this.isOnline() && this._scriptUrl) {
        this.syncNow().catch(() => {});
      }

      return record;
    },

    /**
     * Update an existing record.
     *
     * @param {string} sheet
     * @param {number|string} id - the record's primary key
     * @param {object} updates - partial object with fields to change
     * @returns {Promise<object|null>} updated record, or null if not found
     */
    async update(sheet, id, updates) {
      const db = await this._getDB();

      // Read existing
      const existing = await new Promise((resolve, reject) => {
        const tx = db.transaction(sheet, 'readonly');
        const store = tx.objectStore(sheet);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (!existing) return null;

      const now = Date.now();
      const updated = Object.assign({}, existing, updates, {
        _synced: false,
        _modified: now
      });

      // Write back
      await new Promise((resolve, reject) => {
        const tx = db.transaction(sheet, 'readwrite');
        const store = tx.objectStore(sheet);
        const req = store.put(updated);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      // Enqueue
      await this._enqueue(sheet, 'update', updated, updated._rowIndex || null);

      if (this.isOnline() && this._scriptUrl) {
        this.syncNow().catch(() => {});
      }

      return updated;
    },

    /**
     * Soft-delete a record. It remains in IndexedDB (marked _deleted) until
     * the deletion is synced, after which it is purged.
     *
     * @param {string} sheet
     * @param {number|string} id
     * @returns {Promise<boolean>}
     */
    async delete(sheet, id) {
      const db = await this._getDB();

      const existing = await new Promise((resolve, reject) => {
        const tx = db.transaction(sheet, 'readonly');
        const store = tx.objectStore(sheet);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      if (!existing) return false;

      const now = Date.now();
      const deleted = Object.assign({}, existing, {
        _deleted: true,
        _synced: false,
        _modified: now
      });

      await new Promise((resolve, reject) => {
        const tx = db.transaction(sheet, 'readwrite');
        const store = tx.objectStore(sheet);
        const req = store.put(deleted);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      await this._enqueue(sheet, 'delete', deleted, deleted._rowIndex || null);

      if (this.isOnline() && this._scriptUrl) {
        this.syncNow().catch(() => {});
      }

      return true;
    },

    // -----------------------------------------------------------------------
    // Profile (key-value)
    // -----------------------------------------------------------------------

    /**
     * Get the entire profile as a flat object: { height: 180, ... }
     * @returns {Promise<object>}
     */
    async getProfile() {
      const db = await this._getDB();
      const all = await new Promise((resolve, reject) => {
        const tx = db.transaction('profile', 'readonly');
        const store = tx.objectStore('profile');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      const profile = {};
      for (const item of all) {
        if (!item._deleted) {
          profile[item.key] = item.value;
        }
      }

      // Background pull if stale
      if (this.isOnline() && this._scriptUrl) {
        const pullKey = 'profile||';
        const lastPull = _lastPullTimestamps[pullKey] || 0;
        if (Date.now() - lastPull > STALE_THRESHOLD_MS) {
          this._pullFromSheets('profile', null, null).catch(() => {});
          _lastPullTimestamps[pullKey] = Date.now();
        }
      }

      return profile;
    },

    /**
     * Save or update a single profile key-value pair.
     *
     * @param {string} key
     * @param {*} value
     * @returns {Promise<object>}
     */
    async saveProfile(key, value) {
      const db = await this._getDB();
      const now = Date.now();

      const record = {
        key: key,
        value: value,
        _synced: false,
        _modified: now,
        _deleted: false
      };

      await new Promise((resolve, reject) => {
        const tx = db.transaction('profile', 'readwrite');
        const store = tx.objectStore('profile');
        const req = store.put(record); // put = upsert on keyPath 'key'
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      await this._enqueue('profile', 'update', record);

      if (this.isOnline() && this._scriptUrl) {
        this.syncNow().catch(() => {});
      }

      return record;
    },

    // -----------------------------------------------------------------------
    // Sync engine
    // -----------------------------------------------------------------------

    /**
     * @returns {boolean} true if the browser reports network connectivity
     */
    isOnline() {
      return navigator.onLine;
    },

    /**
     * Count of pending items in the sync_queue.
     * @returns {Promise<number>}
     */
    async pendingSync() {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readonly');
        const store = tx.objectStore('sync_queue');
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    /**
     * Process the entire sync queue (FIFO). Pushes local changes to Sheets,
     * then pulls today's data from Sheets.
     *
     * Stops on the first network error to preserve ordering.
     *
     * @returns {Promise<{pushed: number, pulled: number, errors: number}>}
     */
    async syncNow() {
      if (!this.isOnline() || !this._scriptUrl) {
        return { pushed: 0, pulled: 0, errors: 0 };
      }

      const db = await this._getDB();
      let pushed = 0;
      let errors = 0;

      // 1. Read all queue items in order
      const queueItems = await new Promise((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readonly');
        const store = tx.objectStore('sync_queue');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });

      // Sort by id (auto-increment guarantees FIFO order)
      queueItems.sort((a, b) => a.id - b.id);

      // 2. Process each item
      for (const item of queueItems) {
        // Skip items that have exceeded max retries
        if (item.retries >= MAX_RETRIES) {
          // Remove from queue — give up
          await this._removeFromQueue(item.id);
          errors++;
          continue;
        }

        try {
          const success = await this._pushToSheets(item);

          if (success) {
            // Mark the source record as synced
            await this._markSynced(item.sheet, item.data);
            // Remove from queue
            await this._removeFromQueue(item.id);
            // If it was a delete, purge the soft-deleted record
            if (item.action === 'delete') {
              await this._purgeDeleted(item.sheet, item.data);
            }
            pushed++;
          } else {
            // Non-network failure (e.g. server returned success:false)
            await this._incrementRetries(item.id, item.retries);
            errors++;
          }
        } catch (err) {
          // Network error — stop processing to preserve order
          console.warn('[DataStore] sync network error, stopping queue:', err.message);
          await this._incrementRetries(item.id, item.retries);
          errors++;
          break;
        }
      }

      // 3. Pull today's data for common stores
      let pulled = 0;
      const today = this._today();
      const pullStores = DATE_INDEXED_STORES;

      for (const sheet of pullStores) {
        try {
          const count = await this._pullFromSheets(sheet, today, today);
          pulled += count;
        } catch (_) {
          // Non-critical — swallow
        }
      }

      const result = { pushed, pulled, errors };

      // Dispatch event
      try {
        window.dispatchEvent(new CustomEvent('mylife-sync', { detail: result }));
      } catch (_) {}

      return result;
    },

    // -----------------------------------------------------------------------
    // Pull from Sheets
    // -----------------------------------------------------------------------

    /**
     * Fetch rows from Sheets and merge into IndexedDB.
     *
     * Merge strategy (last-write-wins):
     *  - If a row from Sheets does not exist locally, insert it.
     *  - If it exists locally with a newer _modified, keep local.
     *  - Otherwise, update local with the Sheets version.
     *
     * @param {string} sheet
     * @param {string|null} from
     * @param {string|null} to
     * @returns {Promise<number>} count of records merged
     */
    async _pullFromSheets(sheet, from, to) {
      if (!this._scriptUrl) return 0;

      let url = `${this._scriptUrl}?action=read&sheet=${encodeURIComponent(sheet)}`;
      if (from) url += `&from=${encodeURIComponent(from)}`;
      if (to)   url += `&to=${encodeURIComponent(to)}`;

      const resp = await fetch(url, { mode: 'cors' });
      const json = await resp.json();

      if (!json.success || !Array.isArray(json.data)) return 0;

      const db = await this._getDB();
      let merged = 0;

      for (let i = 0; i < json.data.length; i++) {
        const rowArr = json.data[i];
        const obj = rowArrayToObject(sheet, rowArr);
        if (!obj) continue;

        // Attach the Sheets row index (1-based, header is row 0, so data row
        // i corresponds to sheet row i+1 — but Apps Script may use its own
        // indexing; we store i as the data index).
        obj._sheetRowIndex = i;
        obj._synced = true;
        obj._modified = Date.now();
        obj._deleted = false;

        // Attempt to find a matching local record
        const match = await this._findMatchingRecord(db, sheet, obj);

        if (!match) {
          // New record from Sheets — insert
          await new Promise((resolve, reject) => {
            const tx = db.transaction(sheet, 'readwrite');
            const store = tx.objectStore(sheet);
            // For profile store, use put (keyPath is 'key')
            const req = (sheet === 'profile' || sheet === 'habit_defs' || sheet === 'goals')
              ? store.put(obj)
              : store.add(obj);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
          merged++;
        } else {
          // Exists locally — keep whichever is newer
          if (match._synced === false && match._modified > obj._modified) {
            // Local version is newer and unsynced — keep it
            continue;
          }
          // Sheets version wins (or local was already synced)
          const updated = Object.assign({}, match, obj, {
            id: match.id, // preserve local PK
            _rowIndex: obj._sheetRowIndex
          });
          await new Promise((resolve, reject) => {
            const tx = db.transaction(sheet, 'readwrite');
            const store = tx.objectStore(sheet);
            const req = store.put(updated);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
          merged++;
        }
      }

      return merged;
    },

    // -----------------------------------------------------------------------
    // Push to Sheets
    // -----------------------------------------------------------------------

    /**
     * Send a single sync queue item to Sheets.
     *
     * @param {object} queueItem
     * @returns {Promise<boolean>} true if the server accepted
     * @throws on network error
     */
    async _pushToSheets(queueItem) {
      const { sheet, action, data, rowIndex } = queueItem;
      const url = this._scriptUrl;
      let body;

      switch (action) {
        case 'append':
          body = {
            sheet: sheet,
            rows: [objectToRowArray(sheet, data)]
          };
          return await this._postToSheets(url, 'append', body);

        case 'update':
          if (sheet === 'profile') {
            // Profile updates use write action
            body = {
              sheet: sheet,
              rows: [objectToRowArray(sheet, data)]
            };
            return await this._postToSheets(url, 'write', body);
          }
          body = {
            sheet: sheet,
            rowIndex: rowIndex || data._rowIndex || data._sheetRowIndex || null,
            row: objectToRowArray(sheet, data)
          };
          return await this._postToSheets(url, 'update', body);

        case 'delete':
          body = {
            sheet: sheet,
            rowIndex: rowIndex || data._rowIndex || data._sheetRowIndex || null
          };
          return await this._postToSheets(url, 'delete', body);

        default:
          console.warn('[DataStore] unknown sync action:', action);
          return false;
      }
    },

    /**
     * POST helper for Apps Script.
     *
     * @param {string} url
     * @param {string} action
     * @param {object} body
     * @returns {Promise<boolean>}
     * @throws on network failure
     */
    async _postToSheets(url, action, body) {
      const fullUrl = `${url}?action=${encodeURIComponent(action)}`;
      const resp = await fetch(fullUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await resp.json();
      return json.success === true;
    },

    // -----------------------------------------------------------------------
    // Sync queue helpers
    // -----------------------------------------------------------------------

    /**
     * Add an operation to the sync queue.
     */
    async _enqueue(sheet, action, data, rowIndex) {
      const db = await this._getDB();
      const entry = {
        sheet: sheet,
        action: action,
        data: Object.assign({}, data),
        rowIndex: rowIndex || null,
        timestamp: Date.now(),
        retries: 0
      };
      await new Promise((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');
        const req = store.add(entry);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },

    /**
     * Remove a processed item from the sync queue.
     */
    async _removeFromQueue(queueId) {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');
        const req = store.delete(queueId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    /**
     * Increment the retry counter for a queue item.
     */
    async _incrementRetries(queueId, currentRetries) {
      const db = await this._getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('sync_queue', 'readwrite');
        const store = tx.objectStore('sync_queue');
        const getReq = store.get(queueId);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.retries = (currentRetries || 0) + 1;
            const putReq = store.put(item);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
          } else {
            resolve();
          }
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    /**
     * After a successful push, mark the corresponding local record as synced.
     */
    async _markSynced(sheet, data) {
      if (!data || data.id === undefined) return;
      const db = await this._getDB();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(sheet, 'readwrite');
          const store = tx.objectStore(sheet);
          const key = (sheet === 'profile') ? data.key : data.id;
          const req = store.get(key);
          req.onsuccess = () => {
            const rec = req.result;
            if (rec) {
              rec._synced = true;
              const putReq = store.put(rec);
              putReq.onsuccess = () => resolve();
              putReq.onerror = () => reject(putReq.error);
            } else {
              resolve();
            }
          };
          req.onerror = () => reject(req.error);
        });
      } catch (_) {
        // Non-critical
      }
    },

    /**
     * Permanently remove a soft-deleted record from IndexedDB after it has
     * been synced to Sheets.
     */
    async _purgeDeleted(sheet, data) {
      if (!data) return;
      const db = await this._getDB();
      const key = (sheet === 'profile') ? data.key : data.id;
      if (key === undefined) return;
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(sheet, 'readwrite');
          const store = tx.objectStore(sheet);
          const req = store.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch (_) {}
    },

    /**
     * Try to find an existing local record that matches a pulled Sheets row.
     *
     * Matching heuristic:
     *  - profile: match on 'key'
     *  - habit_defs / goals: match on 'id'
     *  - date-indexed stores: match on date + primary identifying column(s)
     */
    async _findMatchingRecord(db, sheet, obj) {
      // Profile — match on key
      if (sheet === 'profile') {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(sheet, 'readonly');
          const store = tx.objectStore(sheet);
          const req = store.get(obj.key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      }

      // habit_defs / goals — match on id
      if (sheet === 'habit_defs' || sheet === 'goals') {
        if (obj.id) {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction(sheet, 'readonly');
            const store = tx.objectStore(sheet);
            const req = store.get(obj.id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
          });
        }
        return null;
      }

      // Date-indexed stores: look for records with the same date and check
      // for a "natural key" match (e.g., same date + same exercise name)
      if (obj.date && DATE_INDEXED_STORES.includes(sheet)) {
        const candidates = await new Promise((resolve, reject) => {
          const tx = db.transaction(sheet, 'readonly');
          const store = tx.objectStore(sheet);
          const index = store.index('date');
          const req = index.getAll(obj.date);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });

        // Identify the "natural key" columns per sheet for deduplication
        const naturalKeys = {
          health:       ['date'],
          medications:  ['date', 'name', 'time'],
          appointments: ['date', 'time', 'doctor'],
          fitness:      ['date', 'type', 'exercise'],
          nutrition:    ['date', 'meal', 'food'],
          water:        ['date', 'time'],
          sleep:        ['date'],
          mood:         ['date', 'time'],
          meditation:   ['date', 'type'],
          habits:       ['date', 'habit_id']
        };

        const keys = naturalKeys[sheet] || ['date'];
        for (const cand of candidates) {
          const matches = keys.every(k => {
            const a = (cand[k] !== undefined && cand[k] !== null) ? String(cand[k]) : '';
            const b = (obj[k] !== undefined && obj[k] !== null) ? String(obj[k]) : '';
            return a === b;
          });
          if (matches) return cand;
        }
      }

      return null;
    },

    // -----------------------------------------------------------------------
    // Background sync
    // -----------------------------------------------------------------------

    _startBackgroundSync() {
      if (this._syncInterval) {
        clearInterval(this._syncInterval);
      }
      this._syncInterval = setInterval(() => {
        if (this.isOnline() && this._scriptUrl) {
          this.syncNow().catch(() => {});
        }
      }, SYNC_INTERVAL_MS);
    },

    // -----------------------------------------------------------------------
    // Script URL management
    // -----------------------------------------------------------------------

    /**
     * Store the Apps Script URL both in memory and localStorage.
     * @param {string} url
     */
    setScriptUrl(url) {
      this._scriptUrl = url;
      try {
        localStorage.setItem('mylife-script-url', url);
      } catch (_) {}
    },

    /**
     * Retrieve the Apps Script URL.
     * @returns {string|null}
     */
    getScriptUrl() {
      return this._scriptUrl || localStorage.getItem('mylife-script-url') || null;
    },

    // -----------------------------------------------------------------------
    // Connection test
    // -----------------------------------------------------------------------

    /**
     * Test connectivity to the Apps Script backend by reading the profile
     * sheet.
     * @returns {Promise<boolean>}
     */
    async testConnection() {
      const url = this.getScriptUrl();
      if (!url) return false;
      try {
        const resp = await fetch(`${url}?action=read&sheet=profile`, { mode: 'cors' });
        const json = await resp.json();
        return json.success === true;
      } catch (_) {
        return false;
      }
    },

    // -----------------------------------------------------------------------
    // Export / clear
    // -----------------------------------------------------------------------

    /**
     * Export every store's contents as a single JSON object.
     * @returns {Promise<object>}
     */
    async exportAll() {
      const db = await this._getDB();
      const exported = {};

      for (const storeName of ALL_STORES) {
        try {
          const records = await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          });
          exported[storeName] = records;
        } catch (_) {
          exported[storeName] = [];
        }
      }

      return exported;
    },

    /**
     * Delete and recreate the entire IndexedDB database.
     * @returns {Promise<boolean>}
     */
    async clearLocal() {
      // Stop background sync
      if (this._syncInterval) {
        clearInterval(this._syncInterval);
        this._syncInterval = null;
      }

      // Close existing connection
      if (this._db) {
        this._db.close();
        this._db = null;
      }

      // Delete
      await new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve(); // proceed even if blocked
      });

      // Recreate
      this._db = await this._openDB();

      // Restart background sync
      this._startBackgroundSync();

      return true;
    },

    // -----------------------------------------------------------------------
    // Today helper
    // -----------------------------------------------------------------------

    _today() {
      return new Date().toISOString().split('T')[0];
    },

    // -----------------------------------------------------------------------
    // IndexedDB primitives
    // -----------------------------------------------------------------------

    /**
     * Returns the database, opening it if necessary.
     * @returns {Promise<IDBDatabase>}
     */
    async _getDB() {
      if (this._db) return this._db;
      this._db = await this._openDB();
      return this._db;
    },

    /**
     * Open (or upgrade) the IndexedDB.
     * @returns {Promise<IDBDatabase>}
     */
    _openDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = event.target.result;

          // Date-indexed stores
          for (const name of DATE_INDEXED_STORES) {
            if (!db.objectStoreNames.contains(name)) {
              const store = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
              store.createIndex('date', 'date', { unique: false });
            }
          }

          // habit_defs — keyPath id, no date index
          if (!db.objectStoreNames.contains('habit_defs')) {
            db.createObjectStore('habit_defs', { keyPath: 'id', autoIncrement: true });
          }

          // goals — keyPath id, no date index
          if (!db.objectStoreNames.contains('goals')) {
            db.createObjectStore('goals', { keyPath: 'id', autoIncrement: true });
          }

          // profile — keyPath is 'key'
          if (!db.objectStoreNames.contains('profile')) {
            db.createObjectStore('profile', { keyPath: 'key' });
          }

          // sync_queue — auto-increment id
          if (!db.objectStoreNames.contains('sync_queue')) {
            db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
          }
        };

        request.onsuccess = (event) => {
          resolve(event.target.result);
        };

        request.onerror = (event) => {
          reject(event.target.error);
        };
      });
    },

    /**
     * Convenience: get a transaction + object store.
     * @param {string} sheet
     * @param {string} [mode='readonly']
     * @returns {{tx: IDBTransaction, store: IDBObjectStore}}
     */
    _getStore(sheet, mode) {
      mode = mode || 'readonly';
      const tx = this._db.transaction(sheet, mode);
      const store = tx.objectStore(sheet);
      return { tx, store };
    },

    /**
     * Read all records from an IDBObjectStore.
     * @returns {Promise<object[]>}
     */
    _getAllFromStore(store) {
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    /**
     * Read all records from an IDBIndex within an optional key range.
     * @param {IDBIndex} index
     * @param {IDBKeyRange} [range]
     * @returns {Promise<object[]>}
     */
    _getAllFromIndex(index, range) {
      return new Promise((resolve, reject) => {
        const req = range ? index.getAll(range) : index.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
  };
})();
