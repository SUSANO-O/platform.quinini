import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />
      
      <main className="flex-grow pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-8" style={{ color: '#00acf8' }}>Política de Privacidad</h1>
          
          <div className="max-w-none space-y-10 text-sm md:text-base" style={{ color: 'var(--muted-foreground)' }}>
            <p>Última actualización: 18 de abril de 2026</p>
            
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">1. Introducción</h2>
              <p className="leading-relaxed">
                En MatIAs (AIBackHub), nos comprometemos a proteger su privacidad. Esta política explica cómo recopilamos, utilizamos y protegemos su información cuando utiliza nuestra plataforma de agentes de inteligencia artificial.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">2. Información que Recopilamos</h2>
              <p className="leading-relaxed">
                Recopilamos los siguientes tipos de datos:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li><strong>Datos de Cuenta:</strong> Nombre, correo electrónico e información de facturación proporcionada al registrarse.</li>
                <li><strong>Datos de Uso:</strong> Información sobre cómo interactúa con nuestra API y widgets (dirección IP, tipo de navegador, logs de actividad).</li>
                <li><strong>Contenido del Usuario:</strong> Documentos, textos y otros archivos que cargue para entrenar o contextualizar a sus agentes de IA.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">3. Uso de la Información</h2>
              <p className="leading-relaxed">
                Utilizamos su información para:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li>Proporcionar, mantener y mejorar nuestros servicios de IA.</li>
                <li>Procesar sus pagos a través de proveedores de pago seguros.</li>
                <li>Responder a sus solicitudes de soporte.</li>
                <li>Enviar actualizaciones importantes sobre el servicio y cambios en nuestros términos.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">4. Compartir con Terceros</h2>
              <p className="leading-relaxed">
                Podemos compartir datos limitados con proveedores de servicios esenciales:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li><strong>Modelos de Lenguaje:</strong> Enviamos prompts a proveedores de modelos (como OpenAI, Google o Anthropic) para generar respuestas. Sus datos se procesan de acuerdo con sus políticas de privacidad.</li>
                <li><strong>Procesadores de Pago:</strong> Utilizamos Stripe para la gestión de cobros y suscripciones.</li>
                <li><strong>Infraestructura:</strong> Utilizamos proveedores de nube seguros para alojar nuestra base de datos y servicios.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">5. Seguridad de los Datos</h2>
              <p className="leading-relaxed">
                Implementamos medidas técnicas y organizativas adecuadas para proteger su información contra el acceso no autorizado, la pérdida o la alteración. Sus documentos y datos están aislados por cuenta (multi-tenancy) para garantizar que solo usted o sus usuarios autorizados puedan acceder a ellos.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">6. Sus Derechos</h2>
              <p className="leading-relaxed">
                Dependiendo de su ubicación, usted puede tener derecho a acceder, rectificar o eliminar sus datos personales. Puede ejercer estos derechos enviándonos una solicitud a través de su panel de control o por correo electrónico.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">7. Retención de Datos</h2>
              <p className="leading-relaxed">
                Conservamos su información mientras su cuenta esté activa o sea necesaria para proporcionarle los servicios. Si cancela su cuenta, eliminaremos sus datos personales en un plazo razonable, a menos que la ley exija su conservación.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">8. Cambios en esta Política</h2>
              <p className="leading-relaxed">
                Podemos actualizar nuestra Política de Privacidad periódicamente. Le notificaremos cualquier cambio significativo publicando la nueva política en este sitio web.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
