import { BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber'
import { closeFixtureConnection } from './widget-fixture.mjs'

// Los steps de negocio hablan con el motor de chat real (LLM real, 10-40s
// por turno según si hay tool calls) — el default de Cucumber (5s) no alcanza.
setDefaultTimeout(45_000)

BeforeAll(function () {
  // Landing BDD asume dev local o BASE_URL apuntando a staging/prod
})

AfterAll(async function () {
  await closeFixtureConnection()
})
