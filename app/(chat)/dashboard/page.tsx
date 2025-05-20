'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChatPane } from '@/context/ChatPaneContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Bot, Brain, FileEdit } from 'lucide-react';
import { ChatPaneToggle } from '@/components/ChatPaneToggle';
import { useSidebar } from '@/components/ui/sidebar';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { AsanaAuthControl } from '@/components/asana-auth-control';
import { useSession } from 'next-auth/react';

/**
 * Dashboard page component.
 *
 * This page displays the main dashboard for the application.
 * It also ensures the proper bit context is set when accessed.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { chatState, setCurrentActiveSpecialistId, setActiveDocId } =
    useChatPane();
  const { setMessages } = chatState;
  const { state: sidebarState } = useSidebar();
  const modelId = DEFAULT_CHAT_MODEL;
  const { status } = useSession();

  // When this component mounts, set the appropriate context
  useEffect(() => {
    // Set the active specialist ID
    setCurrentActiveSpecialistId(modelId);

    // Clear any active document ID
    setActiveDocId(null);

    // Log dashboard component load and session status
    console.log(`[Dashboard] Component loaded, session status: ${status}`);
  }, [modelId, setCurrentActiveSpecialistId, setActiveDocId, status]);

  const handleBitSelection = (modelId: string) => {
    // Update the active bit context in the global context
    setCurrentActiveSpecialistId(modelId);

    // Clear any active document ID when switching bits
    setActiveDocId(null);

    // Clear current messages for a fresh chat experience
    setMessages([]);

    // Navigate to the appropriate interface based on model ID
    if (modelId === 'document-editor') {
      router.push('/editor/new');
    } else {
      router.push('/');
    }
  };

  // Function to get an icon based on the model ID
  const getModelIcon = (modelId: string) => {
    switch (modelId) {
      case 'global-orchestrator':
        return <Brain className="h-8 w-8 text-primary" />;
      case 'document-editor':
        return <FileEdit className="h-8 w-8 text-primary" />;
      default:
        return <Bot className="h-8 w-8 text-primary" />;
    }
  };

  const modelCards = [
    {
      id: 'chat-model',
      name: 'Chat Bit',
      description: 'Versatile AI assistant for chat and reasoning',
      specialization: 'general-purpose chat and reasoning capabilities',
    },
    {
      id: 'document-editor',
      name: 'Document Bit',
      description: 'AI-assisted document writing and editing.',
      specialization: 'document creation and editing',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background py-1.5 px-2 md:px-4">
        <div />
        <ChatPaneToggle />
      </header>

      <div
        className={`container p-6 mt-2 transition-all ${
          sidebarState === 'collapsed' ? 'md:pl-14' : ''
        }`}
      >
        {status === 'authenticated' && (
          <div className="mb-6">
            <AsanaAuthControl />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modelCards.map((model) => (
            <Card
              key={model.id}
              className="cursor-pointer hover:shadow-lg transition-all hover:border-primary/50 flex flex-col"
              onClick={() => handleBitSelection(model.id)}
            >
              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                {getModelIcon(model.id)}
                <div>
                  <CardTitle>{model.name}</CardTitle>
                  <CardDescription>{model.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mt-2">
                  Specialized for {model.specialization}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end mt-auto pt-4">
                <div className="flex items-center text-primary text-sm font-medium">
                  Start chatting
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
