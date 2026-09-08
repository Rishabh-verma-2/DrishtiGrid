import React, { useState } from 'react';
import { Users, Crosshair, CheckCircle2, ChevronRight, Search, ShieldCheck } from 'lucide-react';

export default function PersonDetectionsList({ detections = [], totalCount = 0, isLight = false }) {
  const [search, setSearch] = useState('');

  const filteredDetections = detections.filter((d) => {
    if (!search) return true;
    return (
      d.label?.toLowerCase().includes(search.toLowerCase()) ||
      String(d.id).includes(search) ||
      String(Math.round((d.confidence || 0) * 100)).includes(search)
    );
  });

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-300 flex flex-col h-[380px] ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-xs'
          : 'bg-[#141929] border-white/5 shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Detected Individuals
            </h3>
            <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Itemized YOLOv8 Person Detections ({detections.length})
            </p>
          </div>
        </div>

        <span
          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border ${
            isLight
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}
        >
          {totalCount} Verified
        </span>
      </div>

      {/* Quick Search */}
      {detections.length > 5 && (
        <div className="relative mb-3">
          <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${isLight ? 'text-slate-400' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder="Filter by ID (e.g. 1, 5) or confidence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border outline-hidden transition-all ${
              isLight
                ? 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white'
                : 'bg-white/5 border-white/10 text-white focus:border-blue-500 focus:bg-black/40'
            }`}
          />
        </div>
      )}

      {/* Detection List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {detections.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Users className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs font-semibold">No people detected in this image</p>
            <p className="text-[11px] opacity-70 mt-0.5">
              Upload a clear photo containing people or lower confidence threshold.
            </p>
          </div>
        ) : filteredDetections.length === 0 ? (
          <div className={`p-4 text-center text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            No detection matches &quot;{search}&quot;
          </div>
        ) : (
          filteredDetections.map((person, idx) => {
            const confPercent = Math.round((person.confidence || 0) * 100);
            const bbox = person.bbox;
            const bboxStr = Array.isArray(bbox)
              ? `[${bbox.join(', ')}]`
              : bbox && typeof bbox === 'object'
              ? `[x:${bbox.x}, y:${bbox.y}, ${bbox.w}×${bbox.h}]`
              : null;
            const personNum = person.person_id || person.id || idx + 1;

            return (
              <div
                key={person.id || idx}
                className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                  isLight
                    ? 'bg-slate-50/90 border-slate-200/90 hover:bg-slate-100 text-slate-900 shadow-2xs'
                    : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-black ${
                    isLight
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    #{personNum}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Person #{personNum}
                      </span>
                      <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    </div>
                    {bboxStr && (
                      <p className={`text-[10px] font-mono truncate max-w-[170px] ${
                        isLight ? 'text-slate-500 font-medium' : 'text-slate-400'
                      }`} title={bboxStr}>
                        Box: {bboxStr}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className={`text-xs font-black font-mono ${
                      isLight ? 'text-emerald-700' : 'text-emerald-400'
                    }`}>
                      {confPercent}%
                    </span>
                  </div>
                  <div className={`w-16 rounded-full h-1 mt-1 overflow-hidden ${
                    isLight ? 'bg-slate-200' : 'bg-white/10'
                  }`}>
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${confPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] font-mono ${
        isLight ? 'border-slate-200 text-slate-600 font-semibold' : 'border-white/5 text-slate-400'
      }`}>
        <span>YOLOv8 Person Class (ID: 0)</span>
        <span>{totalCount} Total Counted</span>
      </div>
    </div>
  );
}
