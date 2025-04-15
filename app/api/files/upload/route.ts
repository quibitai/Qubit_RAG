import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/app/(auth)/auth';

// Allowed file types for upload
const ALLOWED_FILE_TYPES = [
  // Text and document formats
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  // Programming languages
  'text/javascript',
  'application/javascript',
  'text/x-python',
  'text/x-java',
  'text/x-c',
  'text/x-typescript',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    .refine(
      (file) => {
        // For text files without a proper MIME type, allow them
        if (file.type === '' || file.type === 'application/octet-stream') {
          return true;
        }
        return ALLOWED_FILE_TYPES.includes(file.type);
      },
      {
        message: `File type not supported. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`,
      },
    ),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();
    const contentType = file.type || 'application/octet-stream';

    try {
      const data = await put(`${filename}`, fileBuffer, {
        access: 'public',
        contentType: contentType,
      });

      return NextResponse.json(data);
    } catch (error) {
      console.error('Upload to Vercel Blob failed:', error);
      return NextResponse.json(
        { error: 'Upload failed. Please try again.' },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Request processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
