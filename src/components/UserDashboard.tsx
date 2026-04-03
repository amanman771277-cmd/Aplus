import React, { useEffect, useState, useRef, useCallback } from 'react';
import { collection, query, orderBy, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp, limit, startAfter, getDocs, where, QueryDocumentSnapshot } from 'firebase/firestore';
import { getToken, onMessage } from 'firebase/messaging';
import { auth, db, messaging, handleFirestoreError, OperationType } from '../firebase';
import { QuoteCard, QuoteCardSkeleton } from './QuoteCard';
import { QuoteOfTheDay } from './QuoteOfTheDay';
import { LogOut, Zap, Loader2, Search, User, ChevronDown, ArrowUpAZ, ArrowDownAZ, SortAsc, SortDesc, Clock, Bell, Filter, X, Check, Calendar, Tag, Quote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from './UserProfile';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Quote {
  id: string;
  text: string;
  author: string;
  category?: string;
  createdAt: Date;
}

interface Notification {
  id: string;
  createdAt: Date;
}

type SortOption = 'newest' | 'oldest' | 'author-asc' | 'author-desc';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

export function UserDashboard() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [hasNewNotifs, setHasNewNotifs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [allCategories, setAllCategories] = useState<string[]>(['All']);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(['All']));
  const [categorySearch, setCategorySearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showProfile, setShowProfile] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastQuoteElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreQuotes();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  const PAGE_SIZE = 6;

  // Fetch all unique categories once
  useEffect(() => {
    if (!auth.currentUser) return;
    const fetchCategories = async () => {
      try {
        const q = query(collection(db, 'quotes'), where('status', '==', 'published'));
        const snapshot = await getDocs(q);
        const cats = new Set<string>();
        snapshot.docs.forEach(doc => {
          const cat = doc.data().category;
          if (cat) cats.add(cat);
        });
        setAllCategories(['All', ...Array.from(cats)].sort());
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };
    fetchCategories();
  }, [auth.currentUser]);

  const loadQuotes = async (isInitial = true) => {
    if (!auth.currentUser) return;
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let q = query(
        collection(db, 'quotes'), 
        where('status', '==', 'published')
      );

      // Add category filter if not 'All'
      if (!selectedCategories.has('All')) {
        q = query(q, where('category', 'in', Array.from(selectedCategories)));
      }

      // Add sorting
      switch (sortBy) {
        case 'newest':
          q = query(q, orderBy('createdAt', 'desc'));
          break;
        case 'oldest':
          q = query(q, orderBy('createdAt', 'asc'));
          break;
        case 'author-asc':
          q = query(q, orderBy('author', 'asc'));
          break;
        case 'author-desc':
          q = query(q, orderBy('author', 'desc'));
          break;
      }

      // Add pagination
      if (!isInitial && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }
      
      q = query(q, limit(PAGE_SIZE));

      const snapshot = await getDocs(q);
      const newQuotes = snapshot.docs.map(doc => ({
        id: doc.id,
        text: doc.data().text,
        author: doc.data().author,
        category: doc.data().category || '',
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      }));

      if (isInitial) {
        setQuotes(newQuotes);
      } else {
        setQuotes(prev => [...prev, ...newQuotes]);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'quotes');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreQuotes = () => {
    if (!loadingMore && hasMore) {
      loadQuotes(false);
    }
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    loadQuotes(true);
  }, [selectedCategories, sortBy, auth.currentUser]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Request FCM permission and get token
    const setupFCM = async () => {
      if (!messaging) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, {
            vapidKey: (import.meta as any).env.VITE_FIREBASE_VAPID_KEY
          });
          if (token) {
            // Store token in Firestore
            const tokenRef = doc(db, 'users', auth.currentUser!.uid, 'fcm_tokens', token);
            await setDoc(tokenRef, {
              token,
              createdAt: serverTimestamp()
            });
          }
        }
      } catch (error) {
        console.error('Error setting up FCM:', error);
      }
    };

    setupFCM();

    // Listen for foreground messages
    if (messaging) {
      onMessage(messaging, (payload) => {
        console.log('Message received in foreground: ', payload);
        if (payload.notification) {
          toast.info(payload.notification.title || 'New Notification', {
            description: payload.notification.body || '',
            icon: <Bell className="w-4 h-4" />
          });
        }
        setHasNewNotifs(true);
      });
    }

    // Listen to notifications for indicator
    const notifsRef = collection(db, 'notifications');
    const qNotifs = query(
      notifsRef, 
      where('targetUserId', 'in', [auth.currentUser.uid, 'all']),
      orderBy('createdAt', 'desc'), 
      limit(5)
    );
    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recent = snapshot.docs.some(doc => {
        const createdAt = doc.data().createdAt?.toDate() || new Date();
        return createdAt > oneDayAgo;
      });
      setHasNewNotifs(recent);
    }, (error) => {
      // If index is missing, fallback to global notifications
      if (error.message.includes('FAILED_PRECONDITION')) {
        const qFallback = query(notifsRef, orderBy('createdAt', 'desc'), limit(5));
        onSnapshot(qFallback, (snapshot) => {
          const now = new Date();
          const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const recent = snapshot.docs.some(doc => {
            const createdAt = doc.data().createdAt?.toDate() || new Date();
            return createdAt > oneDayAgo;
          });
          setHasNewNotifs(recent);
        });
      }
    });

    // Listen to user's favorites
    const favoritesRef = collection(db, 'users', auth.currentUser.uid, 'favorites');
    const unsubscribeFavorites = onSnapshot(favoritesRef, (snapshot) => {
      const favIds = new Set(snapshot.docs.map(doc => doc.id));
      setFavorites(favIds);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${auth.currentUser?.uid}/favorites`);
    });

    return () => {
      unsubscribeNotifs();
      unsubscribeFavorites();
    };
  }, [auth.currentUser]);

  const handleToggleFavorite = async (quoteId: string) => {
    if (!auth.currentUser) return;
    const favRef = doc(db, 'users', auth.currentUser.uid, 'favorites', quoteId);
    
    try {
      if (favorites.has(quoteId)) {
        await deleteDoc(favRef);
        toast.success('Removed from favorites');
      } else {
        await setDoc(favRef, {
          quoteId,
          createdAt: serverTimestamp()
        });
        toast.success('Added to favorites');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}/favorites/${quoteId}`);
      toast.error('Failed to update favorites');
    }
  };

  const handleToggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (category === 'All') {
        return new Set(['All']);
      }
      
      if (next.has('All')) {
        next.delete('All');
      }
      
      if (next.has(category)) {
        next.delete(category);
        if (next.size === 0) {
          return new Set(['All']);
        }
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (showProfile) {
    return <UserProfile onBack={() => setShowProfile(false)} />;
  }

  // Filter categories by search input
  const filteredCategories = allCategories.filter(category => 
    category.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const sortOptions: { value: SortOption; label: string; icon: React.ReactNode }[] = [
    { value: 'newest', label: 'Newest First', icon: <Clock className="w-4 h-4" /> },
    { value: 'oldest', label: 'Oldest First', icon: <Clock className="w-4 h-4 rotate-180" /> },
    { value: 'author-asc', label: 'Author (A-Z)', icon: <ArrowUpAZ className="w-4 h-4" /> },
    { value: 'author-desc', label: 'Author (Z-A)', icon: <ArrowDownAZ className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-yellow-400 via-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-300">
              <Zap className="text-white w-6 h-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Aplus</h1>
              <p className="text-indigo-200 text-sm opacity-80">Your feed of motivation</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors relative"
              title="My Profile"
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Profile</span>
              {hasNewNotifs && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-slate-900 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => auth.signOut()}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Category Filter & Sorting */}
        {!loading && allCategories.length > 1 && (
          <div className="mb-8 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-1">
                {/* Category Dropdown */}
                <div className="relative flex-1 max-w-xs">
                  <button
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`w-full flex items-center justify-between space-x-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all ${
                      !selectedCategories.has('All') ? 'border-indigo-500/50 bg-indigo-500/5' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Filter className={`w-4 h-4 ${!selectedCategories.has('All') ? 'text-indigo-400' : 'text-indigo-200'}`} />
                      <span>
                        {selectedCategories.has('All') 
                          ? 'All Categories' 
                          : `${selectedCategories.size} Selected`}
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isFilterOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setIsFilterOpen(false)} 
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute left-0 mt-2 w-64 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden"
                        >
                          <div className="p-3 border-b border-white/5 bg-white/5">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-indigo-300/50 w-3.5 h-3.5" />
                              <input
                                type="text"
                                placeholder="Search categories..."
                                value={categorySearch}
                                onChange={(e) => setCategorySearch(e.target.value)}
                                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-indigo-300/30 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
                            <button
                              onClick={() => {
                                handleToggleCategory('All');
                                setIsFilterOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left rounded-lg transition-colors ${
                                selectedCategories.has('All') 
                                  ? 'bg-indigo-500 text-white' 
                                  : 'text-indigo-200 hover:bg-white/5'
                              }`}
                            >
                              <span>All Categories</span>
                              {selectedCategories.has('All') && <Check className="w-3.5 h-3.5" />}
                            </button>
                            <div className="h-px bg-white/5 my-1" />
                            {filteredCategories.filter(c => c !== 'All').map(category => (
                              <button
                                key={category}
                                onClick={() => handleToggleCategory(category)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left rounded-lg transition-colors mb-0.5 ${
                                  selectedCategories.has(category) 
                                    ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30' 
                                    : 'text-indigo-200 hover:bg-white/5 border border-transparent'
                                }`}
                              >
                                <span className="truncate">{category}</span>
                                {selectedCategories.has(category) && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                              </button>
                            ))}
                            {filteredCategories.filter(c => c !== 'All').length === 0 && (
                              <div className="p-4 text-center text-indigo-300/30 text-xs italic">
                                No categories found
                              </div>
                            )}
                          </div>
                          {!selectedCategories.has('All') && (
                            <div className="p-2 border-t border-white/5 bg-white/5 flex justify-end">
                              <button
                                onClick={() => setSelectedCategories(new Set(['All']))}
                                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-wider px-2 py-1"
                              >
                                Reset Filters
                              </button>
                            </div>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className="w-full md:w-auto flex items-center justify-between space-x-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-white/10 transition-all"
                >
                  <div className="flex items-center space-x-2">
                    {sortOptions.find(o => o.value === sortBy)?.icon}
                    <span>{sortOptions.find(o => o.value === sortBy)?.label}</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isSortOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setIsSortOpen(false)} 
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-slate-800 border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden"
                      >
                        {sortOptions.map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value);
                              setIsSortOpen(false);
                            }}
                            className={`w-full flex items-center space-x-3 px-4 py-3 text-sm text-left transition-colors ${
                              sortBy === option.value 
                                ? 'bg-indigo-500 text-white' 
                                : 'text-indigo-200 hover:bg-white/5'
                            }`}
                          >
                            {option.icon}
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Active Filter Chips */}
            {!selectedCategories.has('All') && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-bold text-indigo-300/50 uppercase tracking-widest mr-1">Active Filters:</span>
                {Array.from(selectedCategories).map((category: string) => (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    key={category}
                    onClick={() => handleToggleCategory(category)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium rounded-full hover:bg-indigo-500/30 transition-colors"
                  >
                    <span>{category}</span>
                    <X size={12} />
                  </motion.button>
                ))}
                <button
                  onClick={() => setSelectedCategories(new Set(['All']))}
                  className="text-[10px] text-gray-400 hover:text-white underline underline-offset-2 ml-2"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-6">
            {[1, 2, 3].map(i => <QuoteCardSkeleton key={i} />)}
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
            <Zap className="w-12 h-12 text-yellow-400 mx-auto mb-4 opacity-50" />
            <p className="text-xl text-gray-300">No quotes found.</p>
            {!selectedCategories.has('All') ? (
              <p className="text-gray-500 mt-2">Try selecting different categories.</p>
            ) : (
              <p className="text-gray-500 mt-2">Waiting for the admin to publish some inspiration.</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {selectedCategories.has('All') && <QuoteOfTheDay quotes={quotes} />}
            <AnimatePresence mode="popLayout" initial={false}>
              {quotes.map((quote, index) => (
                <div key={quote.id} ref={index === quotes.length - 1 ? lastQuoteElementRef : null}>
                  <QuoteCard
                    id={quote.id}
                    text={quote.text}
                    author={quote.author}
                    category={quote.category}
                    createdAt={quote.createdAt}
                    isFavorited={favorites.has(quote.id)}
                    onToggleFavorite={handleToggleFavorite}
                    onClick={() => setSelectedQuote(quote)}
                  />
                </div>
              ))}
            </AnimatePresence>
            
            {loadingMore && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
              </div>
            )}

            {!hasMore && quotes.length > 0 && (
              <div className="text-center py-8 text-indigo-300/40 text-sm italic">
                You've reached the end of your inspiration feed.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quote Detail Modal */}
      <AnimatePresence>
        {selectedQuote && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedQuote(null)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl bg-slate-900 border border-white/10 rounded-3xl shadow-2xl z-[70] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div className="flex items-center space-x-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm font-bold text-indigo-200 uppercase tracking-widest">Quote Details</span>
                </div>
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 md:p-12">
                <div className="relative">
                  <Quote className="absolute -top-6 -left-6 w-16 h-16 text-white/5 rotate-12" />
                  <blockquote className="text-2xl md:text-4xl font-serif italic text-white leading-tight mb-12 relative z-10">
                    "{selectedQuote.text}"
                  </blockquote>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/5">
                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <User size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-indigo-300/50 uppercase tracking-widest">Author</p>
                        <p className="text-lg font-semibold text-white">{selectedQuote.author}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Tag size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-purple-300/50 uppercase tracking-widest">Category</p>
                        <p className="text-lg font-semibold text-white">{selectedQuote.category || 'Uncategorized'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-pink-500/20 flex items-center justify-center text-pink-400">
                        <Calendar size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-pink-300/50 uppercase tracking-widest">Published On</p>
                        <p className="text-lg font-semibold text-white">
                          {format(selectedQuote.createdAt, 'MMMM do, yyyy')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Clock size={24} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-emerald-300/50 uppercase tracking-widest">Time</p>
                        <p className="text-lg font-semibold text-white">
                          {format(selectedQuote.createdAt, 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white/5 border-t border-white/5 flex justify-center">
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-500/20"
                >
                  Close View
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
