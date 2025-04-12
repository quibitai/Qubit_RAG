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

  // Check if this is an error response and format accordingly
  const isError = toolResult.success === false && toolResult.error;
  const displayName = toolName || "thinking";

  // Check if this is a document rows result with pagination/truncation
  const isRowData = !isError && 
    toolResult.success === true && 
    toolResult.rows && 
    toolResult.totalRowCount !== undefined;

  const formatJSON = (data: any) => {
    if (typeof data === 'string') {
      try {
        // If it's a JSON string, parse it first
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        // If not valid JSON, return the string as is
        return data;
      }
    }

    // For row data results, create a more compact representation
    if (isRowData) {
      // Format rows with index numbers for better readability
      const rowsWithIndex = data.rows.map((row: any, index: number) => ({ 
        index: index + 1,
        ...row 
      }));

      const formattedObject = {
        message: data.message,
        total_rows: data.totalRowCount,
        showing_rows: data.rows.length,
        truncated: data.truncated || false,
        rows: rowsWithIndex
      };

      return JSON.stringify(formattedObject, null, 2);
    }
    
    // For objects, pretty print with indentation
    return JSON.stringify(data, null, 2);
  };

  // Determine the button label and status info
  let buttonLabel = isError ? `Error from ${displayName}` : `Show ${displayName} data`;
  let statusInfo = null;

  if (isRowData) {
    const { totalRowCount, rows, truncated } = toolResult;
    buttonLabel = `Show ${displayName} data (${rows.length}/${totalRowCount} rows)`;
    
    if (truncated) {
      statusInfo = (
        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mr-1">
            <path d="M12 9V14M12 17.5V17.51M4.9 19C3.9 18.1 3 16.6 3 15C3 11.7 5.7 9 9 9H10.5L12 4L13.5 9H15C18.3 9 21 11.7 21 15C21 16.6 20.1 18.1 19.1 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Results truncated due to large dataset
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col mt-1 mb-1">
      <div className="flex flex-col gap-1">
        <button
          data-testid="message-thinking-toggle"
          type="button"
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors",
            isError 
              ? "bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400" 
              : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400",
            isExpanded && (isError ? "bg-red-100 dark:bg-red-900/30" : "bg-zinc-200 dark:bg-zinc-700")
          )}
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
        >
          <span>{buttonLabel}</span>
          <span className={cn(
            "transition-transform", 
            isExpanded ? "rotate-180" : ""
          )}>
            <ChevronDownIcon />
          </span>
        </button>
        
        {statusInfo}
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
            className={cn(
              "pl-2 mt-2 text-xs font-mono border rounded-md max-h-[500px]",
              isError
                ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30"
                : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
            )}
          >
            <pre className="p-3 overflow-auto whitespace-pre-wrap break-words">
              {isError
                ? <span className="text-red-600 dark:text-red-400">{toolResult.error}</span>
                : formatJSON(toolResult)
              }
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
} 