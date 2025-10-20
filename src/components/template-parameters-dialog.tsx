'use client';

import { useState } from 'react';
import { Send, Loader2, ArrowLeft } from 'lucide-react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import type { Template, TemplateParameterInfo } from '@/types/whatsapp';
import { formatParametersForTemplate } from '@/lib/template-parser';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template;
  parameterInfo: TemplateParameterInfo;
  phoneNumber: string;
  onBack: () => void;
  onTemplateSent?: () => void;
};

export function TemplateParametersDialog({
  open,
  onOpenChange,
  template,
  parameterInfo,
  phoneNumber,
  onBack,
  onTemplateSent,
}: Props) {
  const [parameterValues, setParameterValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParameterChange = (paramName: string, value: string) => {
    setParameterValues(prev => ({
      ...prev,
      [paramName]: value,
    }));
  };

  const allParametersFilled = parameterInfo.parameters.every(
    param => parameterValues[param.name]?.trim()
  );

  const handleSend = async () => {
    if (!allParametersFilled) {
      setError('Please fill in all parameters');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const formattedParameters = formatParametersForTemplate(parameterInfo, parameterValues);

      const response = await fetch('/api/templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          templateName: template.name,
          languageCode: template.language,
          parameters: formattedParameters,
          parameterInfo: parameterInfo,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send template');
      }

      onOpenChange(false);
      setParameterValues({});
      onTemplateSent?.();
    } catch (err) {
      console.error('Error sending template:', err);
      setError(err instanceof Error ? err.message : 'Failed to send template');
    } finally {
      setSending(false);
    }
  };

  const formatParameterName = (name: string): string => {
    // Convert snake_case or param_1 to readable format
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .replace(/Param (\d+)/, 'Parameter $1')
      .replace(/Button (\d+) Parameter (\d+)/, 'Button $1 URL Parameter $2');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <DialogTitle>Template parameters</DialogTitle>
              <DialogDescription>
                Fill in the parameters for {template.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4">
            {parameterInfo.parameters.map((param) => (
              <div key={param.name} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={param.name} className="text-[#111b21]">
                    {formatParameterName(param.name)}
                  </Label>
                  <Badge
                    variant="secondary"
                    className="text-xs bg-[#f0f2f5] text-[#667781]"
                  >
                    {param.component}
                  </Badge>
                </div>
                <Input
                  id={param.name}
                  value={parameterValues[param.name] || ''}
                  onChange={(e) => handleParameterChange(param.name, e.target.value)}
                  placeholder={param.example || `Enter ${formatParameterName(param.name)}`}
                  className="bg-white border-[#d1d7db] focus-visible:ring-[#00a884]"
                />
                {param.example && (
                  <p className="text-xs text-[#667781]">
                    Example: {param.example}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button
            onClick={handleSend}
            disabled={!allParametersFilled || sending}
            className="bg-[#00a884] hover:bg-[#008f6f]"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                Send template
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
