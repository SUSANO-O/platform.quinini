'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Globe,
  Lock,
  Mail,
  Scale,
  Shield,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

const SECTIONS = [
  { id: 'definiciones', number: '1', title: 'Definiciones' },
  { id: 'objeto', number: '2', title: 'Objeto y alcance' },
  { id: 'obligaciones-encargado', number: '3', title: 'Obligaciones de BotIvA' },
  { id: 'obligaciones-cliente', number: '4', title: 'Obligaciones del Cliente' },
  { id: 'sub-encargados', number: '5', title: 'Sub-encargados' },
  { id: 'transferencias', number: '6', title: 'Transferencias internacionales' },
  { id: 'derechos', number: '7', title: 'Derechos de usuarios' },
  { id: 'seguridad', number: '8', title: 'Medidas de seguridad' },
  { id: 'retencion', number: '9', title: 'Retención y supresión' },
  { id: 'responsabilidad', number: '10', title: 'Responsabilidad' },
  { id: 'modificaciones', number: '11', title: 'Modificaciones' },
  { id: 'legislacion', number: '12', title: 'Legislación aplicable' },
  { id: 'contacto', number: '13', title: 'Contacto' },
] as const;

const HIGHLIGHTS = [
  { icon: Clock, label: 'Notificación de incidentes', value: '72 horas' },
  { icon: Lock, label: 'Supresión tras baja', value: '30 días' },
  { icon: Shield, label: 'Cifrado en reposo', value: 'AES-256' },
  { icon: Scale, label: 'Marco legal', value: 'LFPDPPP' },
] as const;

const USER_RIGHTS = [
  ['Acceso', 'Obtener copia de los Datos Personales tratados.'],
  ['Rectificación', 'Corregir datos inexactos o incompletos.'],
  ['Supresión', 'Eliminar los datos cuando ya no sean necesarios o se retire el consentimiento.'],
  ['Oposición', 'Oponerse al Tratamiento basado en interés legítimo.'],
  ['Portabilidad', 'Recibir los datos en formato estructurado y legible por máquina.'],
  ['Limitación', 'Restringir el Tratamiento mientras se resuelve una disputa sobre exactitud o licitud.'],
] as const;

const SUB_PROCESSORS = [
  { name: 'Google Cloud / Firebase', role: 'Infraestructura de cómputo y bases de datos' },
  { name: 'MongoDB Atlas', role: 'Almacenamiento de conversaciones y configuración' },
  { name: 'Anthropic / OpenAI / Google DeepMind', role: 'Modelos de lenguaje para respuestas' },
  { name: 'Stripe', role: 'Procesamiento de pagos (sin acceso a datos de usuarios finales)' },
  { name: 'Vercel', role: 'Entrega de la aplicación web (edge network)' },
] as const;

const RELATED_DOCS = [
  { href: '/politica-de-privacidad', label: 'Política de Privacidad' },
  { href: '/terminos-y-condiciones', label: 'Términos y Condiciones' },
  { href: '/politica-de-cookies', label: 'Política de Cookies' },
] as const;

