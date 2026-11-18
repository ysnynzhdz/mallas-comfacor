/** Importaciones disponibles (resultado del importador + correcciones de ortografía y estructura). */
export const IMPORTACIONES = [
  ["matematicas", "9. Matemáticas"],
  ["ingles", "1. Inglés"],
  ["ciencias-naturales", "2. Naturales"],
  ["ciencias-sociales", "3. Sociales"],
  ["catedra-de-la-paz", "4. Cátedra de la paz"],
  ["artistica", "5. Artística"],
  ["educacion-fisica", "6. Educación Física"],
  ["lengua-castellana", "7. Lengua Castellana"],
  ["historia-de-colombia", "8. Historia de Colombia"],
  ["emprendimiento", "10. Emprendimiento"],
  ["ciencias-economicas-y-politicas", "11. Ciencias económicas y políticas"],
  ["filosofia", "12. Filosofía"],
  ["etica-y-valores", "13. Ética"],
  ["religion", "14. Religión"],
  ["tecnologia-e-informatica", "15. Tecnología e Informática"],
].map(([area, file]) => ({ id: `${area}-2024`, area, year: 2027, file: `${file}.docx` }));
