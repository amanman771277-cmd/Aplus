import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface Quote {
  id: string;
  text: string;
  author: string;
  category?: string;
  createdAt: Date;
}

interface QuoteOfTheDayProps {
  quotes: Quote[];
}

export function QuoteOfTheDay({ quotes }: QuoteOfTheDayProps) {
  const quote = useMemo(() => {
    if (quotes.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex];
  }, [quotes]);

  if (!quote) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-3xl p-8 mb-8 shadow-xl backdrop-blur-sm relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-4 opacity-20">
        <Zap className="w-24 h-24 text-yellow-400" />
      </div>
      <div className="relative z-10">
        <div className="flex items-center space-x-2 mb-4">
          <Zap className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-bold text-indigo-200 uppercase tracking-widest">Quote of the Day</span>
        </div>
        <blockquote className="text-2xl md:text-3xl font-serif italic text-white leading-tight mb-6">
          "{quote.text}"
        </blockquote>
        <p className="text-indigo-300 font-semibold">— {quote.author}</p>
      </div>
    </motion.div>
  );
}