export function ComplianceView() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sectionEls = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!sectionEls.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );

    sectionEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 480);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('privacidad@BotIvA.app');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <main className="flex-grow pt-28 pb-24">
        {/* Hero */}
        <div className="max-w-6xl mx-auto px-6 mb-12">
          <div className="text-center max-w-3xl mx-auto">
            <div className="badge-primary mb-5 mx-auto w-fit">
              <Shield size={12} />
              Legal · Privacidad
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight">
              Contrato de Aceptación de{' '}
              <span className="gradient-text">Tratamiento de Datos</span>
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              DPA entre BotIvA y el Cliente: obligaciones, derechos y garantías en protección de datos personales.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-medium">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-texture"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <FileText size={13} />
                Versión 1.0
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-texture"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                <Clock size={13} />
                Vigente desde el 18 de mayo de 2026
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-texture"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
              >
                ~12 min de lectura
              </span>
            </div>
          </div>

          {/* Highlights */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl p-4 card-texture"
                style={{ border: '1px solid var(--border)' }}
              >
                <Icon size={18} style={{ color: 'var(--primary)' }} className="mb-2" />
                <p className="text-lg font-bold" style={{ color: 'var(--foreground)' }}>
                  {value}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile TOC */}
        <div className="lg:hidden sticky top-[72px] z-20 mb-6 px-6">
          <div
            className="rounded-xl p-2 overflow-x-auto card-texture"
            style={{ border: '1px solid var(--border)', background: 'rgba(250,251,252,0.95)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex gap-2 min-w-max px-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{
                    background: activeId === s.id ? 'rgba(var(--brand-primary-rgb),0.1)' : 'transparent',
                    color: activeId === s.id ? 'var(--primary)' : 'var(--muted-foreground)',
                    border: activeId === s.id ? '1px solid rgba(var(--brand-primary-rgb),0.25)' : '1px solid transparent',
                  }}
                >
                  {s.number}. {s.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-10 items-start">
            {/* Desktop TOC */}
            <aside className="hidden lg:block w-56 shrink-0 sticky top-28">
              <nav
                className="rounded-xl p-4 card-texture"
                style={{ border: '1px solid var(--border)' }}
                aria-label="Índice del contrato"
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--muted-foreground)' }}>
                  En esta página
                </p>
                <ul className="space-y-0.5">
                  {SECTIONS.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => scrollTo(s.id)}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs leading-snug transition-colors"
                        style={{
                          color: activeId === s.id ? 'var(--primary)' : 'var(--muted-foreground)',
                          background: activeId === s.id ? 'rgba(var(--brand-primary-rgb),0.07)' : 'transparent',
                          fontWeight: activeId === s.id ? 600 : 400,
                        }}
                      >
                        <span style={{ color: activeId === s.id ? 'var(--primary)' : 'var(--border)' }}>
                          {s.number}.
                        </span>{' '}
                        {s.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>

              <div
                className="mt-4 rounded-xl p-4 card-texture"
                style={{ border: '1px solid var(--border)' }}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>
                  Documentos relacionados
                </p>
                <ul className="space-y-2">
                  {RELATED_DOCS.map((doc) => (
                    <li key={doc.href}>
                      <Link
                        href={doc.href}
                        className="text-xs hover:underline"
                        style={{ color: 'var(--primary)' }}
                      >
                        {doc.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* Content */}
            <article className="flex-1 min-w-0 space-y-8 text-sm md:text-base leading-relaxed" style={{ color: 'var(--muted-foreground)' }}>
              {/* Intro */}
              <div
                className="rounded-2xl p-6 md:p-8 card-texture"
                style={{ border: '1px solid rgba(var(--brand-primary-rgb),0.2)', background: 'linear-gradient(135deg, rgba(var(--brand-primary-rgb),0.04), rgba(var(--brand-cool-rgb),0.03))' }}
              >
                <p>
                  Este Contrato de Tratamiento de Datos (&ldquo;<strong>CTD</strong>&rdquo; o &ldquo;<strong>Contrato</strong>&rdquo;)
                  regula la relación entre <strong>BotIvA</strong> (&ldquo;<strong>Encargado del Tratamiento</strong>&rdquo; o
                  &ldquo;<strong>BotIvA</strong>&rdquo;) y el <strong>Cliente</strong> (&ldquo;<strong>Responsable del
                  Tratamiento</strong>&rdquo;), respecto de los datos personales que el Cliente transmite, almacena o procesa a
                  través de la plataforma BotIvA, sus widgets de chat, APIs y servicios asociados.
                </p>
                <p className="mt-4">
                  Al crear una cuenta, instalar un widget o utilizar cualquier servicio de BotIvA, el Cliente declara
                  haber leído, comprendido y aceptado este Contrato en su totalidad. Si actúa en nombre de una organización,
                  declara tener las facultades necesarias para vincularla contractualmente.
                </p>
              </div>

              <Section id="definiciones" number="1" title="Definiciones">
                <DefinitionGrid>
                  <Def term="Datos Personales">
                    Toda información que identifique o permita identificar a una persona física, incluyendo —sin limitación— nombre,
                    correo electrónico, identificador de sesión, dirección IP, historial de conversaciones y cualquier otro dato
                    proporcionado por los usuarios finales del Cliente a través de los widgets o APIs de BotIvA.
                  </Def>
                  <Def term="Tratamiento">
                    Cualquier operación realizada sobre los Datos Personales: recopilación, almacenamiento, consulta, uso,
                    transmisión, anonimización, bloqueo o supresión.
                  </Def>
                  <Def term="Usuario Final">
                    La persona física que interactúa con los widgets de chat u otras interfaces del Cliente que utilizan la
                    plataforma BotIvA.
                  </Def>
                  <Def term="Sub-encargado">
                    Tercero contratado por BotIvA para ejecutar parte del Tratamiento en nombre del Cliente, sujeto a
                    obligaciones equivalentes a las de este Contrato.
                  </Def>
                  <Def term="Incidente de Seguridad">
                    Acceso no autorizado, destrucción, pérdida, alteración o divulgación accidental de Datos Personales.
                  </Def>
                </DefinitionGrid>
              </Section>

              <Section id="objeto" number="2" title="Objeto y alcance del tratamiento">
                <p>
                  BotIvA actuará como <strong>Encargado del Tratamiento</strong> exclusivamente para prestar los servicios
                  contratados por el Cliente y bajo sus instrucciones documentadas. El Tratamiento abarca:
                </p>
                <BulletList>
                  <li>Almacenamiento temporal y permanente del historial de conversaciones del widget.</li>
                  <li>Procesamiento de consultas contra modelos de lenguaje (LLMs) de terceros para generar respuestas.</li>
                  <li>Indexación de documentos cargados por el Cliente para funcionalidad RAG (Retrieval-Augmented Generation).</li>
                  <li>Registro de métricas de uso anonimizadas para facturación y mejora del servicio.</li>
                  <li>Autenticación e identificación de los usuarios finales cuando el Cliente habilite dicha función.</li>
                </BulletList>
                <p className="mt-4">
                  BotIvA no realizará ningún Tratamiento adicional sin instrucción previa y documentada del Cliente, salvo
                  obligación legal expresa.
                </p>
              </Section>

              <Section id="obligaciones-encargado" number="3" title="Obligaciones del Encargado del Tratamiento (BotIvA)">
                <p>BotIvA se compromete a:</p>
                <NumberedList>
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
                </NumberedList>
              </Section>

              <Section id="obligaciones-cliente" number="4" title="Obligaciones del Responsable del Tratamiento (Cliente)">
                <p>El Cliente se compromete a:</p>
                <NumberedList>
                  <li>
                    Contar con una base legal válida para el Tratamiento de los Datos Personales de sus Usuarios Finales
                    (consentimiento, contrato, interés legítimo u otra aplicable bajo la legislación local).
                  </li>
                  <li>
                    Informar a sus Usuarios Finales sobre el uso de BotIvA como herramienta de procesamiento, conforme a su
                    propia política de privacidad.
                  </li>
                  <li>
                    No transmitir a BotIvA datos de categorías especiales (salud, opiniones políticas, datos biométricos,
                    creencias religiosas, orientación sexual u otros datos sensibles) sin suscribir un addendum específico.
                  </li>
                  <li>
                    Notificar a BotIvA de forma inmediata si toma conocimiento de cualquier acción legal, demanda regulatoria
                    o reclamación relacionada con los Datos Personales tratados a través de la plataforma.
                  </li>
                  <li>
                    Impartir instrucciones de Tratamiento por escrito (correo electrónico o formulario en el panel de
                    administración) y asumir responsabilidad por las instrucciones que contradigan la normativa aplicable.
                  </li>
                </NumberedList>
              </Section>

              <Section id="sub-encargados" number="5" title="Sub-encargados autorizados">
                <p>
                  El Cliente autoriza de forma general a BotIvA a contratar Sub-encargados para la prestación del servicio.
                  BotIvA publicará y mantendrá actualizada la lista de Sub-encargados en{' '}
                  <strong>BotIvA.app/sub-encargados</strong>. Ante cualquier incorporación o sustitución, BotIvA notificará
                  al Cliente con al menos <strong>15 días de antelación</strong>, período durante el cual el Cliente podrá
                  oponerse con causa justificada. Los Sub-encargados estarán sujetos a obligaciones equivalentes a las de
                  este Contrato.
                </p>
                <p className="mt-4 mb-3 font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                  Sub-encargados actuales
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUB_PROCESSORS.map(({ name, role }) => (
                    <div
                      key={name}
                      className="rounded-xl p-4 card-texture flex gap-3"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <Users size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>{name}</p>
                        <p className="text-xs mt-0.5">{role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section id="transferencias" number="6" title="Transferencias internacionales de datos">
                <p>
                  Algunos Sub-encargados pueden procesar datos fuera del país de residencia del Cliente o de sus Usuarios
                  Finales. BotIvA garantiza que toda transferencia internacional se realiza bajo un mecanismo legal adecuado,
                  que puede incluir:
                </p>
                <BulletList>
                  <li>Cláusulas Contractuales Tipo (CCT) aprobadas por la autoridad competente.</li>
                  <li>Certificaciones o marcos de adecuación reconocidos (p. ej., EU-US Data Privacy Framework).</li>
                  <li>Reglas Corporativas Vinculantes (BCR) cuando aplique.</li>
                </BulletList>
                <p className="mt-4 flex items-start gap-2">
                  <Globe size={16} className="shrink-0 mt-1" style={{ color: 'var(--accent)' }} />
                  El Cliente podrá solicitar documentación sobre los mecanismos aplicables a través del canal de soporte.
                </p>
              </Section>

              <Section id="derechos" number="7" title="Derechos de los Usuarios Finales">
                <p>
                  BotIvA provee al Cliente los mecanismos técnicos necesarios para que este pueda atender las solicitudes
                  de derechos de sus Usuarios Finales. Dichos derechos incluyen, según la legislación aplicable:
                </p>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {USER_RIGHTS.map(([right, desc]) => (
                    <div
                      key={right}
                      className="rounded-xl p-4 card-texture"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <p className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>{right}</p>
                      <p className="text-xs">{desc}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4">
                  Las solicitudes deben dirigirse al Cliente, quien es el Responsable del Tratamiento. BotIvA asistirá al
                  Cliente en la ejecución técnica dentro de los plazos acordados.
                </p>
              </Section>

              <Section id="seguridad" number="8" title="Medidas de seguridad">
                <p>
                  BotIvA aplica un programa de seguridad de la información que incluye, entre otras, las siguientes medidas:
                </p>
                <BulletList>
                  <li>Cifrado en tránsito con TLS 1.2 o superior en todos los endpoints.</li>
                  <li>Cifrado en reposo (AES-256) para bases de datos y almacenamiento de archivos.</li>
                  <li>Autenticación multifactor (MFA) obligatoria para el acceso administrativo a la infraestructura.</li>
                  <li>Control de acceso basado en el principio de mínimo privilegio.</li>
                  <li>Revisiones de seguridad periódicas y pruebas de penetración anuales realizadas por terceros.</li>
                  <li>Registro y monitoreo de eventos de acceso y modificación de datos.</li>
                  <li>Plan de respuesta a incidentes con procedimientos documentados de notificación.</li>
                </BulletList>
              </Section>

              <Section id="retencion" number="9" title="Retención y supresión de datos">
                <p>
                  Los Datos Personales se conservarán durante el tiempo estrictamente necesario para la prestación del
                  servicio contratado, con los siguientes plazos orientativos:
                </p>
                <BulletList>
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
                </BulletList>
              </Section>

              <Section id="responsabilidad" number="10" title="Responsabilidad y limitación de daños">
                <p>
                  Cada parte será responsable ante la otra por los daños directos causados por el incumplimiento de sus
                  obligaciones bajo este Contrato. La responsabilidad total acumulada de BotIvA frente al Cliente en relación
                  con el Tratamiento de Datos no excederá el importe total abonado por el Cliente en los <strong>12 meses</strong>{' '}
                  anteriores al evento que da lugar a la reclamación.
                </p>
                <p className="mt-4">
                  BotIvA no será responsable de daños indirectos, lucro cesante o pérdida de datos atribuibles a instrucciones
                  erróneas del Cliente, incumplimiento de sus propias obligaciones de seguridad o actuaciones de terceros
                  ajenos a la relación contractual.
                </p>
              </Section>

              <Section id="modificaciones" number="11" title="Modificaciones al Contrato">
                <p>
                  BotIvA podrá actualizar este Contrato para reflejar cambios normativos, tecnológicos o en su modelo de
                  negocio. Cualquier modificación sustancial será notificada al Cliente con al menos <strong>30 días de
                  antelación</strong> mediante correo electrónico o aviso prominente en el panel de administración. El uso
                  continuado del servicio tras la fecha de entrada en vigor de la modificación constituirá aceptación de los
                  nuevos términos.
                </p>
              </Section>

              <Section id="legislacion" number="12" title="Legislación aplicable y resolución de conflictos">
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

              <Section id="contacto" number="13" title="Contacto del Responsable de Privacidad">
                <p>
                  Para ejercer derechos, reportar incidentes o formular preguntas sobre este Contrato, el Cliente puede
                  contactar al Responsable de Privacidad de BotIvA a través de:
                </p>
                <div
                  className="mt-4 rounded-xl p-5 card-texture"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <p className="font-bold" style={{ color: 'var(--foreground)' }}>BotIvA — Responsable de Privacidad</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href="mailto:privacidad@BotIvA.app"
                      className="inline-flex items-center gap-2 font-semibold text-sm hover:underline"
                      style={{ color: 'var(--primary)' }}
                    >
                      <Mail size={15} />
                      privacidad@BotIvA.app
                    </a>
                    <button
                      type="button"
                      onClick={copyEmail}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style={{
                        border: '1px solid var(--border)',
                        color: copied ? 'var(--accent)' : 'var(--muted-foreground)',
                        background: 'var(--muted)',
                      }}
                    >
                      {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                      {copied ? 'Copiado' : 'Copiar correo'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs">Tiempo de respuesta: máximo 5 días hábiles.</p>
                </div>
              </Section>

              {/* Acceptance */}
              <div
                className="rounded-2xl p-6 md:p-8 card-texture scroll-mt-28"
                style={{ border: '1px solid rgba(var(--brand-primary-rgb),0.25)', background: 'rgba(var(--brand-primary-rgb),0.03)' }}
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={22} className="shrink-0 mt-0.5" style={{ color: 'var(--primary)' }} />
                  <div>
                    <p className="font-bold mb-2" style={{ color: 'var(--foreground)' }}>
                      Aceptación del Contrato
                    </p>
                    <p className="text-sm">
                      Al utilizar los servicios de BotIvA (crear una cuenta, instalar un widget o realizar una llamada a la
                      API), el Cliente declara haber leído y aceptado íntegramente este Contrato de Tratamiento de Datos.
                      Esta aceptación tiene el mismo valor legal que una firma manuscrita bajo la legislación aplicable en
                      materia de contratos electrónicos.
                    </p>
                    <p className="text-sm mt-3">
                      La fecha de aceptación queda registrada en los sistemas de BotIvA junto con el identificador de cuenta,
                      la dirección IP y la marca de tiempo UTC correspondiente.
                    </p>
                  </div>
                </div>
              </div>

              {/* Mobile related docs */}
              <div className="lg:hidden rounded-xl p-4 card-texture" style={{ border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--muted-foreground)' }}>
                  Documentos relacionados
                </p>
                <div className="flex flex-wrap gap-3">
                  {RELATED_DOCS.map((doc) => (
                    <Link key={doc.href} href={doc.href} className="text-sm hover:underline" style={{ color: 'var(--primary)' }}>
                      {doc.label}
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>

      <button
        type="button"
        aria-label="Volver arriba"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-30 p-3 rounded-full shadow-lg transition-all duration-300"
        style={{
          background: 'var(--primary)',
          color: '#fff',
          opacity: showBackToTop ? 1 : 0,
          pointerEvents: showBackToTop ? 'auto' : 'none',
          transform: showBackToTop ? 'translateY(0)' : 'translateY(12px)',
        }}
      >
        <ArrowUp size={18} />
      </button>

      <Footer />
    </div>
  );
}

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 rounded-2xl p-6 md:p-8 card-texture space-y-4" style={{ border: '1px solid var(--border)' }}>
      <h2 className="flex items-start gap-3 text-xl font-bold" style={{ color: 'var(--foreground)' }}>
        <span
          className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold"
          style={{ background: 'rgba(var(--brand-primary-rgb),0.1)', color: 'var(--primary)' }}
        >
          {number}
        </span>
        <span className="pt-0.5">{title}</span>
      </h2>
      {children}
    </section>
  );
}

function DefinitionGrid({ children }: { children: React.ReactNode }) {
  return <dl className="mt-2 grid gap-3 sm:grid-cols-2">{children}</dl>;
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--muted)' }}>
      <dt className="font-bold text-sm mb-1" style={{ color: 'var(--foreground)' }}>{term}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 mt-4 space-y-2 marker:text-[var(--primary)]">{children}</ul>;
}

function NumberedList({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal pl-6 mt-4 space-y-3 marker:font-bold marker:text-[var(--primary)]">{children}</ol>;
}
