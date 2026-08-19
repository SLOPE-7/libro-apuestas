# Libro de apuestas

Registro personal de apuestas con soporte para combinadas, sincronizado entre
dispositivos. React + Vite + Supabase.

**Qué hace:** anota apuestas simples y combinadas, marca cada selección con ✓ o ✗ y
resuelve la apuesta sola (una fallada la pierde entera), lleva saldos por casa, calcula
Kelly y CLV, y muestra la evolución de la banca.

**Qué no hace:** no genera pronósticos. Ver la nota al final.

---

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto (el plan gratis sobra).
2. Ve a **SQL Editor → New query**.
3. Pega el contenido completo de `supabase/schema.sql` y pulsa **Run**.
4. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

La *anon key* es pública por diseño: quien protege tus datos es el Row Level Security
que activa el schema, no el secreto de esa clave.

### Correo de acceso

En **Authentication → Providers**, deja **Email** activado. La app usa enlaces mágicos,
así que no hay contraseñas que recordar ni que filtrar.

---

## 2. Correrlo en tu computadora

```bash
npm install
cp .env.example .env      # y rellena los dos valores
npm run dev
```

Abre <http://localhost:5173>.

---

## 3. Subirlo a GitHub

```bash
git init
git add .
git commit -m "Libro de apuestas"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/libro-apuestas.git
git push -u origin main
```

`.gitignore` ya excluye `.env`. Nunca subas ese archivo.

---

## 4. Desplegar en Vercel

1. Entra a [vercel.com](https://vercel.com) e importa el repositorio.
2. Framework preset: **Vite** (lo detecta solo).
3. En **Environment Variables** añade:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. **Deploy**.

Cada `git push` vuelve a desplegar automáticamente.

### Instalarlo como app en el teléfono

Abre la URL de Vercel en el móvil y usa *Añadir a pantalla de inicio*. Queda como una
app normal, a pantalla completa.

---

## Estructura

```
supabase/schema.sql        Tablas, RLS y vista de resultados
src/lib/supabase.js        Cliente
src/lib/calc.js            Estado de apuestas, P&L, Kelly, CLV, diagnóstico
src/components/            Auth, Resumen, NuevaApuesta, Historial, Casas
```

Toda la lógica de cálculo vive en `calc.js` y es pura: si quieres cambiar las reglas
(edge mínimo, fracción de Kelly, topes), se editan en `REGLAS` y en `kelly()`.

---

## Las reglas que aplica

| Regla | Valor | Por qué |
|---|---|---|
| Edge mínimo | 4% | Por debajo, el error de estimación se come la ventaja |
| Edge máximo | 15% | Bandera roja: en mercados líquidos, un edge enorme suele ser error propio |
| Rango de cuota | 1.50–5.00 | Fuera de ahí la varianza o el riesgo de ruina se disparan |
| Kelly | ¼ con tope del 3% | Kelly completo asume estimaciones exactas, y nunca lo son |
| Muestra mínima | 100 apuestas | Antes de eso no hay nada que concluir |

---

## Sobre los picks automáticos

Este proyecto deliberadamente **no** incluye generación de pronósticos por IA.

Un modelo sin acceso a alineaciones confirmadas, partes de lesionados y movimientos de
cuota en tiempo real produce recomendaciones redactadas con total seguridad y basadas en
nada. Automatizarlo sólo aumenta el ritmo al que se pierde dinero.

La probabilidad implícita de una cuota ya es la mejor estimación disponible: es el
resultado agregado de mucho dinero apostado por gente con más datos. La única ventaja
posible es discrepar de ella con criterio en casos concretos, y el CLV es lo que mide si
esas discrepancias fueron acertadas. Por eso es la métrica central de la app.

---

## Aviso

Apostar es una actividad con pérdida esperada negativa para la gran mayoría. Esta
herramienta sirve para medir con honestidad, no para ganar. Si el registro muestra CLV
negativo de forma sostenida, la conclusión correcta es dejarlo. Usa sólo dinero que ya
diste por perdido.
