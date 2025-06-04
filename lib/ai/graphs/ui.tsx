import React from 'react';

// Document Component for text artifacts
const DocumentComponent = (props: {
  documentId: string;
  title?: string;
  content?: string;
  status?: 'creating' | 'updating' | 'complete';
}) => {
  return (
    <div className="border rounded-lg p-4 bg-blue-50">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 bg-blue-500 rounded-full" />
        <h3 className="font-semibold text-blue-900">
          {props.title || 'Document'}
        </h3>
        {props.status && (
          <span className="text-xs px-2 py-1 rounded bg-blue-200 text-blue-800">
            {props.status}
          </span>
        )}
      </div>

      {props.content && (
        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto">
          {props.content}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-500">
        Document ID: {props.documentId}
      </div>
    </div>
  );
};

// Research Component for research artifacts
const ResearchComponent = (props: {
  title: string;
  content?: string;
  status?: 'researching' | 'complete';
  sources?: Array<{ title: string; url: string }>;
}) => {
  return (
    <div className="border rounded-lg p-4 bg-green-50">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 bg-green-500 rounded-full" />
        <h3 className="font-semibold text-green-900">{props.title}</h3>
        {props.status && (
          <span className="text-xs px-2 py-1 rounded bg-green-200 text-green-800">
            {props.status}
          </span>
        )}
      </div>

      {props.content && (
        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto mb-3">
          {props.content}
        </div>
      )}

      {props.sources && props.sources.length > 0 && (
        <div className="mt-2">
          <h4 className="text-xs font-semibold text-gray-600 mb-1">Sources:</h4>
          {props.sources.map((source) => (
            <div
              key={source.url}
              className="text-xs text-blue-600 hover:underline"
            >
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Tool Status Component for showing tool execution
const ToolStatusComponent = (props: {
  toolName: string;
  status: 'starting' | 'running' | 'complete' | 'error';
  message?: string;
}) => {
  const getStatusColor = () => {
    switch (props.status) {
      case 'starting':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200';
      case 'running':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'complete':
        return 'bg-green-50 text-green-800 border-green-200';
      case 'error':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-gray-50 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()}`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
        <span className="font-medium text-sm">{props.toolName}</span>
        <span className="text-xs capitalize">{props.status}</span>
      </div>

      {props.message && (
        <div className="mt-1 text-xs opacity-80">{props.message}</div>
      )}
    </div>
  );
};

// Component map for LangGraph
const ComponentMap = {
  document: DocumentComponent,
  research: ResearchComponent,
  toolStatus: ToolStatusComponent,
};

export default ComponentMap;

// Export types for TypeScript
export type ComponentMapType = typeof ComponentMap;
