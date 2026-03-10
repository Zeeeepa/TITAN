import { useState } from 'react';
import { ClipboardCopy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg border border-[#3f3f46] bg-[#09090b]">
      {language && (
        <div className="border-b border-[#3f3f46] px-4 py-1.5 text-xs text-[#71717a]">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md p-1.5 text-[#71717a] transition-colors hover:bg-[#27272a] hover:text-[#fafafa]"
      >
        {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
      </button>
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-sm text-[#fafafa]">{code}</code>
      </pre>
    </div>
  );
}
