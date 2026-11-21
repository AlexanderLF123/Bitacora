/**
 * Servidor Local para Bitácora Vehicular
 * Funciona de manera nativa con Node.js (sin necesidad de paquetes npm externos).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3050;
let currentPort = DEFAULT_PORT;
const DATA_FILE = path.join(__dirname, 'data', 'bitacora.json');
const FIREBASE_URL = process.env.FIREBASE_URL || 'https://bitacora-vehicular-348b6-default-rtdb.firebaseio.com/bitacora.json';

// --- FIREBASE REST CLIENT (NATIVO, SIN DEPENDENCIAS NPM) ---
function readFirebase() {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(FIREBASE_URL);
      const req = https.get(parsed, { timeout: 10000 }, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.warn(`[Firebase] GET HTTP ${res.statusCode}`);
          return resolve(null);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            console.error('[Firebase] Error al parsear JSON recibido:', e.message);
            resolve(null);
          }
        });
      });
      req.on('error', (err) => {
        console.error('[Firebase] Error de red en GET:', err.message);
        resolve(null);
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn('[Firebase] Timeout en GET');
        resolve(null);
      });
    } catch (e) {
      console.error('[Firebase] Error inesperado en readFirebase:', e.message);
      resolve(null);
    }
  });
}

function writeFirebase(data) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(data);
      const parsed = new URL(FIREBASE_URL);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + (parsed.search || ''),
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 15000
      };
      const req = https.request(options, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Firebase] Datos guardados permanentemente en la nube (${new Date().toLocaleTimeString()}).`);
            resolve(true);
          } else {
            console.warn(`[Firebase] PUT HTTP ${res.statusCode}:`, respData);
            resolve(false);
          }
        });
      });
      req.on('error', (err) => {
        console.error('[Firebase] Error de red en PUT:', err.message);
        resolve(false);
      });
      req.on('timeout', () => {
        req.destroy();
        console.warn('[Firebase] Timeout en PUT');
        resolve(false);
      });
      req.write(payload);
      req.end();
    } catch (e) {
      console.error('[Firebase] Error inesperado en writeFirebase:', e.message);
      resolve(false);
    }
  });
}

// Cargar o inicializar base de datos local
function loadLocalData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      let raw = fs.readFileSync(DATA_FILE, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
      }
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error al leer base de datos local:', err);
  }
  return { usuarios: [], vehiculos: [], mantenimiento: {}, registros: [], checklistItems: [], checklistMaquinaria: [], apariencia: {} };
}

function saveLocalData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error al guardar base de datos local:', err);
    return false;
  }
}

let db = loadLocalData();

// Sincronización continua con Firebase
let isSavingToFirebase = false;
let pendingFirebaseSave = false;

function saveData(data) {
  // 1. Guardado inmediato en disco local
  saveLocalData(data);

  // 2. Sincronización asíncrona a Firebase en segundo plano
  if (isSavingToFirebase) {
    pendingFirebaseSave = true;
    return true;
  }
  isSavingToFirebase = true;
  writeFirebase(data).finally(() => {
    isSavingToFirebase = false;
    if (pendingFirebaseSave) {
      pendingFirebaseSave = false;
      saveData(db);
    }
  });
  return true;
}

// Inicialización asíncrona de Firebase al arrancar el servidor
async function initFirebaseSync() {
  console.log('[Firebase] Conectando con Firebase Realtime Database...');
  const remoteData = await readFirebase();
  if (remoteData && typeof remoteData === 'object' && (Array.isArray(remoteData.usuarios) || Array.isArray(remoteData.vehiculos))) {
    console.log(`[Firebase] Sincronización exitosa desde la nube:`);
    console.log(` - Registros: ${(remoteData.registros || []).length}`);
    console.log(` - Vehículos: ${(remoteData.vehiculos || []).length}`);
    console.log(` - Usuarios: ${(remoteData.usuarios || []).length}`);
    db = {
      ...db,
      ...remoteData,
      usuarios: Array.isArray(remoteData.usuarios) ? remoteData.usuarios : (db.usuarios || []),
      vehiculos: Array.isArray(remoteData.vehiculos) ? remoteData.vehiculos : (db.vehiculos || []),
      registros: Array.isArray(remoteData.registros) ? remoteData.registros : (db.registros || []),
      mantenimiento: (remoteData.mantenimiento && typeof remoteData.mantenimiento === 'object') ? remoteData.mantenimiento : (db.mantenimiento || {}),
      checklistItems: remoteData.checklistItems || db.checklistItems || [],
      checklistMaquinaria: remoteData.checklistMaquinaria || db.checklistMaquinaria || [],
      apariencia: remoteData.apariencia || db.apariencia || {}
    };
    saveLocalData(db);
  } else {
    console.log('[Firebase] Base de datos vacía o inicializando. Subiendo copia inicial a Firebase...');
    await writeFirebase(db);
    console.log('[Firebase] Datos iniciales sincronizados en la nube.');
  }
}

// Iniciar sincronización de inmediato
initFirebaseSync();

// Helper para leer body JSON
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload demasiado grande'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // --- API ROUTING ---
  if (pathname.startsWith('/api/')) {
    try {
      // Health / Version check
      if (pathname === '/api/version' && req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          version: '2.1.0-firebase-sync',
          firebaseConnected: true,
          timestamp: new Date().toISOString()
        });
      }

      // Login
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const { usuario, pass } = await parseJsonBody(req);
        const cleanUser = String(usuario || '').trim().toLowerCase();
        const user = db.usuarios.find(u => u.usuario.toLowerCase() === cleanUser && u.pass === pass);
        if (!user) {
          return sendJson(res, 401, { error: 'Usuario o contraseña incorrectos' });
        }
        const { pass: _, ...safeUser } = user;
        return sendJson(res, 200, { ok: true, user: safeUser });
      }

      // Obtener todos los datos (Bootstrap)
      if (pathname === '/api/data' && req.method === 'GET') {
        // Devolvemos los datos (sin passwords expuestas salvo que sea necesario)
        const safeUsers = db.usuarios.map(u => ({
          id: u.id,
          usuario: u.usuario,
          nombre: u.nombre,
          rol: u.rol,
          unidad: u.unidad,
          placa: u.placa
        }));
        return sendJson(res, 200, {
          usuarios: safeUsers,
          vehiculos: db.vehiculos || [],
          mantenimiento: db.mantenimiento || {},
          registros: db.registros || [],
          checklistItems: db.checklistItems || [],
          checklistMaquinaria: db.checklistMaquinaria || [],
          apariencia: db.apariencia || {}
        });
      }

      // Crear nuevo registro de salida
      if (pathname === '/api/registros' && req.method === 'POST') {
        const item = await parseJsonBody(req);
        if (!item.fecha || !item.unidad || item.kmIni === undefined || item.kmFin === undefined) {
          return sendJson(res, 400, { error: 'Faltan campos obligatorios' });
        }
        const newRecord = {
          id: 'reg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          uid: item.uid || 'anon',
          conductor: item.conductor || 'Conductor',
          unidad: item.unidad,
          placa: item.placa || '',
          fecha: item.fecha,
          salida: item.salida || '08:00',
          llegada: item.llegada || '18:00',
          kmIni: Number(item.kmIni),
          kmFin: Number(item.kmFin),
          combustible: Number(item.combustible || 0),
          fallas: Array.isArray(item.fallas) ? item.fallas : [],
          destino: item.destino || '',
          obs: item.obs || '',
          creado: new Date().toISOString()
        };
        db.registros.unshift(newRecord);
        saveData(db);
        return sendJson(res, 201, { ok: true, registro: newRecord });
      }

      // Actualizar registro existente
      if (pathname.startsWith('/api/registros/') && req.method === 'PUT') {
        const id = pathname.replace('/api/registros/', '');
        const update = await parseJsonBody(req);
        const idx = db.registros.findIndex(r => r.id === id);
        if (idx === -1) return sendJson(res, 404, { error: 'Registro no encontrado' });

        db.registros[idx] = {
          ...db.registros[idx],
          ...update,
          kmIni: Number(update.kmIni !== undefined ? update.kmIni : db.registros[idx].kmIni),
          kmFin: Number(update.kmFin !== undefined ? update.kmFin : db.registros[idx].kmFin),
          combustible: Number(update.combustible !== undefined ? update.combustible : db.registros[idx].combustible)
        };
        saveData(db);
        return sendJson(res, 200, { ok: true, registro: db.registros[idx] });
      }

      // Eliminar registro
      if (pathname.startsWith('/api/registros/') && req.method === 'DELETE') {
        const id = pathname.replace('/api/registros/', '');
        const prevCount = db.registros.length;
        db.registros = db.registros.filter(r => r.id !== id);
        if (db.registros.length === prevCount) {
          return sendJson(res, 404, { error: 'Registro no encontrado' });
        }
        saveData(db);
        return sendJson(res, 200, { ok: true, mensaje: 'Registro eliminado' });
      }

      // Guardar o actualizar mantenimiento de una unidad
      if (pathname === '/api/mantenimiento' && req.method === 'POST') {
        const { unidad, tipo, proxKm, fechaLimite, taller, notas } = await parseJsonBody(req);
        if (!unidad) return sendJson(res, 400, { error: 'Unidad requerida' });
        if (!db.mantenimiento) db.mantenimiento = {};
        db.mantenimiento[unidad] = {
          tipo: tipo || 'Mantenimiento preventivo',
          proxKm: Number(proxKm || 0),
          fechaLimite: fechaLimite || '',
          taller: taller || '',
          notas: notas || ''
        };
        saveData(db);
        return sendJson(res, 200, { ok: true, mantenimiento: db.mantenimiento[unidad] });
      }

      // Gestión de Usuarios (Crear / Editar)
      if (pathname === '/api/usuarios' && req.method === 'POST') {
        const u = await parseJsonBody(req);
        if (!u.usuario || !u.nombre) {
          return sendJson(res, 400, { error: 'Usuario y nombre son obligatorios' });
        }
        const cleanUser = u.usuario.trim().toLowerCase();
        const existingIdx = db.usuarios.findIndex(x => x.usuario.toLowerCase() === cleanUser);
        if (existingIdx >= 0) {
          db.usuarios[existingIdx] = {
            ...db.usuarios[existingIdx],
            nombre: u.nombre,
            rol: u.rol || 'driver',
            unidad: u.unidad || '',
            placa: u.placa || '',
            pass: u.pass ? u.pass : db.usuarios[existingIdx].pass
          };
        } else {
          db.usuarios.push({
            id: 'u-' + Date.now(),
            usuario: cleanUser,
            pass: u.pass || '123456',
            nombre: u.nombre,
            rol: u.rol || 'driver',
            unidad: u.unidad || '',
            placa: u.placa || '',
            creado: new Date().toISOString()
          });
        }
        saveData(db);
        return sendJson(res, 200, { ok: true });
      }

      // Eliminar usuario
      if (pathname.startsWith('/api/usuarios/') && req.method === 'DELETE') {
        const id = pathname.replace('/api/usuarios/', '');
        const target = db.usuarios.find(u => u.id === id);
        if (target && target.usuario === 'jushr') {
          return sendJson(res, 400, { error: 'No se puede eliminar el usuario administrador principal' });
        }
        db.usuarios = db.usuarios.filter(u => u.id !== id);
        saveData(db);
        return sendJson(res, 200, { ok: true });
      }

      // Gestión de Vehículos
      if (pathname === '/api/vehiculos' && req.method === 'POST') {
        const v = await parseJsonBody(req);
        if (!v.unidad) return sendJson(res, 400, { error: 'Nombre de la unidad es obligatorio' });
        if (!db.vehiculos) db.vehiculos = [];
        const idx = db.vehiculos.findIndex(x => x.unidad.toLowerCase() === v.unidad.toLowerCase());
        if (idx >= 0) {
          db.vehiculos[idx] = { ...db.vehiculos[idx], ...v };
        } else {
          db.vehiculos.push(v);
        }
        saveData(db);
        return sendJson(res, 200, { ok: true });
      }

      // Eliminar Vehículo (Admin)
      if (pathname.startsWith('/api/vehiculos/') && req.method === 'DELETE') {
        const unidadRaw = pathname.replace('/api/vehiculos/', '');
        const unidad = decodeURIComponent(unidadRaw);
        if (!db.vehiculos) db.vehiculos = [];
        const prevCount = db.vehiculos.length;
        db.vehiculos = db.vehiculos.filter(x => x.unidad.toLowerCase() !== unidad.toLowerCase());
        if (db.mantenimiento && db.mantenimiento[unidad]) {
          delete db.mantenimiento[unidad];
        }
        saveData(db);
        return sendJson(res, 200, { ok: true, mensaje: 'Vehículo eliminado correctamente' });
      }

      // Registrar Cambio de Aceite (cada 5000 km)
      if (pathname === '/api/vehiculos/cambio-aceite' && req.method === 'POST') {
        const { unidad, fecha, km, taller, tipoAceite, notas } = await parseJsonBody(req);
        if (!unidad || km === undefined) {
          return sendJson(res, 400, { error: 'Unidad y kilometraje son requeridos' });
        }
        const vIdx = (db.vehiculos || []).findIndex(x => x.unidad.toLowerCase() === unidad.toLowerCase());
        if (vIdx === -1) return sendJson(res, 404, { error: 'Vehículo no encontrado' });

        const kmNum = Number(km);
        const fechaVal = fecha || new Date().toISOString().slice(0, 10);
        const proxAceite = kmNum + 5000;

        if (!db.vehiculos[vIdx].historialAceite) db.vehiculos[vIdx].historialAceite = [];
        db.vehiculos[vIdx].historialAceite.unshift({
          fecha: fechaVal,
          km: kmNum,
          taller: taller || '',
          tipoAceite: tipoAceite || '',
          notas: notas || ''
        });

        db.vehiculos[vIdx].ultimoCambioAceiteFecha = fechaVal;
        db.vehiculos[vIdx].ultimoCambioAceiteKm = kmNum;
        db.vehiculos[vIdx].intervaloAceiteKm = 5000;
        db.vehiculos[vIdx].proximoCambioAceiteKm = proxAceite;
        db.vehiculos[vIdx].tallerAceite = taller || '';

        // Actualizar también en mantenimiento general
        if (!db.mantenimiento) db.mantenimiento = {};
        db.mantenimiento[unidad] = {
          ...db.mantenimiento[unidad],
          tipo: `Cambio de Aceite (${tipoAceite || 'Sintético'})`,
          proxKm: proxAceite,
          taller: taller || (db.mantenimiento[unidad] && db.mantenimiento[unidad].taller) || '',
          ultimoCambioFecha: fechaVal,
          ultimoCambioKm: kmNum
        };

        saveData(db);
        return sendJson(res, 200, { ok: true, vehiculo: db.vehiculos[vIdx] });
      }

      // Guardar o actualizar puntos de revisión preoperacional (Checklist)
      if (pathname === '/api/checklist-items' && req.method === 'POST') {
        const { items } = await parseJsonBody(req);
        if (Array.isArray(items)) {
          db.checklistItems = items;
          saveData(db);
          return sendJson(res, 200, { ok: true, items: db.checklistItems });
        }
        return sendJson(res, 400, { error: 'Formato inválido de items' });
      }

      // Guardar personalización de apariencia (Logo y Fondo)
      if (pathname === '/api/settings/appearance' && req.method === 'POST') {
        const payload = await parseJsonBody(req);
        if (!db.apariencia) db.apariencia = {};
        db.apariencia = { ...db.apariencia, ...payload };
        saveData(db);
        return sendJson(res, 200, { ok: true, apariencia: db.apariencia });
      }

      // Sincronización y fusión de datos recuperados
      if (pathname === '/api/sync/merge' && req.method === 'POST') {
        const payload = await parseJsonBody(req);
        let changes = false;
        if (Array.isArray(payload.registros)) {
          payload.registros.forEach(r => {
            if (!db.registros.some(x => x.id === r.id)) {
              db.registros.unshift(r);
              changes = true;
            }
          });
        }
        if (Array.isArray(payload.vehiculos)) {
          payload.vehiculos.forEach(v => {
            if (!db.vehiculos.some(x => x.unidad.toLowerCase() === v.unidad.toLowerCase())) {
              db.vehiculos.push(v);
              changes = true;
            }
          });
        }
        if (Array.isArray(payload.usuarios)) {
          payload.usuarios.forEach(u => {
            if (!db.usuarios.some(x => x.usuario.toLowerCase() === u.usuario.toLowerCase())) {
              db.usuarios.push(u);
              changes = true;
            }
          });
        }
        if (payload.mantenimiento) {
          db.mantenimiento = { ...db.mantenimiento, ...payload.mantenimiento };
          changes = true;
        }
        if (changes) saveData(db);
        return sendJson(res, 200, { ok: true, registros: db.registros.length });
      }

      // Backup & Restore
      if (pathname === '/api/backup/download' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="bitacora-backup-${new Date().toISOString().slice(0,10)}.json"`
        });
        return res.end(JSON.stringify(db, null, 2));
      }

      if (pathname === '/api/backup/restore' && req.method === 'POST') {
        const payload = await parseJsonBody(req);
        if (!payload || !Array.isArray(payload.usuarios)) {
          return sendJson(res, 400, { error: 'Estructura de respaldo inválida' });
        }
        db = payload;
        saveData(db);
        return sendJson(res, 200, { ok: true, mensaje: 'Base de datos restaurada correctamente' });
      }

      return sendJson(res, 404, { error: 'Endpoint no encontrado' });
    } catch (e) {
      console.error('API Error:', e);
      return sendJson(res, 500, { error: e.message || 'Error interno del servidor' });
    }
  }

  // --- SERVIR ARCHIVOS ESTÁTICOS ---
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  
  // Seguridad: evitar directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end('Acceso denegado');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback a index.html para SPA si no es un archivo
      filePath = path.join(__dirname, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Error al cargar archivo');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`=======================================================`);
    console.log(`🚐 Servidor Bitácora Vehicular ejecutándose con éxito!`);
    console.log(`URL Local: http://localhost:${port}`);
    console.log(`Usuario Admin: jushr (Administrador JUSHMRCB) | Contraseña: jushr2026`);
    console.log(`=======================================================`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`⚠️  Puerto ${currentPort} ocupado. Probando automáticamente puerto ${currentPort + 1}...`);
    currentPort++;
    startServer(currentPort);
  } else {
    console.error('Error en el servidor:', err);
  }
});

startServer(currentPort);
