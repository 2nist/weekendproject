import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MousePointerClick } from 'lucide-react';
import AppearanceTab from '@/components/settings/AppearanceTab';
import ConnectionsTab from '@/components/settings/ConnectionsTab';
import AnalysisTab from '@/components/settings/AnalysisTab';
import CalibrationTab from '@/components/settings/CalibrationTab';
import MenuConfigTab from '@/components/settings/MenuConfigTab';

export const SettingsView: React.FC = () => {
  return (
    <div className="p-8 min-h-screen bg-slate-950 text-slate-200">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-2">Configure application preferences and connections.</p>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-5 mb-6">
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
          <TabsTrigger value="menus" className="gap-2">
            <MousePointerClick className="w-4 h-4" /> Menus
          </TabsTrigger>
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

        <TabsContent value="menus" className="mt-0">
          <MenuConfigTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsView;
