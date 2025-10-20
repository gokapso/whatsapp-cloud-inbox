'use client';

import { useState } from 'react';
import { Send, Loader2, Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

type Button = {
  id: string;
  title: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId?: string;
  phoneNumber?: string;
  onMessageSent?: () => void;
};

export function InteractiveMessageDialog({
  open,
  onOpenChange,
  conversationId,
  phoneNumber,
  onMessageSent,
}: Props) {
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [buttons, setButtons] = useState<Button[]>([
    { id: 'button_1', title: '' }
  ]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddButton = () => {
    if (buttons.length < 3) {
      setButtons([
        ...buttons,
        { id: `button_${buttons.length + 1}`, title: '' }
      ]);
    }
  };

  const handleRemoveButton = (index: number) => {
    if (buttons.length > 1) {
      setButtons(buttons.filter((_, i) => i !== index));
    }
  };

  const handleButtonTitleChange = (index: number, title: string) => {
    // WhatsApp limit: 20 characters
    if (title.length <= 20) {
      const newButtons = [...buttons];
      newButtons[index].title = title;
      setButtons(newButtons);
    }
  };

  const isValid = () => {
    if (!body.trim()) return false;
    if (buttons.length === 0) return false;
    if (buttons.some(btn => !btn.title.trim())) return false;
    return true;
  };

  const handleReset = () => {
    setHeader('');
    setBody('');
    setButtons([{ id: 'button_1', title: '' }]);
    setError(null);
  };

  const handleSend = async () => {
    if (!isValid()) {
      setError('Please fill in the body and all button titles');
      return;
    }

    if (!conversationId || !phoneNumber) {
      setError('No conversation selected');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/messages/interactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          phoneNumber,
          header: header.trim() || undefined,
          body: body.trim(),
          buttons: buttons.map(btn => ({
            id: btn.id,
            title: btn.title.trim()
          }))
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send interactive message');
      }

      handleReset();
      onOpenChange(false);
      onMessageSent?.();
    } catch (err) {
      console.error('Error sending interactive message:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) handleReset();
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send interactive message</DialogTitle>
          <DialogDescription>
            Create a message with interactive buttons
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header" className="text-[#111b21]">
              Header (optional)
            </Label>
            <Input
              id="header"
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Add a header to your message"
              className="bg-white border-[#d1d7db] focus-visible:ring-[#00a884]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body" className="text-[#111b21]">
              Body <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter your message text"
              className="bg-white border-[#d1d7db] focus-visible:ring-[#00a884] min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[#111b21]">
                Buttons <span className="text-red-500">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddButton}
                disabled={buttons.length >= 3}
                className="h-8 text-[#00a884] hover:text-[#008f6f] hover:bg-[#f0f2f5]"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add button
              </Button>
            </div>

            <div className="space-y-2">
              {buttons.map((button, index) => (
                <div key={button.id} className="flex items-center gap-2">
                  <Input
                    value={button.title}
                    onChange={(e) => handleButtonTitleChange(index, e.target.value)}
                    placeholder={`Button ${index + 1} title`}
                    className="bg-white border-[#d1d7db] focus-visible:ring-[#00a884]"
                    maxLength={20}
                  />
                  <span className="text-xs text-[#667781] min-w-[3rem]">
                    {button.title.length}/20
                  </span>
                  {buttons.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveButton(index)}
                      className="h-9 w-9 text-[#667781] hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {buttons.length < 3 && (
              <p className="text-xs text-[#667781]">
                You can add up to {3 - buttons.length} more button{3 - buttons.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        <Separator />

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!isValid() || sending}
            className="bg-[#00a884] hover:bg-[#008f6f]"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
