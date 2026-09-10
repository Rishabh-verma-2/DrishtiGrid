import React, { useMemo, useState } from 'react';
import { OFFICIAL_DISTRICTS } from '../../utils/geoUtils';
import {
  Map,
  Building,
  Compass,
  Shield,
  RotateCcw,
  Layers,
  ChevronDown,
} from 'lucide-react';

export default function AdminHierarchyFilter({
  cameras = [],
  selectedDistrict = 'all',
  selectedCity = 'all',
  selectedZone = 'all',
  selectedPoliceStation = 'all',
  onChange,
  onReset,
  isLight = false,
}) {
  // 1. Available Districts
  const districts = useMemo(() => {
    return ['all', 'Gujarat', ...OFFICIAL_DISTRICTS];
  }, []);

  // 2. Available Cities (filtered by district)
  const cities = useMemo(() => {
    const list = new Set();
    cameras.forEach((c) => {
      const matchDistrict =
        selectedDistrict === 'all' ||
        selectedDistrict === 'Gujarat' ||
        (c.district || '').toLowerCase() === selectedDistrict.toLowerCase();
      if (matchDistrict) {
        if (c.city) list.add(c.city);
        if (c.address?.city) list.add(c.address.city);
      }
    });

    const arr = Array.from(list).sort();
    return ['all', ...arr];
  }, [cameras, selectedDistrict]);

  // 3. Available Zones (filtered by district & city)
  const zones = useMemo(() => {
    const list = new Set();
    cameras.forEach((c) => {
      const matchDistrict =
        selectedDistrict === 'all' ||
        selectedDistrict === 'Gujarat' ||
        (c.district || '').toLowerCase() === selectedDistrict.toLowerCase();
      const matchCity =
        selectedCity === 'all' ||
        (c.city || c.address?.city || '').toLowerCase() === selectedCity.toLowerCase();

      if (matchDistrict && matchCity) {
        if (c.zone) list.add(c.zone);
        if (c.taluka) list.add(c.taluka);
      }
    });

    const arr = Array.from(list).sort();
    return ['all', ...arr];
  }, [cameras, selectedDistrict, selectedCity]);

  // 4. Available Police Stations (filtered by district, city, zone)
  const policeStations = useMemo(() => {
    const list = new Set();
    cameras.forEach((c) => {
      const matchDistrict =
        selectedDistrict === 'all' ||
        selectedDistrict === 'Gujarat' ||
        (c.district || '').toLowerCase() === selectedDistrict.toLowerCase();
      const matchCity =
        selectedCity === 'all' ||
        (c.city || c.address?.city || '').toLowerCase() === selectedCity.toLowerCase();
      const matchZone =
        selectedZone === 'all' ||
        (c.zone || c.taluka || '').toLowerCase() === selectedZone.toLowerCase();

      if (matchDistrict && matchCity && matchZone) {
        if (c.policeStation) list.add(c.policeStation);
      }
    });

    const arr = Array.from(list).sort();
    return ['all', ...arr];
  }, [cameras, selectedDistrict, selectedCity, selectedZone]);

  const handleDistrictChange = (val) => {
    onChange({
      district: val,
      city: 'all',
      zone: 'all',
      policeStation: 'all',
    });
  };

  const handleCityChange = (val) => {
    onChange({
      district: selectedDistrict,
      city: val,
      zone: 'all',
      policeStation: 'all',
    });
  };

  const handleZoneChange = (val) => {
    onChange({
      district: selectedDistrict,
      city: selectedCity,
      zone: val,
      policeStation: 'all',
    });
  };

  const handleStationChange = (val) => {
    onChange({
      district: selectedDistrict,
      city: selectedCity,
      zone: selectedZone,
      policeStation: val,
    });
  };

  const isFiltered =
    selectedDistrict !== 'all' ||
    selectedCity !== 'all' ||
    selectedZone !== 'all' ||
    selectedPoliceStation !== 'all';

  return (
    <div
      className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2.5 transition-colors text-xs ${
        isLight
          ? 'bg-slate-50 border-slate-200 text-slate-800'
          : 'bg-[#090d19]/90 border-white/6 text-slate-200'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-500" />
          Administrative Hierarchy:
        </span>
      </div>

      {/* Cascading Selects */}
      <div className="flex flex-wrap items-center gap-2">
        {/* District */}
        <div className="flex items-center gap-1.5">
          <Map className="w-3 h-3 text-blue-400" />
          <select
            value={selectedDistrict}
            onChange={(e) => handleDistrictChange(e.target.value)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium outline-none cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-white/5 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">District (All Gujarat)</option>
            {OFFICIAL_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* City / Municipality */}
        <div className="flex items-center gap-1.5">
          <Building className="w-3 h-3 text-purple-400" />
          <select
            value={selectedCity}
            onChange={(e) => handleCityChange(e.target.value)}
            disabled={selectedDistrict === 'all'}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium outline-none cursor-pointer disabled:opacity-40 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-white/5 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">City / Municipality</option>
            {cities
              .filter((c) => c !== 'all')
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
        </div>

        {/* Zone */}
        <div className="flex items-center gap-1.5">
          <Compass className="w-3 h-3 text-cyan-400" />
          <select
            value={selectedZone}
            onChange={(e) => handleZoneChange(e.target.value)}
            disabled={selectedDistrict === 'all'}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium outline-none cursor-pointer disabled:opacity-40 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-white/5 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">Zone / Taluka</option>
            {zones
              .filter((z) => z !== 'all')
              .map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
          </select>
        </div>

        {/* Police Station */}
        <div className="flex items-center gap-1.5">
          <Shield className="w-3 h-3 text-emerald-400" />
          <select
            value={selectedPoliceStation}
            onChange={(e) => handleStationChange(e.target.value)}
            disabled={selectedDistrict === 'all'}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium outline-none cursor-pointer disabled:opacity-40 ${
              isLight
                ? 'bg-white border-slate-300 text-slate-800'
                : 'bg-white/5 border-white/10 text-slate-200'
            }`}
          >
            <option value="all">Police Station</option>
            {policeStations
              .filter((p) => p !== 'all')
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        </div>

        {isFiltered && onReset && (
          <button
            onClick={onReset}
            title="Reset Hierarchy Filter"
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
