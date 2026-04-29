import { Navbar } from '@/components/shared/navbar';
import { Footer } from '@/components/shared/footer';

type FaqItem = {
  question: string;
  answer: string;
  source: string;
};

const FAQS: FaqItem[] = [
  {
    source: 'Landing principal',
    question: '¿Qué incluye el trial de 7 días?',
    answer: 'Incluye acceso completo al Widget Builder, todos los agentes y el SDK durante el periodo de prueba.',
  },
  {
    source: 'Landing principal',
    question: '¿Necesito tarjeta de crédito para registrarme?',
    answer: 'No. Puedes crear cuenta con email y contraseña. La tarjeta solo se solicita al elegir un plan de pago.',
  },
  {
    source: 'Landing principal',
    question: '¿Puedo cancelar en cualquier momento?',
    answer: 'Sí. No hay contratos ni penalizaciones. Si cancelas, mantienes acceso hasta terminar el periodo pagado.',
  },
  {
    source: 'Landing principal',
    question: '¿El widget funciona en cualquier sitio web?',
    answer: 'Sí. Funciona en cualquier sitio que permita insertar el script e inicializar el widget.',
  },
  {
    source: 'Landing principal',
    question: '¿Qué pasa si supero el límite de requests?',
    answer: 'Recibes aviso antes de llegar al límite para actualizar plan o esperar al siguiente ciclo.',
  },
  {
    source: 'Widget API',
    question: '¿Puedo usar el widget en cualquier framework?',
    answer: 'Sí. Puedes usarlo en React, Vue, Angular, WordPress, Webflow o HTML puro porque se integra con script tag.',
  },
  {
    source: 'Widget API',
    question: '¿Cómo protejo el widget para que solo funcione en mi dominio?',
    answer: 'Define allowedOrigins al crear el widget. Si alguien usa tu token fuera de esos dominios, se bloquea.',
  },
  {
    source: 'Widget API',
    question: '¿Puedo tener múltiples widgets con diferentes agentes?',
    answer: 'Sí. Cada widget usa su propio token y puede apuntar a agentes distintos según tu plan.',
  },
  {
    source: 'Widget API',
    question: '¿Qué pasa si supero el límite diario de mensajes?',
    answer: 'La API responde con límite excedido y el usuario ve un mensaje amigable hasta el reinicio del ciclo.',
  },
  {
    source: 'Precios',
    question: '¿Qué límites tiene cada plan?',
    answer: 'Cada plan define límites de requests por minuto y requests mensuales. Puedes revisar ese resumen en la sección de Precios.',
  },
];

export default function PreguntasFrecuentesPage() {
  return (
    <div style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      <Navbar />

      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="badge-primary mb-5 mx-auto w-fit">Centro de ayuda</div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              Preguntas <span className="gradient-text">frecuentes</span>
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'var(--muted-foreground)' }}>
              Aquí reunimos las preguntas más comunes de la landing, Widget API y Precios en una sola vista.
            </p>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq) => (
              <details
                key={`${faq.source}-${faq.question}`}
                className="rounded-xl overflow-hidden card-texture"
                style={{ border: '1px solid var(--border)' }}
              >
                <summary
                  className="px-6 py-4 font-semibold cursor-pointer text-sm flex items-center justify-between"
                  style={{ listStyle: 'none' }}
                >
                  {faq.question}
                  <span style={{ color: 'var(--primary)', fontSize: 18, fontWeight: 300 }}>+</span>
                </summary>
                <div className="px-6 pb-5">
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>
                    {faq.source}
                  </p>
                  <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                    {faq.answer}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
