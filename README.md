# Objetivo VDH

Reparte el objetivo de venta mensual entre los vendedores de cada local de VDH, según las horas reales que trabajó cada uno (calendario de horarios por turnos, no según cuánto abre el local).

## Uso

Abrir `index.html` directamente en el navegador, o (recomendado) la versión publicada en GitHub Pages — se actualiza sola cada vez que se sube un cambio a este repositorio, sin que nadie tenga que descargar nada:

**https://mauriciocamara85-star.github.io/objetivo-vdh/**

## Datos compartidos (Firebase)

La app guarda los horarios en Firestore (Firebase) para que todos los que abren el link vean y editen lo mismo, en tiempo real. Mientras no esté configurado el proyecto de Firebase, funciona igual pero guardando solo en el navegador de cada uno (`localStorage`).

Para activar el modo compartido, completar el objeto `FIREBASE_CONFIG` cerca del principio del `<script type="text/babel">` en `index.html` con el config copiado de la consola de Firebase (Configuración del proyecto → Tus apps → Web), y configurar las reglas de Firestore para permitir lectura/escritura en la colección `app`.

## Stack

Una sola página HTML: React + Babel standalone vía CDN (sin paso de build) y Firebase Firestore para los datos compartidos. Pensado para poder editarse y desplegarse sin instalar nada localmente — cualquier cambio subido a `main` se refleja solo en GitHub Pages.
