import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

export const metadata = {
  title: 'Contrato de Tratamiento de Datos | MatIAs',
  description:
    'Contrato de Aceptación de Tratamiento de Datos Personales entre MatAIs y el Cliente. Detalla las obligaciones, derechos y garantías en materia de privacidad y protección de datos.',
};

export default function CompliancePage() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
    >
      <Navbar />

      <main className="flex-grow pt-32 pb-24">
        <div className="max-w-4xl mx-auto px-6">
          {/* Cabecera */}
          <div className="mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#e41414' }}>
              Legal · Privacidad
            </p>
            <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--foreground)' }}>
              Contrato de Aceptación de{' '}
              <span style={{ color: '#e41414' }}>Tratamiento de Datos</span>
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
              Versión 1.0 · Vigente desde el 18 de mayo de 2026
            </p>
          </div>

          <div className="space-y-12 text-sm md:text-base leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>

            {/* Intro */}
            <div
              className="rounded-2xl p-6 border"
              style={{ borderColor: 'rgba(228,20,20,0.2)', background: 'rgba(228,20,20,0.04)' }}
            >
              <p>
                Este Contrato de Tratamiento de Datos (&ldquo;<strong>CTD</strong>&rdquo; o &ldquo;<strong>Contrato</strong>&rdquo;)
                regula la relación entre <strong>MatAIs</strong> (&ldquo;<strong>Encargado del Tratamiento</strong>&rdquo; o
                &ldquo;<strong>MatIAs</strong>&rdquo;) y el <strong>Cliente</strong> (&ldquo;<strong>Responsable del
                Tratamiento</strong>&rdquo;), respecto de los datos personales que el Cliente transmite, almacena o procesa a
                través de la plataforma MatIAs, sus widgets de chat, APIs y servicios asociados.
              </p>
              <p className="mt-4">
                Al crear una cuenta, instalar un widget o utilizar cualquier servicio de MatIAs, el Cliente declara
                haber leído, comprendido y aceptado este Contrato en su totalidad. Si actúa en nombre de una organización,
                declara tener las facultades necesarias para vincularla contractualmente.
              </p>
            </div>

            {/* Sección 1 */}
            <Section number="1" title="Definiciones">
              <Dl>
                <Dt>Datos Personales</Dt>
                <Dd>
                  Toda información que identifique o permita identificar a una persona física, incluyendo —sin limitación— nombre,
                  correo electrónico, identificador de sesión, dirección IP, historial de conversaciones y cualquier otro dato
                  proporcionado por los usuarios finales del Cliente a través de los widgets o APIs de MatIAs.
                </Dd>
                <Dt>Tratamiento</Dt>
                <Dd>
                  Cualquier operación realizada sobre los Datos Personales: recopilación, almacenamiento, consulta, uso,
                  transmisión, anonimización, bloqueo o supresión.
                </Dd>
                <Dt>Usuario Final</Dt>
                <Dd>
                  La persona física que interactúa con los widgets de chat u otras interfaces del Cliente que utilizan la
                  plataforma MatIAs.
                </Dd>
                <Dt>Sub-encargado</Dt>
                <Dd>
                  Tercero contratado por MatIAs para ejecutar parte del Tratamiento en nombre del Cliente, sujeto a
                  obligaciones equivalentes a las de este Contrato.
                </Dd>
                <Dt>Incidente de Seguridad</Dt>
                <Dd>
                  Acceso no autorizado, destrucción, pérdida, alteración o divulgación accidental de Datos Personales.
                </Dd>
              </Dl>
            </Section>

            {/* Sección 2 */}
            <Section number="2" title="Objeto y alcance del tratamiento">
              <p>
                MatIAs actuará como <strong>Encargado del Tratamiento</strong> exclusivamente para prestar los servicios
                contratados por el Cliente y bajo sus instrucciones documentadas. El Tratamiento abarca:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Almacenamiento temporal y permanente del historial de conversaciones del widget.</li>
                <li>Procesamiento de consultas contra modelos de lenguaje (LLMs) de terceros para generar respuestas.</li>
                <li>Indexación de documentos cargados por el Cliente para funcionalidad RAG (Retrieval-Augmented Generation).</li>
                <li>Registro de métricas de uso anonimizadas para facturación y mejora del servicio.</li>
                <li>Autenticación e identificación de los usuarios finales cuando el Cliente habilite dicha función.</li>
              </ul>
              <p className="mt-4">
                MatIAs no realizará ningún Tratamiento adicional sin instrucción previa y documentada del Cliente, salvo
                obligación legal expresa.
              </p>
            </Section>

            {/* Sección 3 */}
            <Section number="3" title="Obligaciones del Encargado del Tratamiento (MatIAs)">
              <p>MatIAs se compromete a:</p>
              <ol className="list-decimal pl-6 mt-4 space-y-3">
                <li>
                  <strong>Confidencialidad.</strong> Garantizar que las personas autorizadas para tratar los Datos Personales
                  estén sujetas a obligaciones de confidencialidad legales o contractuales.
                </li>
                <li>
                  <strong>Seguridad técnica y organizativa.</strong> Implementar y mantener medidas adecuadas al riesgo,
                  incluyendo cifrado en tránsito (TLS 1.2+) y en reposo (AES-256), control de acceso basado en roles,
                  registros de auditoría y revisiones periódicas de seguridad.
                </li>
                <li>
                  <strong>Asistencia al Responsable.</strong> Colaborar razonablemente para que el Cliente pueda atender
                  solicitudes de ejercicio de derechos de los Usuarios Finales (acceso, rectificación, supresión, oposición,
                  portabilidad), sin coste adicional salvo que el volumen supere lo razonable.
                </li>
                <li>
                  <strong>Notificación de Incidentes.</strong> Informar al Cliente sin dilación indebida —y en todo caso
                  dentro de las <strong>72 horas</strong> siguientes al conocimiento del hecho— sobre cualquier Incidente de
                  Seguridad que afecte a los Datos Personales del Cliente.
                </li>
                <li>
                  <strong>Supresión o devolución.</strong> Al término del Contrato, y a elección del Cliente, suprimir o
                  devolver todos los Datos Personales en un plazo máximo de 30 días calendario, salvo obligación legal de
                  conservación.
                </li>
                <li>
                  <strong>Auditoría.</strong> Poner a disposición del Cliente la información necesaria para demostrar el
                  cumplimiento de este Contrato y permitir, con preaviso razonable, auditorías o inspecciones realizadas por
                  el Cliente o un auditor designado por él.
                </li>
              </ol>
            </Section>

            {/* Sección 4 */}
            <Section number="4" title="Obligaciones del Responsable del Tratamiento (Cliente)">
              <p>El Cliente se compromete a:</p>
              <ol className="list-decimal pl-6 mt-4 space-y-3">
                <li>
                  Contar con una base legal válida para el Tratamiento de los Datos Personales de sus Usuarios Finales
                  (consentimiento, contrato, interés legítimo u otra aplicable bajo la legislación local).
                </li>
                <li>
                  Informar a sus Usuarios Finales sobre el uso de MatIAs como herramienta de procesamiento, conforme a su
                  propia política de privacidad.
                </li>
                <li>
                  No transmitir a MatIAs datos de categorías especiales (salud, opiniones políticas, datos biométricos,
                  creencias religiosas, orientación sexual u otros datos sensibles) sin suscribir un addendum específico.
                </li>
                <li>
                  Notificar a MatIAs de forma inmediata si toma conocimiento de cualquier acción legal, demanda regulatoria
                  o reclamación relacionada con los Datos Personales tratados a través de la plataforma.
                </li>
                <li>
                  Impartir instrucciones de Tratamiento por escrito (correo electrónico o formulario en el panel de
                  administración) y asumir responsabilidad por las instrucciones que contradigan la normativa aplicable.
                </li>
              </ol>
            </Section>

            {/* Sección 5 */}
            <Section number="5" title="Sub-encargados autorizados">
              <p>
                El Cliente autoriza de forma general a MatIAs a contratar Sub-encargados para la prestación del servicio.
                MatIAs publicará y mantendrá actualizada la lista de Sub-encargados en{' '}
                <strong>matias.app/sub-encargados</strong>. Ante cualquier incorporación o sustitución, MatIAs notificará
                al Cliente con al menos <strong>15 días de antelación</strong>, período durante el cual el Cliente podrá
                oponerse con causa justificada. Los Sub-encargados estarán sujetos a obligaciones equivalentes a las de
                este Contrato.
              </p>
              <p className="mt-4">Los Sub-encargados actuales incluyen (sin limitación):</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li><strong>Google Cloud / Firebase</strong> — infraestructura de cómputo y bases de datos.</li>
                <li><strong>MongoDB Atlas</strong> — almacenamiento de datos de conversaciones y configuración.</li>
                <li><strong>Anthropic / OpenAI / Google DeepMind</strong> — modelos de lenguaje para generación de respuestas.</li>
                <li><strong>Stripe</strong> — procesamiento de pagos (no accede a Datos Personales de Usuarios Finales).</li>
                <li><strong>Vercel</strong> — entrega de la aplicación web (edge network).</li>
              </ul>
            </Section>

            {/* Sección 6 */}
            <Section number="6" title="Transferencias internacionales de datos">
              <p>
                Algunos Sub-encargados pueden procesar datos fuera del país de residencia del Cliente o de sus Usuarios
                Finales. MatIAs garantiza que toda transferencia internacional se realiza bajo un mecanismo legal adecuado,
                que puede incluir:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Cláusulas Contractuales Tipo (CCT) aprobadas por la autoridad competente.</li>
                <li>Certificaciones o marcos de adecuación reconocidos (p. ej., EU-US Data Privacy Framework).</li>
                <li>Reglas Corporativas Vinculantes (BCR) cuando aplique.</li>
              </ul>
              <p className="mt-4">
                El Cliente podrá solicitar documentación sobre los mecanismos aplicables a través del canal de soporte.
              </p>
            </Section>

            {/* Sección 7 */}
            <Section number="7" title="Derechos de los Usuarios Finales">
              <p>
                MatIAs provee al Cliente los mecanismos técnicos necesarios para que este pueda atender las solicitudes
                de derechos de sus Usuarios Finales. Dichos derechos incluyen, según la legislación aplicable:
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['Acceso', 'Obtener copia de los Datos Personales tratados.'],
                  ['Rectificación', 'Corregir datos inexactos o incompletos.'],
                  ['Supresión', 'Eliminar los datos cuando ya no sean necesarios o se retire el consentimiento.'],
                  ['Oposición', 'Oponerse al Tratamiento basado en interés legítimo.'],
                  ['Portabilidad', 'Recibir los datos en formato estructurado y legible por máquina.'],
                  ['Limitación', 'Restringir el Tratamiento mientras se resuelve una disputa sobre exactitud o licitud.'],
                ].map(([right, desc]) => (
                  <div
                    key={right}
                    className="rounded-xl p-4 border"
                    style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
                  >
                    <p className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>{right}</p>
                    <p className="text-xs">{desc}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4">
                Las solicitudes deben dirigirse al Cliente, quien es el Responsable del Tratamiento. MatIAs asistirá al
                Cliente en la ejecución técnica dentro de los plazos acordados.
              </p>
            </Section>

            {/* Sección 8 */}
            <Section number="8" title="Medidas de seguridad">
              <p>
                MatIAs aplica un programa de seguridad de la información que incluye, entre otras, las siguientes medidas:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>Cifrado en tránsito con TLS 1.2 o superior en todos los endpoints.</li>
                <li>Cifrado en reposo (AES-256) para bases de datos y almacenamiento de archivos.</li>
                <li>Autenticación multifactor (MFA) obligatoria para el acceso administrativo a la infraestructura.</li>
                <li>Control de acceso basado en el principio de mínimo privilegio.</li>
                <li>Revisiones de seguridad periódicas y pruebas de penetración anuales realizadas por terceros.</li>
                <li>Registro y monitoreo de eventos de acceso y modificación de datos.</li>
                <li>Plan de respuesta a incidentes con procedimientos documentados de notificación.</li>
              </ul>
            </Section>

            {/* Sección 9 */}
            <Section number="9" title="Retención y supresión de datos">
              <p>
                Los Datos Personales se conservarán durante el tiempo estrictamente necesario para la prestación del
                servicio contratado, con los siguientes plazos orientativos:
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  <strong>Historial de conversaciones activas:</strong> Mientras la cuenta del Cliente esté activa o hasta
                  que el Cliente solicite su eliminación.
                </li>
                <li>
                  <strong>Registros de auditoría y seguridad:</strong> Hasta 12 meses desde su generación.
                </li>
                <li>
                  <strong>Datos de facturación:</strong> El tiempo requerido por la legislación fiscal aplicable (generalmente
                  5 años).
                </li>
                <li>
                  <strong>Tras la baja del servicio:</strong> Supresión o devolución en un máximo de 30 días calendario,
                  salvo retención legal obligatoria.
                </li>
              </ul>
            </Section>

            {/* Sección 10 */}
            <Section number="10" title="Responsabilidad y limitación de daños">
              <p>
                Cada parte será responsable ante la otra por los daños directos causados por el incumplimiento de sus
                obligaciones bajo este Contrato. La responsabilidad total acumulada de MatIAs frente al Cliente en relación
                con el Tratamiento de Datos no excederá el importe total abonado por el Cliente en los <strong>12 meses</strong>{' '}
                anteriores al evento que da lugar a la reclamación.
              </p>
              <p className="mt-4">
                MatIAs no será responsable de daños indirectos, lucro cesante o pérdida de datos atribuibles a instrucciones
                erróneas del Cliente, incumplimiento de sus propias obligaciones de seguridad o actuaciones de terceros
                ajenos a la relación contractual.
              </p>
            </Section>

            {/* Sección 11 */}
            <Section number="11" title="Modificaciones al Contrato">
              <p>
                MatIAs podrá actualizar este Contrato para reflejar cambios normativos, tecnológicos o en su modelo de
                negocio. Cualquier modificación sustancial será notificada al Cliente con al menos <strong>30 días de
                antelación</strong> mediante correo electrónico o aviso prominente en el panel de administración. El uso
                continuado del servicio tras la fecha de entrada en vigor de la modificación constituirá aceptación de los
                nuevos términos.
              </p>
            </Section>

            {/* Sección 12 */}
            <Section number="12" title="Legislación aplicable y resolución de conflictos">
              <p>
                Este Contrato se rige por las leyes de la República de México, incluyendo la Ley Federal de Protección de
                Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento, sin perjuicio de la normativa
                de protección de datos aplicable en la jurisdicción de residencia del Cliente.
              </p>
              <p className="mt-4">
                Ante cualquier controversia, las partes intentarán resolverla de forma amistosa en un plazo de 30 días.
                Si no se alcanza acuerdo, la disputa se someterá a la jurisdicción de los tribunales competentes de la
                Ciudad de México.
              </p>
            </Section>

            {/* Sección 13 */}
            <Section number="13" title="Contacto del Responsable de Privacidad">
              <p>
                Para ejercer derechos, reportar incidentes o formular preguntas sobre este Contrato, el Cliente puede
                contactar al Responsable de Privacidad de MatIAs a través de:
              </p>
              <div
                className="mt-4 rounded-xl p-5 border"
                style={{ borderColor: 'var(--border)', background: 'var(--card)' }}
              >
                <p><strong style={{ color: 'var(--foreground)' }}>MatAIs — Responsable de Privacidad</strong></p>
                <p className="mt-1">
                  Correo electrónico:{' '}
                  <a
                    href="mailto:privacidad@matias.app"
                    className="font-semibold"
                    style={{ color: '#e41414' }}
                  >
                    privacidad@matias.app
                  </a>
                </p>
                <p className="mt-1">Tiempo de respuesta: máximo 5 días hábiles.</p>
              </div>
            </Section>

            {/* Firma de aceptación */}
            <div
              className="rounded-2xl p-6 border mt-8"
              style={{ borderColor: 'rgba(228,20,20,0.25)', background: 'rgba(228,20,20,0.03)' }}
            >
              <p className="font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                Aceptación del Contrato
              </p>
              <p className="text-sm">
                Al utilizar los servicios de MatIAs (crear una cuenta, instalar un widget o realizar una llamada a la
                API), el Cliente declara haber leído y aceptado íntegramente este Contrato de Tratamiento de Datos.
                Esta aceptación tiene el mismo valor legal que una firma manuscrita bajo la legislación aplicable en
                materia de contratos electrónicos.
              </p>
              <p className="text-sm mt-3">
                La fecha de aceptación queda registrada en los sistemas de MatIAs junto con el identificador de cuenta,
                la dirección IP y la marca de tiempo UTC correspondiente.
              </p>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ── Helpers de maquetado ──────────────────────────────────────────────────────

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2
        className="text-xl font-bold"
        style={{ color: 'var(--foreground)' }}
      >
        {number}. {title}
      </h2>
      {children}
    </section>
  );
}

function Dl({ children }: { children: React.ReactNode }) {
  return <dl className="mt-4 space-y-4">{children}</dl>;
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>
      {children}
    </dt>
  );
}

function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="ml-4">{children}</dd>;
}
