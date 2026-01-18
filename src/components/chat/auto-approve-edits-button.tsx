// src/components/chat/auto-approve-edits-button.tsx

import { CheckCircle, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useLocale } from '@/hooks/use-locale';
import { logger } from '@/lib/logger';
import { taskService } from '@/services/task-service';
import { useSettingsStore } from '@/stores/settings-store';
import { useTaskStore } from '@/stores/task-store';
import type { TaskSettings } from '@/types/task';

export function AutoApproveEditsButton() {
  const { t } = useLocale();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const currentTaskId = useTaskStore((state) => state.currentTaskId);
  const autoApproveGlobal = useSettingsStore((state) => state.auto_approve_edits_global);
  const setAutoApproveGlobal = useSettingsStore((state) => state.setAutoApproveEditsGlobal);

  useEffect(() => {
    setIsEnabled(autoApproveGlobal);
  }, [autoApproveGlobal]);

  const handleToggle = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const newEnabled = !isEnabled;
      await setAutoApproveGlobal(newEnabled);

      if (currentTaskId) {
        const settings: TaskSettings = { autoApproveEdits: newEnabled };
        await taskService.updateTaskSettings(currentTaskId, settings);
        logger.info(
          `Auto-approve edits ${newEnabled ? 'enabled' : 'disabled'} for task ${currentTaskId}`
        );
      }

      setIsEnabled(newEnabled);

      toast.success(
        newEnabled ? t.Chat.autoApproveEdits.enabled : t.Chat.autoApproveEdits.disabled
      );
    } catch (error) {
      logger.error('Failed to update auto-approve setting:', error);
      toast.error(t.Chat.autoApproveEdits.toggleFailed);
    } finally {
      setIsLoading(false);
    }
  };

  // Get tooltip text based on current state
  const getTooltipText = () => {
    if (isEnabled) {
      return t.Chat.autoApproveEdits.enabledTooltip;
    }
    return t.Chat.autoApproveEdits.disabledTooltip;
  };

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 relative"
          onClick={handleToggle}
          disabled={isLoading}
          aria-label={t.Chat.autoApproveEdits.title}
        >
          {isEnabled ? (
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          )}
          {isEnabled && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500" />
          )}
        </Button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-72">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">{t.Chat.autoApproveEdits.title}</h4>
          <p className="text-xs text-muted-foreground">{t.Chat.autoApproveEdits.description}</p>
          <div className="pt-1">
            <p className="text-xs">
              <span className="font-medium">Current status: </span>
              <span
                className={
                  isEnabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                }
              >
                {isEnabled ? t.Chat.autoApproveEdits.enabled : t.Chat.autoApproveEdits.disabled}
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">{getTooltipText()}</p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
