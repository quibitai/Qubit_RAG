import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Code, Image, Table, ChevronRight } from 'lucide-react';
import type { ArtifactKind } from './artifact';
import { Markdown } from '@/components/markdown';

interface CollapsedArtifactProps {
  title: string;
  kind: ArtifactKind;
  content: string;
  onExpand: () => void;
}

const getArtifactIcon = (kind: ArtifactKind) => {
  switch (kind) {
    case 'text':
      return <FileText className="h-4 w-4" />;
    case 'code':
      return <Code className="h-4 w-4" />;
    case 'image':
      return <Image className="h-4 w-4" />;
    case 'sheet':
      return <Table className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getContentPreview = (content: string, kind: ArtifactKind) => {
  const maxChars = 150;
  const maxLines = 3;

  const contentWithoutHeaders = content.replace(/^#+\s+.*/gm, '').trimStart();

  if (kind === 'code') {
    const lines = contentWithoutHeaders.split('\n');
    let preview = lines.slice(0, maxLines).join('\n');
    if (preview.length > maxChars) {
      preview = preview.substring(0, maxChars);
    }
    return `${preview}${lines.length > maxLines || preview.length === maxChars ? '...' : ''}`;
  } else if (kind === 'text') {
    const lines = contentWithoutHeaders
      .split('\n')
      .filter((line) => line.trim() !== '');
    let preview = lines.slice(0, maxLines).join('\n');
    if (preview.length > maxChars) {
      preview = preview.substring(0, maxChars);
    }
    return `${preview}${contentWithoutHeaders.length > preview.length || lines.length > maxLines ? '...' : ''}`;
  }

  if (contentWithoutHeaders.length <= maxChars) return contentWithoutHeaders;
  return `${contentWithoutHeaders.substring(0, maxChars)}...`;
};

function PureCollapsedArtifact({
  title,
  kind,
  content,
  onExpand,
}: CollapsedArtifactProps) {
  const preview = getContentPreview(content, kind);

  return (
    <Card
      className="w-full max-w-2xl mx-auto my-2 bg-background border border-border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={onExpand}
    >
      <CardHeader className="pb-3 pt-3 px-4">
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <div className="flex items-center gap-2 truncate">
            {getArtifactIcon(kind)}
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {kind !== 'text' && (
              <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded-sm">
                {kind}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        <div
          className={`text-sm text-muted-foreground mt-1 p-1 ${kind === 'code' ? 'font-mono bg-muted rounded whitespace-pre-wrap' : 'whitespace-pre-line'}`}
        >
          {kind === 'text' ? <Markdown>{preview}</Markdown> : preview}
        </div>
      </CardContent>
    </Card>
  );
}

export const CollapsedArtifact = memo(PureCollapsedArtifact);
