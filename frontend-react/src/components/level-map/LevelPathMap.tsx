import { Fragment, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import LevelNode from './LevelNode';
import PathConnector from './PathConnector';

export interface LevelState {
  id: number;
  unlocked: boolean;
  completed: boolean;
}

const LEVELS: LevelState[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  unlocked: i < 5,
  completed: false,
}));
// TODO: hydrate level state from backend

interface Props {
  current: number;
  onSelect: (id: number) => void;
}

const PER_PAGE = 10;

export default function LevelPathMap({ current, onSelect }: Props) {
  const maxPage = Math.floor((LEVELS.length - 1) / PER_PAGE);
  const [page, setPage] = useState(0);

  const pageLevels = LEVELS.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <button
          aria-label="Previous levels"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="p-2 disabled:opacity-50"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="overflow-hidden flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, x: page > 0 ? 50 : -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: page > 0 ? -50 : 50 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-[repeat(19,minmax(0,1fr))] items-center min-w-[2000px]"
            >
              {pageLevels.map((lvl, idx) => (
                <Fragment key={lvl.id}>
                  <div className="flex justify-center">
                    <LevelNode
                      level={lvl.id}
                      unlocked={lvl.unlocked}
                      current={lvl.id === current}
                      onSelect={onSelect}
                    />
                  </div>
                  {idx < pageLevels.length - 1 && <PathConnector />}
                </Fragment>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          aria-label="Next levels"
          onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
          disabled={page === maxPage}
          className="p-2 disabled:opacity-50"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}
