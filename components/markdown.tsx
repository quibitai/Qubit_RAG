import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

const components: Partial<Components> = {
  // @ts-expect-error
  code: CodeBlock,
  pre: ({ children }) => <>{children}</>,
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a: ({ node, children, ...props }) => {
    const href = props.href;
    const isExternal =
      href &&
      (href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:'));

    if (isExternal) {
      return (
        <a
          className="text-blue-500 hover:underline"
          target="_blank"
          rel="noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      // @ts-expect-error
      <Link className="text-blue-500 hover:underline" {...props}>
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
};

const remarkPlugins = [remarkGfm];

/**
 * Convert plain URLs in text to markdown links
 */
function linkifyUrls(text: string): string {
  // URL regex that matches http/https URLs
  const urlRegex = /(https?:\/\/[^\s\)]+)/g;

  return text.replace(urlRegex, (url) => {
    // Don't linkify URLs that are already in markdown link format
    const beforeUrl = text.substring(0, text.indexOf(url));
    const afterUrl = text.substring(text.indexOf(url) + url.length);

    // Check if this URL is already in a markdown link [text](url)
    if (
      beforeUrl.endsWith('](') ||
      beforeUrl.endsWith('](') ||
      afterUrl.startsWith(')')
    ) {
      return url; // Already a markdown link, don't modify
    }

    // Check if this URL is already in an HTML link
    if (beforeUrl.includes('<a ') && !beforeUrl.includes('</a>')) {
      return url; // Already in HTML link, don't modify
    }

    // Convert to markdown link
    return `[${url}](${url})`;
  });
}

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {linkifyUrls(children)}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
