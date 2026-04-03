import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote as QuoteIcon, Share2, Check, Heart, Twitter, Facebook, Copy, X, Loader2, Calendar, Tag, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface QuoteCardProps {
  id: string;
  text: string;
  author: string;
  category?: string;
  createdAt: Date;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  onClick?: () => void;
  isLoading?: boolean;
  key?: React.Key;
}

export function QuoteCardSkeleton() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 w-24 bg-white/10 rounded-full" />
      </div>
      <div className="space-y-3 mb-6">
        <div className="h-4 w-full bg-white/10 rounded" />
        <div className="h-4 w-5/6 bg-white/10 rounded" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-2 w-16 bg-white/10 rounded" />
          </div>
        </div>
        <div className="flex space-x-2">
          <div className="w-9 h-9 rounded-full bg-white/10" />
          <div className="w-9 h-9 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.3, ease: "easeIn" }
  }
};

export function QuoteCard({ id, text, author, category, createdAt, isFavorited, onToggleFavorite, onClick, isLoading }: QuoteCardProps) {
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const isNew = new Date().getTime() - createdAt.getTime() < 24 * 60 * 60 * 1000;

  if (isLoading) return <QuoteCardSkeleton />;

  const shareText = `"${text}"\n— ${author}`;
  const shareUrl = window.location.href;

  const handleCopy = async () => {
    setIsActionLoading(true);
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setShowShareMenu(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    } finally {
      setIsActionLoading(false);
    }
  };

  const shareToTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowShareMenu(false);
  };

  const shareToFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setShowShareMenu(false);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      setIsActionLoading(true);
      try {
        await navigator.share({
          title: 'Motivational Quote',
          text: shareText,
          url: shareUrl,
        });
        setShowShareMenu(false);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          console.error('Error sharing:', err);
        }
      } finally {
        setIsActionLoading(false);
      }
    } else {
      setShowShareMenu(true);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      setIsActionLoading(true);
      await onToggleFavorite(id);
      setIsActionLoading(false);
    }
  };

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClick}
      className={`bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-6 shadow-xl relative overflow-hidden group transition-all duration-300 ${onClick ? 'cursor-pointer hover:bg-white/15 hover:border-white/30' : ''}`}
      role={onClick ? "button" : "article"}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Quote by ${author}: ${text.substring(0, 50)}...`}
    >
      <div className="absolute top-4 right-4 text-white/10 pointer-events-none">
        <QuoteIcon size={48} />
      </div>
      
      {/* Action Loading Overlay */}
      <AnimatePresence>
        {isActionLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-black/20 backdrop-blur-[1px] flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-indigo-400 animate-spin" />
              <span className="text-xs font-semibold text-indigo-200 uppercase tracking-widest">Processing...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {category && (
              <span className="inline-block px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold rounded-full uppercase tracking-wider">
                {category}
              </span>
            )}
            {isNew && (
              <span className="inline-block px-3 py-1 bg-pink-500/20 border border-pink-500/30 text-pink-400 text-xs font-bold rounded-full uppercase tracking-widest animate-pulse">
                New
              </span>
            )}
          </div>
        </div>
        <p className="text-xl md:text-2xl font-medium text-white mb-6 leading-relaxed pr-8">
          "{text}"
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-inner">
              {author.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium">{author}</p>
              <p className="text-indigo-200 text-sm">
                {formatDistanceToNow(createdAt, { addSuffix: true })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 relative">
            {onToggleFavorite && (
              <button
                onClick={handleToggleFavorite}
                disabled={isActionLoading}
                className={`p-2 rounded-full transition-all relative overflow-hidden ${
                  isFavorited 
                    ? 'bg-pink-500/20 text-pink-500' 
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-pink-400'
                } disabled:opacity-50`}
                title={isFavorited ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={isFavorited}
              >
                <AnimatePresence mode="wait">
                  {isActionLoading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                    >
                      <Loader2 size={20} className="animate-spin" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="heart"
                      whileTap={{ scale: 1.4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      <Heart size={20} fill={isFavorited ? "currentColor" : "none"} />
                    </motion.div>
                  )}
                </AnimatePresence>
                {isFavorited && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: [0, 1, 0], scale: [1, 2, 2.5] }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 bg-pink-500/20 rounded-full pointer-events-none"
                  />
                )}
              </button>
            )}
            
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShareMenu(!showShareMenu);
                }}
                disabled={isActionLoading}
                className={`p-2 rounded-full transition-all ${
                  showShareMenu 
                    ? 'bg-indigo-500 text-white' 
                    : 'bg-white/5 text-indigo-300 hover:bg-white/20 hover:text-white'
                } disabled:opacity-50`}
                title="Share options"
                aria-expanded={showShareMenu}
                aria-haspopup="menu"
              >
                {isActionLoading ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
              </button>

              <AnimatePresence>
                {showShareMenu && (
                  <>
                    <div 
                      className="fixed inset-0 z-20" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowShareMenu(false);
                      }} 
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute right-0 bottom-full mb-2 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-30 overflow-hidden"
                      role="menu"
                      aria-label="Share options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-2 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider px-2">Share via</span>
                        <button 
                          onClick={() => setShowShareMenu(false)} 
                          className="p-1 hover:bg-white/10 rounded-md"
                          aria-label="Close share menu"
                        >
                          <X size={14} className="text-gray-400" />
                        </button>
                      </div>
                      <div className="p-1">
                        <button
                          onClick={handleCopy}
                          role="menuitem"
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-left text-indigo-100 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                          <span>{copied ? 'Copied!' : 'Copy Text'}</span>
                        </button>
                        <button
                          onClick={shareToTwitter}
                          role="menuitem"
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-left text-indigo-100 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <Twitter size={18} className="text-sky-400" />
                          <span>Twitter (X)</span>
                        </button>
                        <button
                          onClick={shareToFacebook}
                          role="menuitem"
                          className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-left text-indigo-100 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <Facebook size={18} className="text-blue-500" />
                          <span>Facebook</span>
                        </button>
                        {navigator.share && (
                          <button
                            onClick={handleNativeShare}
                            role="menuitem"
                            className="w-full flex items-center space-x-3 px-3 py-2.5 text-sm text-left text-indigo-100 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Share2 size={18} className="text-indigo-400" />
                            <span>More Options</span>
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
