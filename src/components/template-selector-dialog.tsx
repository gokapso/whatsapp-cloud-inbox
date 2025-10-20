'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Template, TemplateParameterInfo } from '@/types/whatsapp';
import { getTemplateParameters } from '@/lib/template-parser';
import { TemplateParametersDialog } from './template-parameters-dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: string;
  onTemplateSent?: () => void;
};

export function TemplateSelectorDialog({ open, onOpenChange, phoneNumber, onTemplateSent }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parameters dialog state
  const [showParametersDialog, setShowParametersDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [parameterInfo, setParameterInfo] = useState<TemplateParameterInfo | null>(null);

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/templates');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch templates');
      }

      // Filter only approved templates
      const approvedTemplates = (data.data || []).filter(
        (t: Template) => t.status === 'APPROVED'
      );
      setTemplates(approvedTemplates);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    const params = getTemplateParameters(template);

    // If template has parameters, show parameters dialog
    if (params.parameters.length > 0) {
      setSelectedTemplate(template);
      setParameterInfo(params);
      setShowParametersDialog(true);
      return;
    }

    // No parameters - send immediately
    handleSendTemplateWithoutParameters(template);
  };

  const handleSendTemplateWithoutParameters = async (template: Template) => {
    setSending(template.id);
    setError(null);
    try {
      const response = await fetch('/api/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          templateName: template.name,
          languageCode: template.language
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send template');
      }

      onOpenChange(false);
      onTemplateSent?.();
    } catch (err) {
      console.error('Error sending template:', err);
      setError(err instanceof Error ? err.message : 'Failed to send template');
    } finally {
      setSending(null);
    }
  };

  const handleBackToTemplateSelector = () => {
    setShowParametersDialog(false);
    setSelectedTemplate(null);
    setParameterInfo(null);
  };

  const handleTemplateWithParametersSent = () => {
    setShowParametersDialog(false);
    setSelectedTemplate(null);
    setParameterInfo(null);
    onOpenChange(false);
    onTemplateSent?.();
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'MARKETING':
        return 'bg-blue-100 text-blue-800';
      case 'UTILITY':
        return 'bg-green-100 text-green-800';
      case 'AUTHENTICATION':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send template message</DialogTitle>
          <DialogDescription>
            Select a template to send to {phoneNumber}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[#00a884]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No approved templates found
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="p-4 border border-[#d1d7db] rounded-lg hover:bg-[#f0f2f5] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[#111b21] truncate">
                        {template.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className={getCategoryColor(template.category)}>
                          {template.category}
                        </Badge>
                        <span className="text-xs text-[#667781]">
                          {template.language}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleSelectTemplate(template)}
                      disabled={sending !== null}
                      size="sm"
                      className="bg-[#00a884] hover:bg-[#008f6f]"
                    >
                      {sending === template.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-1" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <Separator />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {selectedTemplate && parameterInfo && (
      <TemplateParametersDialog
        open={showParametersDialog}
        onOpenChange={setShowParametersDialog}
        template={selectedTemplate}
        parameterInfo={parameterInfo}
        phoneNumber={phoneNumber}
        onBack={handleBackToTemplateSelector}
        onTemplateSent={handleTemplateWithParametersSent}
      />
    )}
  </>
  );
}
