import { memo } from 'react';
import { CrossIcon } from './icons';
import { Button } from './ui/button';
import type { ArtifactKind } from './artifact';

interface ArtifactCloseButtonProps {
  onClose?: () => void;
}

function PureArtifactCloseButton({ onClose }: ArtifactCloseButtonProps) {
  return (
    <Button
      data-testid="artifact-close-button"
      variant="outline"
      className="h-fit p-2 dark:hover:bg-zinc-700 bg-red-500"
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onClose) {
          onClose();
        }
      }}
    >
      <CrossIcon size={18} />
    </Button>
  );
}

export const ArtifactCloseButton = memo(PureArtifactCloseButton);
