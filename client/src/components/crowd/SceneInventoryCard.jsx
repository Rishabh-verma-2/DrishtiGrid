import React from 'react';
import {
  Car, Truck, Bus, Bike, Package, Shield, Layers, Box, Tag, Info
} from 'lucide-react';

export default function SceneInventoryCard({ inventory = {}, isLight = false }) {
  const {
    vehicles = {},
    vehicle_total = 0,
    other_objects = {},
    detections = []
  } = inventory;

  const vehicleList = [
    { key: 'car', label: 'Cars', icon: Car, count: vehicles.car || 0, color: 'text-blue-500' },
    { key: 'motorcycle', label: '2-Wheelers', icon: Bike, count: (vehicles.motorcycle || 0), color: 'text-cyan-500' },
    { key: 'bus', label: 'Buses', icon: Bus, count: vehicles.bus || 0, color: 'text-amber-500' },
    { key: 'truck', label: 'Trucks', icon: Truck, count: vehicles.truck || 0, color: 'text-purple-500' },
    { key: 'auto_rickshaw', label: 'Auto-Rickshaws', icon: Box, count: vehicles.auto_rickshaw || 0, color: 'text-emerald-500' },
    { key: 'bicycle', label: 'Bicycles', icon: Bike, count: vehicles.bicycle || 0, color: 'text-lime-500' },
  ];

  const otherObjectEntries = Object.entries(other_objects);
  const otherTotal = otherObjectEntries.reduce((acc, [, count]) => acc + count, 0);

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-300 ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-xs'
          : 'bg-[#141929] border-white/5 shadow-md'
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400'
          }`}>
            <Car className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Scene Object Inventory
            </h3>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Multi-Class YOLO COCO Object Catalog
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border ${
            isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
          }`}>
            {vehicle_total} Vehicles
          </span>
          {otherTotal > 0 && (
            <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border ${
              isLight ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
            }`}>
              {otherTotal} Other
            </span>
          )}
        </div>
      </div>

      {/* Vehicles Grid */}
      <div className="mb-4">
        <span className={`text-[11px] font-bold uppercase tracking-wider block mb-2 ${
          isLight ? 'text-slate-500' : 'text-slate-400'
        }`}>
          Vehicular Density Breakdown
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {vehicleList.map((item) => {
            const Icon = item.icon;
            const hasCount = item.count > 0;
            return (
              <div
                key={item.key}
                className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                  hasCount
                    ? isLight
                      ? 'bg-slate-50/80 border-slate-200'
                      : 'bg-[#101422] border-white/10'
                    : isLight
                    ? 'bg-slate-50/30 border-slate-100 opacity-60'
                    : 'bg-white/[0.02] border-white/5 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${hasCount ? item.color : (isLight ? 'text-slate-400' : 'text-slate-600')}`} />
                  <span className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {item.label}
                  </span>
                </div>
                <span className={`text-sm font-black font-mono px-2 py-0.5 rounded-md ${
                  hasCount
                    ? isLight ? 'bg-white text-slate-900 border border-slate-200' : 'bg-white/10 text-white'
                    : isLight ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {item.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Other Objects Grid */}
      {otherObjectEntries.length > 0 && (
        <div>
          <span className={`text-[11px] font-bold uppercase tracking-wider block mb-2 ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}>
            Pedestrian & Street Furniture Objects
          </span>
          <div className="flex flex-wrap gap-1.5">
            {otherObjectEntries.map(([objName, count]) => (
              <span
                key={objName}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  isLight
                    ? 'bg-purple-50/60 text-purple-800 border-purple-200'
                    : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                }`}
              >
                <Tag className="w-3 h-3 opacity-70" />
                <span className="capitalize">{objName.replace(/_/g, ' ')}</span>
                <span className="font-bold font-mono px-1.5 py-0.2 rounded bg-purple-200/50 dark:bg-purple-500/20 text-[11px]">
                  {count}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {vehicle_total === 0 && otherObjectEntries.length === 0 && (
        <div className="p-4 text-center rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-dashed border-slate-200 dark:border-white/5">
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            No secondary vehicles or street objects identified in this frame.
          </p>
        </div>
      )}
    </div>
  );
}
