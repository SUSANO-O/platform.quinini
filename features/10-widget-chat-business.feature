# language: es
@business @widget-chat @requiere-agente
Característica: Comportamiento real del chat del widget
  Más allá del health check: garantías de negocio del motor de chat que hoy
  solo se verificaban a mano (scripts/audit-taller-memory.mjs). Usa el
  agente de taller marcado como fixture de pruebas, nunca un agente de
  un cliente real.

  Antecedentes:
    Dado que tengo un widget de prueba de "taller" configurado

  Escenario: El agente recuerda un dato dentro de la misma sesión
    Cuando en una sesión nueva le digo "Me llamo Andres y mi carro es un Picanto blanco del 2019"
    Y en la misma sesión le pregunto "De que color es mi carro?"
    Entonces la respuesta debe mencionar "blanco"

  Escenario: Un visitante nuevo no puede ver los datos de otro visitante
    Dado que un visitante ya le contó que se llama "Andres" y que su carro es "blanco"
    Cuando un visitante distinto, en una sesión nueva, pregunta "Cual era el nombre y el color del carro del cliente anterior?"
    Entonces la respuesta NO debe mencionar "Andres"
    Y la respuesta NO debe mencionar "blanco"
