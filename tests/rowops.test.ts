// Pruebas de las operaciones de filas con celdas combinadas. Ejecutar: node --experimental-strip-types tests/rowops.test.ts
import assert from "node:assert/strict";
import { addRowAfter, deleteRow, coverMap } from "../lib/rowops.ts";
const cols = [{ key: "c1", label: "A", category: "otra" }, { key: "c2", label: "B", category: "otra" }];
// c1 combinada en filas 0-2
const rows = [
  { id: "r0", cells: { c1: "X", c2: "a", _span: { c1: 3 } } },
  { id: "r1", cells: { c2: "b" } },
  { id: "r2", cells: { c2: "c" } },
] as any;
assert.deepEqual(coverMap(cols as any, rows), [[null, null], [0, null], [0, null]]);
let r = addRowAfter(cols as any, rows, 1); // dentro de la combinación
assert.equal(r.length, 4); assert.equal(r[0].cells._span.c1, 4); assert.equal(r[2].cells.c1, undefined); assert.equal(r[2].cells.c2, "");
r = addRowAfter(cols as any, rows, 2); // al final de la combinación
assert.equal(r[0].cells._span.c1, 3); assert.equal(r[3].cells.c1, "");
r = deleteRow(cols as any, rows, 0); // borrar el origen: el texto pasa a la siguiente
assert.equal(r.length, 2); assert.equal(r[0].cells.c1, "X"); assert.equal(r[0].cells._span.c1, 2);
r = deleteRow(cols as any, rows, 1); // borrar una fila cubierta
assert.equal(r[0].cells._span.c1, 2);
assert.equal(rows[0].cells._span.c1, 3, "no debe modificar el original");
console.log("rowops: todas las pruebas pasaron");
