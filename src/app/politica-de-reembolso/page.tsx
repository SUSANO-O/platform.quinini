import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

export default function ReembolsoPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />
      
      <main className="flex-grow pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-8" style={{ color: '#00f8e5' }}>Política de Reembolso</h1>
          
          <div className="max-w-none space-y-10 text-sm md:text-base" style={{ color: 'var(--muted-foreground)' }}>
            <p>Última actualización: 18 de abril de 2026</p>
            
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">1. Suscripciones y Facturación</h2>
              <p className="leading-relaxed">
                MatIAs opera bajo un modelo de suscripción de pago por adelantado. Al contratar un plan, usted acepta que se le facture el importe total correspondiente al periodo seleccionado (mensual o anual).
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">2. Periodos de Prueba</h2>
              <p className="leading-relaxed">
                Ofrecemos periodos de prueba gratuitos o planes de nivel de entrada para que los usuarios puedan evaluar el servicio antes de realizar un pago. Le recomendamos encarecidamente utilizar estas opciones para asegurarse de que el servicio satisface sus necesidades antes de suscribirse a un plan de pago.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">3. Condiciones de Reembolso</h2>
              <p className="leading-relaxed">
                Como regla general, <strong>no ofrecemos reembolsos</strong> por periodos de suscripción ya facturados o por el tiempo no utilizado en un ciclo de facturación. Sin embargo, revisaremos casos excepcionales bajo las siguientes condiciones:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li><strong>Errores de Facturación:</strong> Si se ha producido un error técnico que resultó en un cargo duplicado o incorrecto.</li>
                <li><strong>Fallo del Servicio:</strong> Si MatIAs no ha podido proporcionar el servicio debido a una interrupción prolongada y crítica de nuestra infraestructura durante más del 5% del tiempo en un mes determinado.</li>
                <li><strong>Legislación Local:</strong> Residentes de la Unión Europea u otras jurisdicciones con leyes de protección al consumidor específicas pueden tener derechos adicionales de desistimiento durante los primeros 14 días, siempre que no hayan comenzado a utilizar intensivamente los recursos del plan (como créditos de IA o tokens).</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">4. Cancelación</h2>
              <p className="leading-relaxed">
                Usted puede cancelar su suscripción en cualquier momento desde su panel de control. La cancelación evitará futuros cargos, pero no dará derecho a un reembolso por la parte proporcional del mes o año en curso. Seguirá teniendo acceso a las funciones de su plan hasta el final del periodo de facturación actual.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">5. Proceso de Solicitud</h2>
              <p className="leading-relaxed">
                Para solicitar la revisión de un caso excepcional de reembolso, debe contactar con nuestro equipo de soporte técnico proporcionando los detalles de su cuenta y el motivo de la solicitud. Evaluaremos cada solicitud de forma individual en un plazo máximo de 10 días hábiles.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">6. Cambios en la Política</h2>
              <p className="leading-relaxed">
                MatIAs se reserva el derecho de modificar esta política de reembolso en cualquier momento para reflejar cambios en el servicio o requisitos legales.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
