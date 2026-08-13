/**
 *   npx tsx --env-file=.env scripts/probe-widget-ai-beam.mts [widgetId]
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db/connection.ts';
import { Widget } from '../src/lib/db/models.ts';
import { pickWidgetAppearancePatch } from '../src/lib/widget-ai-beam.ts';

const id = (process.argv[2] || '6a03a54c4f69fa7fa9027170').trim();

async function main() {
  await connectDB();
  const before = await Widget.findById(id).lean();
  if (!before) {
    console.error('Widget not found', id);
    process.exit(1);
  }
  console.log('BEFORE', {
    color: before.color,
    theme: before.theme,
    aiBeamScope: (before as { aiBeamScope?: string }).aiBeamScope,
    aiBeamPalette: (before as { aiBeamPalette?: string }).aiBeamPalette,
    aiBeamColor: (before as { aiBeamColor?: string }).aiBeamColor,
  });

  const patch = pickWidgetAppearancePatch({
    ...(before as Record<string, unknown>),
    color: '#ff9752',
    theme: 'dark',
    aiBeamScope: 'both',
    aiBeamPalette: 'custom',
    aiBeamColor: '#ff9752',
    aiBeamBlur: 8,
    aiBeamSpeed: 4,
    aiBeamIntensity: 90,
  });

  await Widget.updateOne({ _id: id }, { $set: patch });
  const after = await Widget.findById(id).lean();
  console.log('PATCH', patch);
  console.log('AFTER', {
    color: after?.color,
    theme: after?.theme,
    aiBeamScope: (after as { aiBeamScope?: string })?.aiBeamScope,
    aiBeamPalette: (after as { aiBeamPalette?: string })?.aiBeamPalette,
    aiBeamColor: (after as { aiBeamColor?: string })?.aiBeamColor,
    aiBeamBlur: (after as { aiBeamBlur?: number })?.aiBeamBlur,
  });
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
