# 🚐 Bitácora Vehicular y Maquinaria Pesada v3.0

Sistema integral para el control de comisiones y labores de flota vehicular y maquinaria pesada, odómetro/horómetro, combustible, inspección pre-operacional 360°, calendario de salidas y mantenimiento preventivo especializado.

---

## 🔑 Credenciales de Acceso

| Rol | Usuario | Contraseña | Unidad / Acceso |
| :--- | :--- | :--- | :--- |
| **👑 Administrador Principal** | **`jushr`** | **`jushr2026`** | **Administrador JUSHMRCB (Acceso total)** |
| 🚙 Conductor 01 | `carlos` | `123456` | Unidad 01 (`ABC-123`) - Toyota Hilux |
| 🚙 Conductor 02 | `marcos` | `123456` | Unidad 02 (`XYZ-789`) - Hyundai H1 |
| 🚙 Conductor 03 | `juan` | `123456` | Nissan 2012 (`MNO-456`) - Frontier |
| 🚚 Operador Volquete | `raul` | `123456` | Volquete 01 (`VOL-550`) - Volvo FMX |
| 🚜 Operador Retroexcavadora | `pedro` | `123456` | Retroexcavadora 01 (`RET-204`) - CAT 420F |

---

## 🎨 Imágenes Corporativas (Logo y Fondo)

1. **Logo Principal en la Barra Superior:**
   - Ubicado junto al título **"Bitácora vehicular"**.
   - Se carga automáticamente desde el archivo local `assets/logo.png`.
2. **Fondo de la Pantalla de Login:**
   - La pantalla de inicio de sesión cuenta con la imagen corporativa fijada en `assets/login-bg.png` con superposición translúcida profesional.
   - La interfaz se mantiene limpia y libre de botones de configuración temporales.

---

## 🚜 Diferenciación: Maquinaria Pesada vs Vehículos Livianos

### 1. Colores Distintivos:
* **🚙 Vehículos Livianos (Toyota, Hyundai, Nissan 2012, etc.):**
  - Se muestran en **color Azul Corporativo (`#2563EB`)**, corrigiendo el color naranja previo en la unidad Nissan 2012.
* **🚜 Maquinaria Pesada (Volquetes, Retroexcavadoras, etc.):**
  - Se muestran en **color Ámbar / Dorado Industrial (`#D97706`)** con etiquetas destacadas `🚚 Volquete` y `🚜 Retroexcavadora`.

### 2. Mantenimiento Especializado:
* **Vehículos Convencionales:**
  - Control de cambio de aceite cada **5,000 km**.
  - Evidencia de última fecha y kilometraje.
* **Maquinaria Pesada (Volquete y Retroexcavadora):**
  - Control por **Horómetro (Horas de Operación)** o Kilometraje de faena.
  - **Servicio de Motor Pesado:** Intervalo de 250 hrs / 5,000 km.
  - **Protocolo de Engrase:** Engrase periódico de pines, bujes y articulaciones de tolva/cuchara.
  - **Sistema Hidráulico:** Monitoreo de pistones telescópicos de tolva y cilindros de levante.
  - **Revisión Pre-Operacional Adaptativa:** Inspección de fugas hidráulicas, alarma de retroceso, circulina estroboscópica y faros de faena.

---

## 🚀 Formas de Ejecución en esta PC

### Opción 1: Con el Servidor Local Node.js (Recomendada)
1. Haz doble clic en el archivo **`iniciar-servidor.bat`** (o ejecuta en terminal `node server.js`).
2. Se abrirá automáticamente en tu navegador en:
   **[http://localhost:3050](http://localhost:3050)** *(puerto 3050 configurado por defecto para no interferir con otros proyectos en el puerto 3000).*
3. Todos los datos, imágenes y registros se guardan de forma persistente en `data/bitacora.json` y la carpeta `assets/`.

### Opción 2: Modo Directo Sin Servidor (Offline / Standalone)
1. Haz doble clic directamente en el archivo **`index.html`** en cualquier navegador.
2. El sistema almacena todo de forma local en `localStorage`.
