'use client';

import { useMemo, useState } from 'react';
import { useConversations } from '@/hooks/use-conversations';
import { ConversationList } from '@/components/conversation-list';
import { MessageView } from '@/components/message-view';
import {
  type ConversationThread,
  groupConversationsByPhoneNumber,
} from '@/lib/inbox-data';

export default function Home() {
  const [selection, setSelection] = useState<{ key: string; conversationId: string }>();

  const { conversations, refetch } = useConversations();

  const threads = useMemo(
    () => groupConversationsByPhoneNumber(conversations),
    [conversations],
  );

  const selectedThread = selection
    ? threads.find(thread => thread.key === selection.key) ||
      threads.find(thread => thread.conversations.some(conversation => conversation.id === selection.conversationId))
    : undefined;

  const handleSelectThread = (thread: ConversationThread) => {
    setSelection({ key: thread.key, conversationId: thread.latestConversation.id });
  };

  const handleTemplateSent = async () => { await refetch({ throwOnError: true }); };
  const handleBackToList = () => { setSelection(undefined); };

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <ConversationList
        onSelectThread={handleSelectThread}
        selectedThreadKey={selectedThread?.key}
        isHidden={!!selectedThread}
      />
      <MessageView
        key={selection?.conversationId ?? 'empty'}
        conversationId={selectedThread?.latestConversation.id}
        conversations={selectedThread?.conversations || []}
        phoneNumber={selectedThread?.phoneNumber}
        businessScopedUserId={selectedThread?.businessScopedUserId ?? undefined}
        parentBusinessScopedUserId={selectedThread?.parentBusinessScopedUserId ?? undefined}
        username={selectedThread?.username ?? undefined}
        lastInboundAt={selectedThread?.lastInboundAt}
        phoneNumberId={selectedThread?.phoneNumberId}
        inboxPhoneNumber={selectedThread?.inboxPhoneNumber}
        inboxDisplayName={selectedThread?.inboxDisplayName}
        contactName={selectedThread?.contactName}
        lastActiveAt={selectedThread?.lastActiveAt}
        onTemplateSent={handleTemplateSent}
        onBack={handleBackToList}
        isVisible={!!selectedThread}
      />
    </div>
  );
}
