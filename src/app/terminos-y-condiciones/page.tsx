import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

export default function TerminosPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />
      
      <main className="flex-grow pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-8" style={{ color: '#e41414' }}>Términos y Condiciones de Uso</h1>
          
          <div className="max-w-none space-y-10 text-sm md:text-base" style={{ color: 'var(--muted-foreground)' }}>
            <p>Última actualización: 18 de abril de 2026</p>
            
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">1. Aceptación de los Términos</h2>
              <p className="leading-relaxed">
                Al acceder y utilizar los servicios de MatIAs (operado por AIBackHub), usted acepta cumplir y estar sujeto a los siguientes términos y condiciones. Si no está de acuerdo con alguna parte de estos términos, no podrá utilizar nuestros servicios.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">2. Descripción del Servicio</h2>
              <p className="leading-relaxed">
                MatIAs proporciona una plataforma de Agentes de Inteligencia Artificial como Servicio (SaaS), que incluye acceso a APIs, widgets de chat personalizables, procesamiento de documentos (RAG) y herramientas de análisis. El servicio se ofrece en modalidades gratuita y de pago (suscripción).
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">3. Uso Responsable de la IA</h2>
              <p className="leading-relaxed">
                Usted comprende y acepta que:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li>Las respuestas generadas por los agentes de IA pueden contener errores o imprecisiones.</li>
                <li>MatIAs no proporciona asesoramiento médico, legal, financiero o profesional vinculante. El uso de la información generada es bajo su propio riesgo.</li>
                <li>Está prohibido utilizar el servicio para generar contenido ilegal, difamatorio, dañino o que infrinja derechos de terceros.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">4. Cuentas y Seguridad</h2>
              <p className="leading-relaxed">
                Usted es responsable de mantener la confidencialidad de sus credenciales de acceso y de todas las actividades que ocurran bajo su cuenta. Debe notificarnos inmediatamente sobre cualquier uso no autorizado de su cuenta.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">5. Pagos y Suscripciones</h2>
              <p className="leading-relaxed">
                Los planes de pago se facturan por adelantado de forma mensual o anual. No se ofrecen reembolsos por periodos parciales de servicio, a menos que la ley local exija lo contrario. Usted puede cancelar su suscripción en cualquier momento desde su panel de control.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">6. Propiedad Intelectual</h2>
              <p className="leading-relaxed">
                Todo el contenido, marcas y tecnología relacionados con MatIAs son propiedad de AIBackHub o sus licenciantes. Usted conserva los derechos sobre los datos e información que cargue en la plataforma, pero nos otorga una licencia limitada para procesar dicha información con el fin de prestarle el servicio.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">7. Limitación de Responsabilidad</h2>
              <p className="leading-relaxed">
                En la medida máxima permitida por la ley, MatIAs no será responsable de ningún daño indirecto, incidental, especial o consecuente que resulte del uso o la imposibilidad de usar el servicio.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">8. Modificaciones</h2>
              <p className="leading-relaxed">
                Nos reservamos el derecho de modificar estos términos en cualquier momento. Los cambios entrarán en vigor inmediatamente después de su publicación en este sitio web.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">9. Contacto</h2>
              <p className="leading-relaxed">
                Si tiene alguna pregunta sobre estos Términos, por favor contáctenos a través de nuestro soporte técnico.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
