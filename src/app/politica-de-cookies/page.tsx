import React from 'react';
import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

export default function CookiesPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />
      
      <main className="flex-grow pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-4xl font-bold mb-8" style={{ color: '#f87600' }}>Política de Cookies</h1>
          
          <div className="max-w-none space-y-10 text-sm md:text-base" style={{ color: 'var(--muted-foreground)' }}>
            <p>Última actualización: 18 de abril de 2026</p>
            
            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">1. ¿Qué son las Cookies?</h2>
              <p className="leading-relaxed">
                Las cookies son pequeños archivos de texto que se almacenan en su navegador cuando visita un sitio web. Ayudan a que el sitio web funcione correctamente, sea más seguro y proporcione una mejor experiencia de usuario.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">2. ¿Cómo utilizamos las Cookies?</h2>
              <p className="leading-relaxed">
                En MatIAs (AIBackHub), utilizamos cookies para:
              </p>
              <ul className="list-disc pl-6 space-y-3">
                <li><strong>Autenticación:</strong> Mantener su sesión iniciada y proteger su cuenta.</li>
                <li><strong>Preferencias:</strong> Recordar sus ajustes personales y preferencias de idioma.</li>
                <li><strong>Seguridad:</strong> Detectar y prevenir fraudes o actividades maliciosas.</li>
                <li><strong>Análisis:</strong> Comprender cómo los usuarios navegan por nuestro sitio para mejorar el servicio.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">3. Tipos de Cookies que utilizamos</h2>
              <ul className="list-disc pl-6 space-y-3">
                <li><strong>Cookies Esenciales:</strong> Necesarias para el funcionamiento básico del sitio. Sin ellas, no podría acceder a su cuenta ni realizar pagos.</li>
                <li><strong>Cookies Analíticas:</strong> Nos ayudan a medir el tráfico y el rendimiento del sitio.</li>
                <li><strong>Cookies de Terceros:</strong> Algunos servicios externos, como Stripe (para pagos) o Google Analytics (para estadísticas), pueden instalar sus propias cookies.</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">4. ¿Cómo controlar las Cookies?</h2>
              <p className="leading-relaxed">
                Usted puede controlar o eliminar las cookies a través de la configuración de su navegador. Tenga en cuenta que si desactiva las cookies esenciales, algunas funciones de MatIAs podrían no estar disponibles o no funcionar correctamente.
              </p>
              <p className="leading-relaxed">
                Para obtener más información sobre cómo gestionar las cookies en su navegador específico, consulte los menús de ayuda de Chrome, Firefox, Safari o Edge.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">5. Contacto</h2>
              <p className="leading-relaxed">
                Si tiene dudas sobre nuestra política de cookies, no dude en contactarnos.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
