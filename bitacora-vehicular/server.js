/**
 * Servidor para Bitácora Vehicular
 * Soporta persistencia local (JSON) y en la nube con Firebase Realtime Database.
 */
try { require('dotenv').config(); } catch (_) {}

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

let admin = null;
let bitacoraRef = null;
let firebaseActive = false;

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3050;
let currentPort = DEFAULT_PORT;
const DATA_FILE = path.join(__dirname, 'data', 'bitacora.json');

// Normalizar estructura de datos (asegurar arrays válidos)
function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') {
    return { usuarios: [], vehiculos: [], mantenimiento: {}, registros: [] };
  }
  return {
    usuarios: Array.isArray(raw.usuarios) ? raw.usuarios : (raw.usuarios ? Object.values(raw.usuarios) : []),
    vehiculos: Array.isArray(raw.vehiculos) ? raw.vehiculos : (raw.vehiculos ? Object.values(raw.vehiculos) : []),
    mantenimiento: (raw.mantenimiento && typeof raw.mantenimiento === 'object') ? raw.mantenimiento : {},
    registros: Array.isArray(raw.registros) ? raw.registros : (raw.registros ? Object.values(raw.registros) : [])
  };
}

// Cargar o inicializar base de datos local
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return normalizeData(JSON.parse(raw));
    }
  } catch (err) {
    console.error('Error al leer base de datos local:', err);
  }
  return { usuarios: [], vehiculos: [], mantenimiento: {}, registros: [] };
}

let db = loadData();

// Inicializar Firebase Realtime Database si está configurado
function initFirebase() {
  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.log('ℹ️  FIREBASE_DATABASE_URL no configurada. Operando en modo local (data/bitacora.json).');
    return;
  }

  try {
    admin = require('firebase-admin');
    let credential = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const sa = typeof process.env.FIREBASE_SERVICE_ACCOUNT === 'string'
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : process.env.FIREBASE_SERVICE_ACCOUNT;
      credential = admin.credential.cert(sa);
    } else {
      const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
        || (fs.existsSync(path.join(__dirname, 'firebase-key.json')) ? path.join(__dirname, 'firebase-key.json') : null)
        || (fs.existsSync(path.join(__dirname, 'serviceAccountKey.json')) ? path.join(__dirname, 'serviceAccountKey.json') : null);

      if (keyPath) {
        credential = admin.credential.cert(require(path.resolve(keyPath)));
      } else {
        credential = admin.credential.applicationDefault();
      }
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential,
        databaseURL: dbUrl
      });
    }

    const rtdb = admin.database();
    bitacoraRef = rtdb.ref('bitacora');
    firebaseActive = true;

    // Escuchar cambios en tiempo real
    bitacoraRef.on('value', (snapshot) => {
      const remoteData = snapshot.val();
      if (remoteData) {
        db = normalizeData(remoteData);
      }
    });

    // Sembrar datos locales si Firebase está vacío en primera ejecución
    bitacoraRef.once('value').then((snapshot) => {
      if (!snapshot.exists() || !snapshot.val()) {
        console.log('⚡ Firebase Realtime Database vacía: migrando datos iniciales locales a Firebase...');
        bitacoraRef.set(db).catch(e => console.error('Error al sembrar Firebase:', e.message));
      } else {
        console.log('🔥 Conectado con éxito a Firebase Realtime Database (Sincronización en tiempo real activa).');
      }
    }).catch(err => {
      console.warn('Advertencia al consultar Firebase Realtime Database:', err.message);
    });

  } catch (err) {
    console.error('⚠️  No se pudo inicializar Firebase Admin:', err.message);
    console.log('Continuando en modo archivo local...');
    firebaseActive = false;
  }
}

initFirebase();

function saveData(data) {
  let localOk = false;
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    localOk = true;
  } catch (err) {
    console.error('Error al guardar base de datos local:', err);
  }

  if (firebaseActive && bitacoraRef) {
    bitacoraRef.set(data).catch(err => {
      console.error('Error al sincronizar con Firebase Realtime Database:', err.message);
    });
  }
  return localOk;
}

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
