import { NextResponse } from 'next/server';
import {
  isRagBlobUploadEnabled,
  ragDirectUploadMaxMb,
  ragMaxFileSizeMb,
} from '@/lib/rag-upload-limits';

export async function GET() {
  return NextResponse.json({
    blobEnabled: isRagBlobUploadEnabled(),
    maxFileMb: ragMaxFileSizeMb(),
    maxDirectMb: ragDirectUploadMaxMb(),
  });
}
