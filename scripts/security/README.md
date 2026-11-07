# Banco de pruebas de seguridad

Sondas **no destructivas** contra la propia infraestructura de BotIvA. Confirman que los arreglos de
seguridad siguen en pie tras cada deploy y detectan un endpoint que se reabra. No borran ni modifican
datos, no hacen fuerza bruta, no saturan el servicio.

## Correr

```bash
LANDING_URL=https://botiva.space \
HUB_URL=https://control-matias-528082765109.europe-west1.run.app \
BACKEND_URL=https://matias-backend-528082765109.europe-west1.run.app \
npx tsx scripts/security/run-security-probe.mts
```

Opciones: `--only=<id,...>`, `--target=landing|hub|backend`. Sale con código 1 si falla una sonda crítica.

## Alcance y límites

- Solo infraestructura propia de BotIvA.
- Solo lectura / rechazos esperados (401/403/404). Nada de borrado, fuerza bruta ni carga.
- Las sondas viven en `src/lib/security/probe-cases.ts` (lógica pura testeada en
  `src/lib/security/__tests__/`).

## Fuera de este banco (requieren OK explícito y entorno de prueba)

- Inyección de instrucciones / abuso de herramientas contra un agente de PRUEBA (no los de Tribu).
- Aislamiento entre clientes con dos cuentas de prueba reales.
