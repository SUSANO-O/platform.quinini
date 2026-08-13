import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { Widget } from '../src/lib/db/models.ts';

const id = process.argv[2] || '6a03a54c4f69fa7fa9027170';

async function main() {
  await connectDB();
  const w = await Widget.findById(id).lean();
  console.log('found', Boolean(w));
  if (!w) {
    process.exit(1);
  }
  const doc = w as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        name: doc.name,
        color: doc.color,
        theme: doc.theme,
        aiBeamScope: doc.aiBeamScope,
        aiBeamPalette: doc.aiBeamPalette,
        aiBeamColor: doc.aiBeamColor,
        aiBeamBlur: doc.aiBeamBlur,
        aiBeamSpeed: doc.aiBeamSpeed,
        aiBeamIntensity: doc.aiBeamIntensity,
        updatedAt: doc.updatedAt,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
