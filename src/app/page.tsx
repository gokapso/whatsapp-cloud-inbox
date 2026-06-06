'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ConversationList } from '@/components/conversation-list';
import { MessageView } from '@/components/message-view';
import {
  CONVERSATIONS_QUERY_KEY,
  type ConversationThread,
  fetchConversations,
  groupConversationsByPhoneNumber,
} from '@/lib/inbox-data';

export default function Home() {
  const [selectedThreadKey, setSelectedThreadKey] = useState<string>();
  const queryClient = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: CONVERSATIONS_QUERY_KEY,
    queryFn: fetchConversations,
  });

  const threads = useMemo(
    () => groupConversationsByPhoneNumber(conversations),
    [conversations],
  );

  const selectedThread = selectedThreadKey
    ? threads.find(thread => thread.key === selectedThreadKey)
    : undefined;

  const handleSelectThread = (thread: ConversationThread) => {
    setSelectedThreadKey(thread.key);
  };

  const handleTemplateSent = async (phoneNumber: string) => {
    const refreshedConversations = await queryClient.fetchQuery({
      queryKey: CONVERSATIONS_QUERY_KEY,
      queryFn: fetchConversations,
      staleTime: 0,
    });
    const phoneNumberKey = phoneNumber.replace(/\D/g, '') || phoneNumber;
    const refreshedThread = groupConversationsByPhoneNumber(refreshedConversations)
      .find(thread => thread.key === phoneNumberKey || thread.phoneNumber === phoneNumber);

    setSelectedThreadKey(refreshedThread?.key ?? phoneNumberKey);
  };

  const handleBackToList = () => {
    setSelectedThreadKey(undefined);
  };

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <ConversationList
        onSelectThread={handleSelectThread}
        selectedThreadKey={selectedThreadKey}
        isHidden={!!selectedThread}
      />
      <MessageView
        conversationId={selectedThread?.latestConversation.id}
        conversations={selectedThread?.conversations || []}
        phoneNumber={selectedThread?.phoneNumber}
        contactName={selectedThread?.contactName}
        lastActiveAt={selectedThread?.lastActiveAt}
        onTemplateSent={handleTemplateSent}
        onBack={handleBackToList}
        isVisible={!!selectedThread}
      />
    </div>
  );
}
