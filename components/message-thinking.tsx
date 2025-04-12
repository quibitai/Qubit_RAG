'use client';

import { useState } from 'react';
import { ChevronDownIcon } from './icons';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MessageThinkingProps {
  toolResult: any;
  toolName?: string;
}

export function MessageThinking({
  toolResult,
  toolName,
}: MessageThinkingProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const variants = {
    collapsed: {
      height: 0,
      opacity: 0,
      marginTop: 0,
      marginBottom: 0,
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      marginTop: '0.5rem',
      marginBottom: '0.5rem',
    },
  };

  // Skip rendering if there's no result data
  if (!toolResult) return null;

  return (
    <div className="flex flex-col mt-1 mb-1">
      <div className="flex flex-row gap-2 items-center">
        <button
          data-testid="message-thinking-toggle"
          type="button"
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors",
            isExpanded && "bg-zinc-200 dark:bg-zinc-700"
          )}
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
        >
          <span className="text-zinc-600 dark:text-zinc-400">
            {toolName ? `Show ${toolName} data` : "Show thinking"}
          </span>
          <span className={cn(
            "transition-transform", 
            isExpanded ? "rotate-180" : ""
          )}>
            <ChevronDownIcon />
          </span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            data-testid="message-thinking-content"
            key="content"
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
            variants={variants}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
            className="pl-2 mt-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md"
          >
            <pre className="p-3 overflow-auto">{JSON.stringify(toolResult, null, 2)}</pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 