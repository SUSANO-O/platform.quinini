import type { Model } from 'mongoose';
import { connectDB } from '@/lib/db/connection';
import { AccountExportChunk } from '@/lib/db/models';
import { PURGE_CHILDREN, PURGE_ROOTS, buildOwnershipFilter } from '../domain/purge-scope';
import type { AccountOwnership } from '../ports/IAccountOwnership';
import type { IAccountExporter } from '../ports/IAccountExporter';

/** Documentos por trozo: chico para no acercarse al límite de 16 MB por documento. */
const PAGE_SIZE = 200;
/** Cuánto vive el respaldo. Suficiente para revertir un error, sin eternizar datos. */
const RETENTION_DAYS = 30;

type ModelResolver = (name: string) => Model<unknown>;

/**
 * Respaldo previo al borrado: copia lo mismo que se va a purgar, por trozos,
 * con expiración automática. Si esto falla, el caso de uso no borra nada.
 */
export function createMongoAccountExporter(modelFor: ModelResolver): IAccountExporter {
  return {
    async export(owned: AccountOwnership) {
      await connectDB();
      const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

      for (const target of [...PURGE_CHILDREN, ...PURGE_ROOTS]) {
        const filter = buildOwnershipFilter(target, owned);
        if (!filter) continue;

        const model = modelFor(target.model);
        let page = 0;
        for (;;) {
          const docs = await model.find(filter).skip(page * PAGE_SIZE).limit(PAGE_SIZE).lean();
          if (!docs.length) break;
          await AccountExportChunk.create({
            userId: owned.accountId, model: target.model, page, documents: docs, expiresAt,
          });
          if (docs.length < PAGE_SIZE) break;
          page += 1;
        }
      }

      return { location: `accountexportchunks?userId=${owned.accountId}` };
    },
  };
}
