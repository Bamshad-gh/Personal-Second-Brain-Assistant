'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { calendarApi } from '@/lib/api';
import type { Block, CalendarEvent } from '@/types';

interface CalendarBlockProps {
  block: Block;
  readOnly?: boolean;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarBlock({ block }: CalendarBlockProps) {
  const [current, setCurrent] = useState(() => new Date());
  const year  = current.getFullYear();
  const month = current.getMonth();

  const startIso = new Date(year, month, 1).toISOString();
  const endIso   = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const workspaceId = (block.content as { workspace_id?: string })?.workspace_id;

  const { data: events = [] } = useQuery<CalendarEvent[]>({
    queryKey: ['calendar-events-block', workspaceId, year, month],
    queryFn: () => calendarApi.listEvents({
      start: startIso,
      end:   endIso,
      ...(workspaceId ? { workspace: workspaceId } : {}),
    }),
  });

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    for (const ev of events) {
      const d = new Date(ev.start_dt).getDate();
      if (!map[d]) map[d] = [];
      map[d].push(ev);
    }
    return map;
  }, [events]);

  const daysInMonth  = getDaysInMonth(year, month);
  const firstDay     = getFirstDayOfMonth(year, month);
  const today        = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prev = () => setCurrent(new Date(year, month - 1, 1));
  const next = () => setCurrent(new Date(year, month + 1, 1));

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 select-none">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={14} className="text-violet-400" />
          <span className="text-sm font-medium text-neutral-200">
            {MONTHS[month]} {year}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={next}
            className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px">
        {DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-medium text-neutral-600">
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          const isToday = isCurrentMonth && day === today.getDate();
          const dayEvents = day ? (eventsByDay[day] ?? []) : [];
          return (
            <div
              key={idx}
              className={[
                'relative flex flex-col items-center rounded py-1 min-h-[32px]',
                day ? 'hover:bg-neutral-800 transition-colors cursor-default' : '',
              ].join(' ')}
            >
              {day && (
                <>
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                      isToday
                        ? 'bg-violet-500 font-semibold text-white'
                        : 'text-neutral-400',
                    ].join(' ')}
                  >
                    {day}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="mt-0.5 flex gap-0.5">
                      {dayEvents.slice(0, 3).map((_, i) => (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: dayEvents[i].color || '#7c3aed' }}
                        />
                      ))}
                    </span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {events.length > 0 && (
        <div className="mt-2 border-t border-neutral-800 pt-2 space-y-1">
          {events.slice(0, 3).map((ev) => (
            <div key={ev.id} className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: ev.color || '#7c3aed' }}
              />
              <span className="truncate">{ev.title}</span>
              <span className="ml-auto shrink-0 text-neutral-600">
                {new Date(ev.start_dt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
          {events.length > 3 && (
            <p className="text-[10px] text-neutral-600">+{events.length - 3} more</p>
          )}
        </div>
      )}
    </div>
  );
}
