/**
 * Fábrica del servicio de pagos.
 * Importar `getPaymentService()` en vez de llamar directamente a cualquier
 * librería de proveedor — esto aplica Inversión de Dependencias.
 */

import { PaddleAdapter } from './paddle-adapter';
import type { PaymentServiceInterface } from './interface';

let _instance: PaymentServiceInterface | null = null;

export function getPaymentService(): PaymentServiceInterface {
  if (!_instance) _instance = new PaddleAdapter();
  return _instance;
}

export type { PaymentServiceInterface };
export type {
  CreateCheckoutParams,
  CheckoutResult,
  CreateTopupCheckoutParams,
  ChangePlanParams,
  InvoiceItem,
} from './interface';
