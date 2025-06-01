import { memo } from 'react';

import type { ArtifactKind } from './artifact';
import { FileIcon, LoaderIcon, MessageIcon, PencilEditIcon } from './icons';
import { toast } from 'sonner';
import { useArtifact } from '@/hooks/use-artifact';

const getActionText = (
  type: 'create' | 'update' | 'request-suggestions',
  tense: 'present' | 'past',
) => {
  switch (type) {
    case 'create':
      return tense === 'present' ? 'Creating' : 'Created';
    case 'update':
      return tense === 'present' ? 'Updating' : 'Updated';
    case 'request-suggestions':
      return tense === 'present'
        ? 'Adding suggestions'
        : 'Added suggestions to';
    default:
      return null;
  }
};

interface DocumentToolResultProps {
  type: 'create' | 'update' | 'request-suggestions';
  result: { id: string; title: string; kind: ArtifactKind };
  isReadonly: boolean;
  onArtifactExpand?: (artifactId: string) => void;
}

function PureDocumentToolResult({
  type,
  result,
  isReadonly,
  onArtifactExpand,
}: DocumentToolResultProps) {
  // const { artifact } = useArtifact(); // Reverted: Remove global artifact state check

  // Reverted: Remove conditional rendering based on global artifact state
  // if (artifact.isVisible && artifact.documentId === result.id) {
  //   return null;
  // }

  return (
    <button
      type="button"
      className="bg-background cursor-pointer border py-2 px-3 rounded-xl w-fit flex flex-row gap-3 items-start"
      onClick={(event) => {
        if (isReadonly) {
          toast.error(
            'Viewing files in shared chats is currently not supported.',
          );
          return;
        }

        if (onArtifactExpand && result.id) {
          console.log(
            '[DocumentToolResult] Using onArtifactExpand callback with ID:',
            result.id,
          );
          onArtifactExpand(result.id);
        } else {
          console.log(
            '[DocumentToolResult] No onArtifactExpand callback or result ID available',
          );
        }
      }}
    >
      <div className="text-muted-foreground mt-1">
        {type === 'create' ? (
          <FileIcon />
        ) : type === 'update' ? (
          <PencilEditIcon />
        ) : type === 'request-suggestions' ? (
          <MessageIcon />
        ) : null}
      </div>
      <div className="text-left">
        {`${getActionText(type, 'past')} "${result.title}"`}
      </div>
    </button>
  );
}

export const DocumentToolResult = memo(PureDocumentToolResult, () => true);

interface DocumentToolCallProps {
  type: 'create' | 'update' | 'request-suggestions';
  args: { title: string };
  isReadonly: boolean;
  onArtifactExpand?: (artifactId: string) => void;
}

function PureDocumentToolCall({
  type,
  args,
  isReadonly,
  onArtifactExpand,
}: DocumentToolCallProps) {
  return (
    <button
      type="button"
      className="cursor pointer w-fit border py-2 px-3 rounded-xl flex flex-row items-start justify-between gap-3"
      onClick={(event) => {
        if (isReadonly) {
          toast.error(
            'Viewing files in shared chats is currently not supported.',
          );
          return;
        }

        if (onArtifactExpand && args.title) {
          console.log(
            '[DocumentToolCall] Attempting to expand using onArtifactExpand with title as proxy ID:',
            args.title,
          );
          onArtifactExpand(args.title);
        } else {
          console.log(
            '[DocumentToolCall] Clicked, but no onArtifactExpand or suitable ID. Original logic was to set global isVisible=true.',
          );
        }
      }}
    >
      <div className="flex flex-row gap-3 items-start">
        <div className="text-zinc-500 mt-1">
          {type === 'create' ? (
            <FileIcon />
          ) : type === 'update' ? (
            <PencilEditIcon />
          ) : type === 'request-suggestions' ? (
            <MessageIcon />
          ) : null}
        </div>

        <div className="text-left">
          {`${getActionText(type, 'present')} ${args.title ? `"${args.title}"` : ''}`}
        </div>
      </div>

      <div className="animate-spin mt-1">{<LoaderIcon />}</div>
    </button>
  );
}

export const DocumentToolCall = memo(PureDocumentToolCall, () => true);
