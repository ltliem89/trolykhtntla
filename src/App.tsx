import React from 'react';
import { NavigationProvider } from './context/NavigationContext';
import { LearningStateProvider } from './context/LearningStateContext';
import { ArenaGameShell } from './components/arena/ArenaGameShell';

export default function App() {
  return (
    <NavigationProvider>
      <LearningStateProvider>
        <ArenaGameShell />
      </LearningStateProvider>
    </NavigationProvider>
  );
}
