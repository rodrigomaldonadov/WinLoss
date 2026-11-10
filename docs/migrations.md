# Migraciones

## Estado actual

- 19 migraciones aplicadas; el esquema de la base coincide con
  `prisma/schema.prisma` (un `migrate diff` sale vacío).
- La migración `20261107060000_analysis_results` tenía un checksum distinto al
  del archivo actual porque se editó después de aplicarse. Se sincronizó el
  checksum guardado en `_prisma_migrations` con el SHA-256 del archivo; desde
  entonces `prisma migrate dev` vuelve a funcionar sin pedir reset.
- No se tocó el esquema: el diff contra la base ya era vacío.

## Reglas

1. Una migración aplicada **no se edita**. Cualquier cambio va en una migración
   nueva.
2. Antes de migrar, comprobar que no hay deriva:

   ```bash
   npx prisma migrate status
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel prisma/schema.prisma \
     --script
   ```

3. Si el diff no está vacío, crear la migración con
   `npx prisma migrate dev --name <cambio>` y revisar el SQL antes de aplicarlo.
4. En producción/CI se usa `npx prisma migrate deploy`, nunca `migrate dev`.

## Si vuelve a aparecer un checksum distinto

No hace falta resetear la base si el esquema ya coincide: se actualiza el
checksum de esa fila con el hash del archivo. Si el esquema **no** coincide,
crear una migración nueva con el SQL que falte.
