# desklog — Biblioteca universal de recolección y gestión de registros para Electron, Tauri y Node.js

[![npm version](https://img.shields.io/npm/v/desklog?style=flat-square)](https://www.npmjs.com/package/desklog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE)
[![X (Twitter)](https://img.shields.io/badge/X-@novratools-blue?style=flat-square&logo=x)](https://x.com/novratools)

[English](https://github.com/Novra-tools/NovraLogger/blob/main/README.md) | [简体中文](https://github.com/Novra-tools/NovraLogger/blob/main/README.zh-CN.md) | [日本語](https://github.com/Novra-tools/NovraLogger/blob/main/README.ja.md) | [한국어](https://github.com/Novra-tools/NovraLogger/blob/main/README.ko.md) | [Español](https://github.com/Novra-tools/NovraLogger/blob/main/README.es.md)

**desklog** es una biblioteca universal de recolección y gestión de registros diseñada específicamente para aplicaciones **Electron**, **Tauri** y **Node.js**. Proporciona una suite completa lista para usar: rotación de archivos en cascada, purga automática de registros vencidos al exceder el límite, control estricto del espacio en disco, enmascaramiento automático de datos confidenciales, aislamiento multiusuario, limpieza de registros locales en un clic y empaquetado ZIP en JavaScript puro para diagnósticos.

---

## Características principales

- **Diseñado para Electron, Tauri y Node.js**: Cero dependencias duras del host. No incluye `electron` ni `@tauri-apps/api` de forma rígida, funcionando en Node.js puro sin necesidad de compilación nativa en C++ (sin node-gyp).
- **Rotación en cascada y purga automática**:
  - Rota automáticamente los archivos (`app.log` &rarr; `app.1.log` &rarr; `app.2.log`) cuando alcanzan el límite de tamaño configurado.
  - Los archivos de registro antiguos que superen `maxFiles` se **eliminan físicamente de forma automática**, evitando el consumo infinito de disco.
  - El uso total del disco está estrictamente limitado a `maxFileSize * maxFiles`.
  - Comprobación acelerada (`checkInterval`) para reducir la sobrecarga de I/O en el sistema de archivos.
- **Limpieza de registros locales en un clic**:
  - `logger.clearLogs()` / `logger.cleanLogs()`: Limpia registros por usuario o por antigüedad.
  - `logger.clearAllLogs()`: **Borrado total en un solo clic** de todos los registros de la aplicación, directorios de usuario y archivos ZIP temporales.
- **Enmascaramiento de datos confidenciales**: Oculta automáticamente tokens, contraseñas, encabezados Bearer, números de teléfono y parámetros URL con protección contra referencias circulares.
- **Empaquetado ZIP de diagnóstico**: Comprime registros y metadatos del sistema en un archivo `.zip` en una sola llamada para comentarios de usuarios.
- **Aislamiento multiusuario**: Separa los registros globales (`logs/app/`) de los registros específicos de cada usuario (`logs/users/<userId>/`).
- **Soporte completo para TypeScript y ESM/CJS**: Incluye declaraciones `.d.ts`.

---

## Instalación

```bash
npm install desklog
# o
pnpm add desklog
```

---

## Inicio rápido

```typescript
import { createLogger } from 'desklog';

const logger = createLogger({
  appName: 'mi-app',
  logDir: './logs',
  level: 'debug',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 3,                   // Máximo 3 archivos (Límite estricto de 30MB)
  checkInterval: 50,
});

logger.info('Servicio iniciado');

// Logger con alcance y enmascaramiento automático
const authLog = logger.scope('AuthModule', 'login');
authLog.info('Usuario autenticado', {
  userId: 'user_1001',
  token: 'jwt_secret_token', // Enmascarado automáticamente como "[token]"
});

// Limpieza total de registros en un solo clic
await logger.clearAllLogs();

// Empaquetado ZIP para diagnóstico
const { zipPath, fileCount } = await logger.packLogs({
  metadata: { version: '1.0.0' },
});
console.log(`Archivo ZIP generado: ${zipPath}`);
```

---

## Soporte y comunidad

- **Sitio web oficial y X (Twitter)**: [https://x.com/novratools](https://x.com/novratools)
- **Repositorio de GitHub**: [https://github.com/Novra-tools/NovraLogger](https://github.com/Novra-tools/NovraLogger)
- **GitHub Issues**: [Seguimiento de problemas](https://github.com/Novra-tools/NovraLogger/issues)

---

## Licencia

[MIT](https://github.com/Novra-tools/NovraLogger/blob/main/LICENSE) © 2026 Novra Tools

