import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import * as queries from '@/lib/db/queries';

export async function POST(request: Request) {
  // Check authentication
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Extract file data from the request
    const data = await request.json();
    const { fileUrl, fileName, fileType, fileSize, fileId } = data;

    if (!fileUrl || !fileName || !fileId) {
      return NextResponse.json(
        { error: 'Missing required file information' },
        { status: 400 },
      );
    }

    // Attempt to extract text from the uploaded file
    const extractionResponse = await fetch(
      `${process.env.NEXTAUTH_URL}/api/files/extract`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: fileName,
          fileType: fileType,
          fileSize: fileSize,
          fileUrl: fileUrl,
        }),
      },
    );

    if (!extractionResponse.ok && extractionResponse.status !== 422) {
      // Only treat as error if it's not the "unprocessable entity" status from our fallback
      console.error('[Files API] Failed to extract text from file:', fileName);
      return NextResponse.json(
        { error: 'Failed to extract text from file' },
        { status: 500 },
      );
    }

    const extractionResult = await extractionResponse.json();

    // Even if extraction returned 422, we might still have useful fallback info
    if (extractionResponse.status === 422) {
      console.warn(
        '[Files API] File extraction yielded unprocessable entity:',
        extractionResult.error,
      );
    }

    // For now, as we don't have a direct repository for files
    // we'll just return the extraction result
    // In a production app, you would save this to the database

    return NextResponse.json({
      success: true,
      fileId: fileId,
      extractionResult: extractionResult,
    });
  } catch (error) {
    console.error('[Files API] Error processing file:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 },
    );
  }
}
