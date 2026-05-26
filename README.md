# 🛒 SmartStock - Control Inteligente de Inventario por Voz

![SmartStock Banner](https://img.shields.io/badge/SmartStock-PWA-blue)
![React](https://img.shields.io/badge/React-19-blue)
![Firebase](https://img.shields.io/badge/Firebase-Realtime-orange)
![Groq](https://img.shields.io/badge/Groq-Llama%203.3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📖 Descripción

**SmartStock** es una aplicación web progresiva (**PWA**) diseñada para supermercados, autoservicios, almacenes y centros de distribución que necesitan agilizar el registro y control de productos mediante comandos de voz.

Su objetivo principal es reducir el tiempo que los repositores dedican a registrar lotes y vencimientos, eliminando la carga manual de datos y permitiendo que toda la operación se sincronice en tiempo real entre múltiples dispositivos.

La aplicación escucha instrucciones habladas, interpreta lenguaje natural utilizando Inteligencia Artificial y transforma automáticamente la información en registros estructurados dentro del inventario.

---

## 🎯 Problema que Resuelve

En muchos supermercados los repositores deben:

- Leer manualmente productos.
- Registrar lotes.
- Registrar fechas de vencimiento.
- Informar productos próximos a vencer.
- Coordinar información entre varios empleados.

Esto genera:

- Pérdida de tiempo.
- Errores humanos.
- Productos vencidos en góndola.
- Falta de sincronización entre equipos.

SmartStock automatiza todo este proceso.

---

# ✨ Características Principales

## 🎙️ Registro por Voz

Permite registrar productos utilizando lenguaje natural.

### Ejemplo

Usuario:

> "Leche Serenísima lote 4587 vence el 12 de agosto del 2027"

Resultado:

```json
{
  "producto": "Leche Serenísima",
  "lote": "4587",
  "vencimiento": "2027-08-12"
}
```
