"use client";
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { lucario } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  fileReferences: { fileName: string, sourceCode: string, summary: string }[];
};

const CodeReferences = ({ fileReferences }: Props) => {
  const [tab, setTab] = useState<string | undefined>(undefined);
  const { resolvedTheme } = useTheme();

  // Automatically select the first file reference when fileReferences changes
  useEffect(() => {
    if (fileReferences.length > 0 && tab !== fileReferences[0].fileName) {
      setTab(fileReferences[0].fileName);
    }
  }, [fileReferences]);

  if (fileReferences.length === 0) return null;

  return (
    <div className="w-full mt-2">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto flex gap-2 bg-muted p-1.5 rounded-md">
          {fileReferences.map((file) => (
            <Button
              key={file.fileName}
              onClick={() => setTab(file.fileName)}
              variant={'ghost'}
              size="sm"
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-muted-foreground bg-muted hover:bg-muted-foreground hover:text-primary-foreground flex-shrink-0',
                {
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground': tab === file.fileName,
                }
              )}
            >
              {file.fileName}
            </Button>
          ))}
        </div>
        {fileReferences.map((file) => (
          <TabsContent
            key={file.fileName}
            value={file.fileName}
            className="max-h-[40vh] overflow-y-auto rounded-md custom-markdown-scroll mt-2"
          >
            <SyntaxHighlighter
              language="typescript"
              style={resolvedTheme === 'dark' ? lucario : oneLight}
              wrapLines={true}
              wrapLongLines={true}
              customStyle={{
                fontSize: '0.8rem',
                padding: '1rem'
              }}
              lineNumberStyle={{
                fontSize: '0.7rem'
              }}
            >
              {file.sourceCode}
            </SyntaxHighlighter>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default CodeReferences;
