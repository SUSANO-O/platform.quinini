# language: es
@smoke @landing
Característica: Salud de la landing BotIvA
  Verifica que la landing responde y expone status público.

  Escenario: Página principal accesible
    Cuando consulto la página principal de la landing
    Entonces la landing debe responder correctamente

  Escenario: Status público operativo
    Cuando consulto el status público de la plataforma
    Entonces el status debe reportar ok
    Y el status debe incluir servicios
