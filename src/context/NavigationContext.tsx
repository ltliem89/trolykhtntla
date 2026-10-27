import React, { createContext, useContext, useState } from 'react';
import { TabType, NavigationContext as NavContextType } from '../types';

interface NavigationState {
  currentTab: TabType;
  currentItemId?: string;
  context: NavContextType;
  historyStack: { tab: TabType; id?: string; context: NavContextType }[];
  navigate: (args: {
    tab: TabType;
    id?: string;
    context?: Partial<NavContextType>;
    returnTo?: { tab: TabType; id?: string };
  }) => void;
  goBack: () => void;
  setTab: (tab: TabType) => void;
  // Synchronized Learner Support Bridges
  isAiTutorOpen: boolean;
  aiTutorPrompt: string;
  openAiTutor: (prompt?: string) => void;
  closeAiTutor: () => void;
  requestedArenaSectorId: string | null;
  launchArenaSector: (sectorId: string) => void;
  clearArenaRequest: () => void;
}

const NavigationContext = createContext<NavigationState | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [currentItemId, setCurrentItemId] = useState<string | undefined>(undefined);
  const [context, setContext] = useState<NavContextType>({ sourceTab: 'home' });
  const [historyStack, setHistoryStack] = useState<
    { tab: TabType; id?: string; context: NavContextType }[]
  >([]);

  const [isAiTutorOpen, setIsAiTutorOpen] = useState<boolean>(false);
  const [aiTutorPrompt, setAiTutorPrompt] = useState<string>('');
  const [requestedArenaSectorId, setRequestedArenaSectorId] = useState<string | null>(null);

  const navigate = ({
    tab,
    id,
    context: newCtx = {},
    returnTo,
  }: {
    tab: TabType;
    id?: string;
    context?: Partial<NavContextType>;
    returnTo?: { tab: TabType; id?: string };
  }) => {
    setHistoryStack((prev) => [
      ...prev,
      {
        tab: currentTab,
        id: currentItemId,
        context,
      },
    ]);

    setCurrentTab(tab);
    setCurrentItemId(id);
    setContext((prev) => ({
      ...prev,
      ...newCtx,
      lessonId: newCtx.lessonId ?? (tab === 'ly_thuyet' && id ? id : prev.lessonId),
      formulaId: newCtx.formulaId ?? (tab === 'cong_thuc' && id ? id : prev.formulaId),
      experimentId: newCtx.experimentId ?? (tab === 'thi_nghiem' && id ? id : prev.experimentId),
      sourceTab: currentTab,
      sourceId: currentItemId,
      returnTo:
        returnTo || (currentTab !== tab ? { tab: currentTab, id: currentItemId } : prev.returnTo),
    }));
  };

  const goBack = () => {
    if (context.returnTo) {
      const target = context.returnTo;
      setCurrentTab(target.tab);
      setCurrentItemId(target.id);
      setContext((prev) => ({
        ...prev,
        returnTo: undefined,
      }));
      return;
    }

    if (historyStack.length > 0) {
      const prevEntry = historyStack[historyStack.length - 1];
      setHistoryStack((prev) => prev.slice(0, prev.length - 1));
      setCurrentTab(prevEntry.tab);
      setCurrentItemId(prevEntry.id);
      setContext(prevEntry.context);
    } else {
      setCurrentTab('home');
      setCurrentItemId(undefined);
    }
  };

  const setTab = (tab: TabType) => {
    if (tab === currentTab) return;
    navigate({ tab, context: { sourceTab: currentTab } });
  };

  const openAiTutor = (prompt?: string) => {
    if (prompt) {
      setAiTutorPrompt(prompt);
    }
    setIsAiTutorOpen(true);
  };

  const closeAiTutor = () => {
    setIsAiTutorOpen(false);
  };

  const launchArenaSector = (sectorId: string) => {
    setRequestedArenaSectorId(sectorId);
  };

  const clearArenaRequest = () => {
    setRequestedArenaSectorId(null);
  };

  return (
    <NavigationContext.Provider
      value={{
        currentTab,
        currentItemId,
        context,
        historyStack,
        navigate,
        goBack,
        setTab,
        isAiTutorOpen,
        aiTutorPrompt,
        openAiTutor,
        closeAiTutor,
        requestedArenaSectorId,
        launchArenaSector,
        clearArenaRequest,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useAppNavigation = () => {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useAppNavigation must be used within NavigationProvider');
  }
  return ctx;
};
