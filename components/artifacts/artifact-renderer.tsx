import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown';

export type ArtifactKind = 'text' | 'code' | 'image' | 'sheet';

interface ArtifactData {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  status: 'created' | 'updated' | 'streaming';
  timestamp: string;
}

interface ArtifactRendererProps {
  artifact: ArtifactData;
  isStreaming?: boolean;
}

// Enhanced CSV table rendering
const renderCSVTable = (content: string) => {
  const lines = content.trim().split('\n');
  if (lines.length === 0)
    return (
      <pre className="text-sm font-mono dark:text-gray-300">{content}</pre>
    );

  try {
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    const rows = lines
      .slice(1)
      .map((line) =>
        line.split(',').map((cell) => cell.trim().replace(/"/g, '')),
      );

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800">
              {headers.map((header, i) => (
                <th
                  key={`header-${header}-${i}`}
                  className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-medium dark:text-gray-200"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`row-${i}-${row[0] || i}`}
                className={
                  i % 2 === 0
                    ? 'bg-white dark:bg-gray-900'
                    : 'bg-gray-50 dark:bg-gray-800'
                }
              >
                {row.map((cell, j) => (
                  <td
                    key={`cell-${i}-${j}-${cell}`}
                    className="border border-gray-300 dark:border-gray-600 px-3 py-2 dark:text-gray-300"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch (error) {
    return (
      <pre className="text-sm font-mono dark:text-gray-300">{content}</pre>
    );
  }
};

export const ArtifactRenderer = memo(({ artifact }: ArtifactRendererProps) => {
  const { id, title, kind, content, status, timestamp } = artifact;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success('Content copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy content');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Better file extensions based on content type
    let extension = 'txt';
    if (kind === 'code') {
      // Try to detect language from content
      if (content.includes('def ') || content.includes('import '))
        extension = 'py';
      else if (content.includes('function ') || content.includes('const '))
        extension = 'js';
      else if (content.includes('class ') && content.includes('public '))
        extension = 'java';
      else extension = 'txt';
    } else if (kind === 'sheet') {
      extension = 'csv';
    } else if (kind === 'text') {
      extension = 'md'; // Save as markdown
    }

    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('File downloaded');
  };

  const renderContent = () => {
    switch (kind) {
      case 'code':
        return (
          <div className="bg-gray-900 dark:bg-gray-950 text-gray-100 p-4 rounded-lg overflow-x-auto">
            <pre className="text-sm">
              <code className="language-auto">{content}</code>
            </pre>
          </div>
        );

      case 'sheet':
        // Try to render as table if it looks like CSV, otherwise fallback to monospace
        if (content.includes(',') && content.includes('\n')) {
          return (
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
              {renderCSVTable(content)}
            </div>
          );
        } else {
          return (
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
              <pre className="text-sm font-mono dark:text-gray-300">
                {content}
              </pre>
            </div>
          );
        }

      case 'image':
        return (
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 italic">
              {content}
            </p>
          </div>
        );

      case 'text':
      default:
        // Use the proper Markdown component that handles hyperlinks
        return (
          <div className="p-4 prose prose-gray dark:prose-invert max-w-none">
            <Markdown>{content}</Markdown>
          </div>
        );
    }
  };

  return (
    <div className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex flex-row items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-lg font-semibold dark:text-gray-100">{title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-1 text-xs rounded ${
                status === 'streaming'
                  ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                  : status === 'created'
                    ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                    : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
              }`}
            >
              {status}
            </span>
            <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600">
              {kind}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="dark:hover:bg-gray-800"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
        {renderContent()}
      </div>
    </div>
  );
});

ArtifactRenderer.displayName = 'ArtifactRenderer';
