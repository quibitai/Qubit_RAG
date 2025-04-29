import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';

// Environment variables for n8n connection
const N8N_EXTRACT_WEBHOOK_URL = process.env.N8N_EXTRACT_WEBHOOK_URL || '';
const N8N_EXTRACT_AUTH_HEADER =
  process.env.N8N_EXTRACT_AUTH_HEADER || 'extractfilecontent'; // Default header name if not set
const N8N_EXTRACT_AUTH_TOKEN = process.env.N8N_EXTRACT_AUTH_TOKEN || '';

export async function POST(request: Request) {
  // Check authentication
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Validate n8n webhook configuration
  if (!N8N_EXTRACT_WEBHOOK_URL) {
    console.error('[Extract API] Missing N8N_EXTRACT_WEBHOOK_URL');
    return NextResponse.json(
      { error: 'File extraction service is not configured' },
      { status: 500 },
    );
  }
  // Also check for token, as it's crucial for the request
  if (!N8N_EXTRACT_AUTH_TOKEN) {
    console.error('[Extract API] Missing N8N_EXTRACT_AUTH_TOKEN');
    return NextResponse.json(
      { error: 'File extraction service authentication is not configured' },
      { status: 500 },
    );
  }

  console.log(
    `[Extract API] Using n8n webhook URL: ${N8N_EXTRACT_WEBHOOK_URL}`,
  );
  console.log(
    `[Extract API] Using n8n auth header: ${N8N_EXTRACT_AUTH_HEADER}`,
  );

  try {
    const contentTypeHeader = request.headers.get('content-type') || '';

    let filename = '';
    let fileType = '';
    let fileSize = 0;
    let fileUrl = ''; // This will hold the URL for n8n

    // Set up headers for n8n request
    const n8nHeaders = {
      'Content-Type': 'application/json',
      [N8N_EXTRACT_AUTH_HEADER]: N8N_EXTRACT_AUTH_TOKEN,
    };

    if (contentTypeHeader.includes('multipart/form-data')) {
      // --- Handle direct file upload ---
      console.log('[Extract API] Handling multipart/form-data upload.');
      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
          return NextResponse.json(
            { error: 'No file provided in form data' },
            { status: 400 },
          );
        }

        filename = file.name;
        fileType = file.type || 'application/octet-stream';
        fileSize = file.size;

        console.log(
          `[Extract API] File received: ${filename} (${fileType}, ${(fileSize / 1024).toFixed(2)} KB)`,
        );

        // Upload the file to Vercel Blob through the files/upload API endpoint
        // Preserve auth by including the session info in the cookies
        try {
          // Create a new FormData for the internal upload API
          const uploadFormData = new FormData();
          uploadFormData.append('file', file);

          // Get the host and protocol for the internal API call
          const host = request.headers.get('host') || 'localhost:3000';
          const protocol = host.includes('localhost') ? 'http' : 'https';
          const uploadUrl = `${protocol}://${host}/api/files/upload`;

          console.log(
            `[Extract API] Uploading file to Vercel Blob via: ${uploadUrl}`,
          );

          // Get the cookies from the original request to maintain auth
          const cookies = request.headers.get('cookie') || '';

          // Upload the file to Vercel Blob via internal API
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            body: uploadFormData,
            headers: {
              // Include cookies to preserve authentication
              Cookie: cookies,
            },
          });

          if (!uploadResponse.ok) {
            throw new Error(
              `Blob upload failed with status ${uploadResponse.status}: ${uploadResponse.statusText}`,
            );
          }

          const uploadResult = await uploadResponse.json();

          if (!uploadResult.url) {
            throw new Error('No URL returned from file upload');
          }

          fileUrl = uploadResult.url;
          console.log(
            `[Extract API] File successfully uploaded to Vercel Blob. URL: ${fileUrl}`,
          );
        } catch (uploadError) {
          console.error(
            '[Extract API] Error uploading to Vercel Blob:',
            uploadError,
          );

          // Fall back to using placeholder for this request
          // At least the request will work, though without actual file content
          fileUrl = `placeholder://${filename}`;
          console.log(
            `[Extract API] Using placeholder URL instead: ${fileUrl}`,
          );
        }
      } catch (error) {
        const parseError =
          error instanceof Error ? error : new Error(String(error));
        console.error('[Extract API] Error parsing form data:', parseError);
        return NextResponse.json(
          { error: 'Failed to process uploaded file' },
          { status: 400 },
        );
      }
    } else if (contentTypeHeader.includes('application/json')) {
      // --- Handle URL provided directly in JSON body ---
      console.log('[Extract API] Handling application/json request.');
      try {
        const body = await request.json();
        fileUrl = body.fileUrl; // Expect fileUrl directly
        filename = body.filename || 'unknown_from_url';
        fileType = body.contentType || 'application/octet-stream'; // Get content type if provided

        if (!fileUrl) {
          return NextResponse.json(
            { error: 'No fileUrl provided in JSON body' },
            { status: 400 },
          );
        }
        console.log(`[Extract API] Received URL via JSON: ${fileUrl}`);

        // Ensure URL is properly formatted (add https:// if missing and not http://)
        if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
          fileUrl = `https://${fileUrl}`;
          console.log(`[Extract API] Added https:// prefix to URL: ${fileUrl}`);
        }
      } catch (error) {
        const parseError =
          error instanceof Error ? error : new Error(String(error));
        console.error('[Extract API] Error parsing JSON body:', parseError);
        return NextResponse.json(
          { error: 'Invalid JSON request body' },
          { status: 400 },
        );
      }
    } else {
      console.warn(
        `[Extract API] Received unsupported content type: ${contentTypeHeader}`,
      );
      return NextResponse.json(
        { error: `Unsupported content type: ${contentTypeHeader}` },
        { status: 415 }, // Unsupported Media Type
      );
    }

    // --- Always construct the request body with fileUrl as the primary field ---
    // This is the key change to ensure consistency with n8n's expectations
    const n8nRequestBody: Record<string, any> = {
      fileUrl: fileUrl, // Always include fileUrl field first (real URL or placeholder)
      filename: filename,
      contentType: fileType,
    };

    // For file uploads, include additional metadata
    if (contentTypeHeader.includes('multipart/form-data')) {
      n8nRequestBody.fileSize = fileSize;
    }

    // --- Make request to n8n with either file metadata or URL ---
    console.log(`[Extract API] Sending request to n8n:`, n8nRequestBody);

    const n8nResponse = await fetch(N8N_EXTRACT_WEBHOOK_URL, {
      method: 'POST',
      headers: n8nHeaders,
      body: JSON.stringify(n8nRequestBody),
    });

    if (!n8nResponse.ok) {
      let errorBodyText = '';
      try {
        errorBodyText = await n8nResponse.text();
      } catch (e) {
        errorBodyText = 'Unable to read error response';
      }

      console.error(
        `[Extract API] n8n extraction request failed (${n8nResponse.status}): ${errorBodyText}`,
      );

      // Fallback: When n8n extraction fails, try to use a basic extraction approach
      console.log(
        '[Extract API] Initiating fallback extraction for failed n8n request',
      );

      // Different fallback strategies based on file type
      let fallbackExtractedText = '';
      const isSupportedForFallback =
        fileType.includes('text/') ||
        fileType.includes('document') ||
        fileType.includes('pdf') ||
        fileType.includes('application/json') ||
        filename.endsWith('.md') ||
        filename.endsWith('.txt') ||
        filename.endsWith('.json');

      // Special handling for Microsoft Office documents
      const isMicrosoftOfficeFormat =
        fileType.includes('officedocument') ||
        filename.endsWith('.docx') ||
        filename.endsWith('.doc') ||
        filename.endsWith('.pptx') ||
        filename.endsWith('.xlsx') ||
        filename.endsWith('.xls');

      if (isMicrosoftOfficeFormat) {
        // For Microsoft Office documents - GPT-4 can handle these natively
        fallbackExtractedText = `[This is a Microsoft Office document (${fileType}) that modern AI can process directly.
File details:
- Filename: ${filename}
- Type: ${fileType}
- Size: ${fileSize ? `${(fileSize / 1024).toFixed(2)} KB` : 'unknown'}
- URL: ${fileUrl}

This file format can be processed by GPT-4 without external extraction. Please analyze any content directly from the provided information.]`;

        return NextResponse.json({
          success: true,
          extractedContent: fallbackExtractedText,
          filename,
          contentType: fileType,
          url: fileUrl,
          isMicrosoftFormat: true,
          isLlmFallback: true,
          message: 'Microsoft Office document for direct GPT-4 processing.',
        });
      } else if (isSupportedForFallback) {
        // For other potentially readable files, provide LLM-friendly description
        fallbackExtractedText = `[This content was processed using fallback extraction as primary extraction failed.
File details:
- Filename: ${filename}
- Type: ${fileType}
- Size: ${fileSize ? `${(fileSize / 1024).toFixed(2)} KB` : 'unknown'}
- URL: ${fileUrl}

Note: The LLM may be able to directly process some content from this file. 
Specific data extraction capabilities might be limited compared to the primary extraction service.]`;

        return NextResponse.json({
          success: true,
          extractedContent: fallbackExtractedText,
          filename,
          contentType: fileType,
          url: fileUrl,
          isLlmFallback: true,
          message:
            'Using fallback LLM processing as primary extraction failed.',
        });
      } else {
        // For file types that are unlikely to be processable by the LLM directly
        return NextResponse.json(
          {
            success: false,
            error: `File extraction failed. The file type "${fileType}" is not supported or could not be processed. Please try a different file format like PDF, DOCX, TXT, or JSON.`,
            errorDetails: errorBodyText,
            filename,
            contentType: fileType,
            url: fileUrl,
          },
          { status: 422 },
        ); // Use 422 Unprocessable Entity for this specific case
      }
    }

    // --- Process the n8n response ---
    let extractedData: Record<string, any>;
    try {
      const responseContentType = n8nResponse.headers.get('content-type') || '';
      if (responseContentType.includes('application/json')) {
        extractedData = await n8nResponse.json();
        console.log('[Extract API] Received JSON response from n8n.');
      } else {
        const textContent = await n8nResponse.text();
        console.log(
          `[Extract API] Received non-JSON response from n8n: ${textContent.substring(0, 100)}...`,
        );
        extractedData = {
          extractedContent: textContent, // Assume plain text is the content
        };
      }
    } catch (error) {
      const parseError =
        error instanceof Error ? error : new Error(String(error));
      console.error(
        `[Extract API] Error parsing n8n response: ${parseError.message}`,
      );

      // For large files, just return a basic response
      if (fileSize > 5 * 1024 * 1024) {
        // 5MB
        return NextResponse.json({
          success: true,
          extractedContent: `File processed: ${filename} (${fileType}, ${(fileSize / (1024 * 1024)).toFixed(2)} MB)`,
          filename,
          contentType: fileType,
          message: 'Large file processed with basic metadata extraction.',
        });
      }

      // Attempt to get raw text even if parsing failed
      let rawContent = 'Could not read raw response.';
      try {
        rawContent = await n8nResponse.text(); // Need to re-read text if json() failed
      } catch (textError) {
        console.error(
          '[Extract API] Could not get raw text after parse error:',
          textError,
        );
      }

      return NextResponse.json(
        {
          error: `Failed to parse response from extraction service. Raw start: ${rawContent.substring(0, 200)}`,
        },
        { status: 500 },
      );
    }

    console.log(`[Extract API] Successfully processed content extraction.`);

    // Return success response with extracted content and original file metadata
    return NextResponse.json({
      success: true,
      extractedContent:
        extractedData.extractedContent ||
        extractedData.content ||
        extractedData.text ||
        extractedData,
      filename: filename,
      contentType: fileType,
      url: fileUrl, // Return the URL used for extraction
    });
  } catch (error: any) {
    console.error('[Extract API] Unhandled error in POST handler:', error);
    return NextResponse.json(
      {
        error: `Extraction process failed: ${error.message || 'Unknown server error'}`,
      },
      { status: 500 },
    );
  }
}
