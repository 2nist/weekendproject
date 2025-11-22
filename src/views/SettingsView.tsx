import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AppearanceTab from '@/components/settings/AppearanceTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import AnalysisTab from '@/components/settings/AnalysisTab';
import CalibrationTab from '@/components/settings/CalibrationTab';

export const SettingsView: React.FC = () => {
  return (
    <div className="p-8 min-h-screen bg-slate-950 text-slate-200">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-2">Configure application preferences and connections.</p>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-4 mb-6">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="mt-0">
          <AppearanceTab />
        </TabsContent>

        <TabsContent value="connections" className="mt-0">
          <ConnectionsTab />
        </TabsContent>

        <TabsContent value="analysis" className="mt-0">
          <AnalysisTab />
        </TabsContent>

        <TabsContent value="calibration" className="mt-0">
          <CalibrationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsView;
