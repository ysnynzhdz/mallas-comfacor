# MALLAS COMFACOR

Plataforma institucional para consultar, actualizar (con aprobación) y conservar las mallas curriculares de la
I.E. COMFACOR Jaime Exbrayat (Montería, Córdoba).

## Tecnologías
Next.js 16 (TypeScript, Tailwind CSS 4) · Supabase (PostgreSQL, Auth, Storage, RLS) · Vercel.

## Estructura
- `app/` pantallas · `components/` piezas visuales · `lib/` datos, permisos y lógica (tablas, diferencias)
- `supabase/migrations/` base de datos, numerada y comentada · `supabase/tests/` pruebas de permisos
- `scripts/import/` importador de documentos Word (Python, solo lectura de los originales)
- `data/importaciones/` resultados del importador listos para cargar como borrador

## Reglas clave
- Los docentes nunca modifican la versión publicada: guardan una propuesta y el administrador aprueba o rechaza.
- Toda escritura del contenido publicado pasa por funciones SQL que verifican permisos (RLS).
- Cada aprobación o restauración crea una versión nueva; nada se borra del historial.

## Variables de entorno (ver `.env.example`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas) y `SUPABASE_SECRET_KEY` (solo en Vercel).

## Importar un documento
```
python3 -I scripts/import/importar_docx.py "9. Matemáticas.docx" salida.json
```
El resultado incluye alertas y una verificación de que cada texto del documento aparece en lo importado.

## Pruebas
- `node --experimental-strip-types tests/rowops.test.ts` (filas y celdas combinadas)
- `supabase/tests/pruebas_permisos.sql` (27 pruebas de permisos y flujo; no deja datos)
