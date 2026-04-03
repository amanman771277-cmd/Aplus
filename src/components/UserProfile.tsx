import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, doc, getDoc, deleteDoc, updateDoc, serverTimestamp, orderBy, where, arrayUnion } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { QuoteCard, QuoteCardSkeleton } from './QuoteCard';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Heart, ArrowLeft, Loader2, Zap, Edit2, Save, X, Info, Bell, Clock, Quote, Tag, Calendar, Settings, Shield, BellOff } from 'lucide-react';
import { toast } from 'sonner';

interface Quote {
  id: string;
  text: string;
  author: string;
  category?: string;
  createdAt: Date;
}

interface Favorite {
  quoteId: string;
  createdAt: any;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'quote' | 'system';
  createdAt: Date;
  link?: string;
  targetUserId?: string;
}

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

export function UserProfile({ onBack }: { onBack: () => void }) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [favoriteQuotes, setFavoriteQuotes] = useState<Quote[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissedNotifs, setDismissedNotifs] = useState<string[]>([]);
  const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set());
  const [undoTimeouts, setUndoTimeouts] = useState<Record<string, NodeJS.Timeout>>({});
  const [undoCountdowns, setUndoCountdowns] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notifLoading, setNotifLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [joinDate, setJoinDate] = useState<Date | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [activeTab, setActiveTab] = useState<'favorites' | 'notifications' | 'settings'>('favorites');
  
  // Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState({
    quoteNotifications: true,
    systemNotifications: true
  });
  
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    // Fetch user profile data
    const userRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setDisplayName(data.displayName || '');
          setBio(data.bio || '');
          setDismissedNotifs(data.dismissedNotifs || []);
          setNotifPrefs({
            quoteNotifications: data.notificationPrefs?.quoteNotifications ?? true,
            systemNotifications: data.notificationPrefs?.systemNotifications ?? true
          });
          if (data.createdAt) {
            setJoinDate(data.createdAt.toDate());
          } else if (user.metadata.creationTime) {
            setJoinDate(new Date(user.metadata.creationTime));
          }
        } else if (user.metadata.creationTime) {
          setJoinDate(new Date(user.metadata.creationTime));
        }
        setProfileLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      setProfileLoading(false);
    });

    // Fetch notifications
    const notificationsRef = collection(db, 'notifications');
    const qNotifs = query(
      notificationsRef, 
      where('targetUserId', 'in', [user.uid, 'all']),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Notification[];
      setNotifications(notifs);
      setNotifLoading(false);
    }, (error) => {
      // Fallback if index is missing
      if (error.message.includes('FAILED_PRECONDITION')) {
        const qFallback = query(notificationsRef, orderBy('createdAt', 'desc'));
        onSnapshot(qFallback, (snapshot) => {
          const notifs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date()
          })) as Notification[];
          setNotifications(notifs);
          setNotifLoading(false);
        });
      } else {
        handleFirestoreError(error, OperationType.LIST, 'notifications');
        setNotifLoading(false);
      }
    });

    const favoritesRef = collection(db, 'users', user.uid, 'favorites');
    const unsubscribeFavorites = onSnapshot(favoritesRef, async (snapshot) => {
      const favs = snapshot.docs.map(doc => doc.data() as Favorite);
      setFavorites(favs);

      // Fetch quote details for each favorite
      const quotesData: Quote[] = [];
      for (const fav of favs) {
        try {
          const quoteDoc = await getDoc(doc(db, 'quotes', fav.quoteId));
          if (quoteDoc.exists()) {
            quotesData.push({
              id: quoteDoc.id,
              text: quoteDoc.data().text,
              author: quoteDoc.data().author,
              category: quoteDoc.data().category,
              createdAt: quoteDoc.data().createdAt?.toDate() || new Date(),
            });
          }
        } catch (error) {
          console.error("Error fetching favorite quote:", error);
        }
      }
      setFavoriteQuotes(quotesData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/favorites`);
      setLoading(false);
    });

    return () => {
      unsubscribeUser();
      unsubscribeNotifs();
      unsubscribeFavorites();
    };
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaveLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: displayName.trim(),
        bio: bio.trim(),
        notificationPrefs: notifPrefs
      });
      setIsEditing(false);
      toast.success('Profile and settings updated');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      toast.error('Failed to update profile');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleFavorite = async (quoteId: string) => {
    if (!user) return;
    const favRef = doc(db, 'users', user.uid, 'favorites', quoteId);
    try {
      await deleteDoc(favRef);
      toast.success('Removed from favorites');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/favorites/${quoteId}`);
      toast.error('Failed to remove favorite');
    }
  };

  const handleDeleteNotification = async (notif: Notification) => {
    if (!user) return;
    
    // Add to pending deletions locally first
    setPendingDeletions(prev => {
      const next = new Set(prev);
      next.add(notif.id);
      return next;
    });

    setUndoCountdowns(prev => ({ ...prev, [notif.id]: 5 }));

    // Update countdown every second
    const interval = setInterval(() => {
      setUndoCountdowns(prev => {
        const current = prev[notif.id];
        if (current <= 1) {
          clearInterval(interval);
          return { ...prev, [notif.id]: 0 };
        }
        return { ...prev, [notif.id]: current - 1 };
      });
    }, 1000);

    // Set a timeout for actual deletion
    const timeout = setTimeout(async () => {
      clearInterval(interval);
      try {
        if (notif.targetUserId === user.uid) {
          await deleteDoc(doc(db, 'notifications', notif.id));
        } else {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, {
            dismissedNotifs: arrayUnion(notif.id)
          });
        }
        // Remove from pending after successful deletion
        setPendingDeletions(prev => {
          const next = new Set(prev);
          next.delete(notif.id);
          return next;
        });
        setUndoCountdowns(prev => {
          const next = { ...prev };
          delete next[notif.id];
          return next;
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `notifications/${notif.id}`);
        // Revert pending on error
        setPendingDeletions(prev => {
          const next = new Set(prev);
          next.delete(notif.id);
          return next;
        });
      }
    }, 5000); // 5 seconds undo window

    setUndoTimeouts(prev => ({ ...prev, [notif.id]: timeout }));
  };

  const handleUndoDelete = (notifId: string) => {
    if (undoTimeouts[notifId]) {
      clearTimeout(undoTimeouts[notifId]);
      setUndoTimeouts(prev => {
        const next = { ...prev };
        delete next[notifId];
        return next;
      });
      setUndoCountdowns(prev => {
        const next = { ...prev };
        delete next[notifId];
        return next;
      });
      setPendingDeletions(prev => {
        const next = new Set(prev);
        next.delete(notifId);
        return next;
      });
    }
  };

  const visibleNotifications = notifications.filter(n => !dismissedNotifs.includes(n.id) && !pendingDeletions.has(n.id));
  const deletedNotifications = notifications.filter(n => pendingDeletions.has(n.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-indigo-300 hover:text-white mb-8 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Feed</span>
        </button>

        <header className="bg-white/5 border border-white/10 rounded-3xl p-8 mb-12 backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-indigo-300 hover:text-white"
                title="Edit Profile"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => setIsEditing(false)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-red-400 hover:text-red-300"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center shadow-xl flex-shrink-0">
              <User className="w-12 h-12 text-white" />
            </div>
            
            <div className="flex-1 w-full text-center md:text-left">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Tell us about yourself..."
                      rows={2}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                    />
                  </div>
                  <button
                    onClick={handleSaveProfile}
                    disabled={saveLoading}
                    className="flex items-center justify-center space-x-2 bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-xl transition-all disabled:opacity-50 w-full md:w-auto"
                  >
                    {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Save Profile</span>
                  </button>
                </div>
              ) : (
                <>
                  <h1 className="text-3xl font-bold mb-2">{displayName || 'Anonymous User'}</h1>
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center justify-center md:justify-start space-x-2 text-indigo-200">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">{user?.email}</span>
                    </div>
                    {joinDate && (
                      <div className="flex items-center justify-center md:justify-start space-x-2 text-indigo-300/70">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">Joined on {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(joinDate)}</span>
                      </div>
                    )}
                    {bio && (
                      <div className="flex items-start justify-center md:justify-start space-x-2 text-gray-300 mt-2">
                        <Info className="w-4 h-4 mt-1 flex-shrink-0 text-indigo-400" />
                        <p className="text-sm italic">"{bio}"</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-white/5 p-1 rounded-2xl mb-8 w-full max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'favorites' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Heart className={`w-4 h-4 ${activeTab === 'favorites' ? 'fill-white' : ''}`} />
            <span>Favorites</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold transition-all relative ${
              activeTab === 'notifications' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Updates</span>
            {visibleNotifications.length > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-pink-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'settings' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'notifications' && (
            <motion.section
              key="notifications"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-12"
            >
              <div className="flex items-center space-x-3 mb-6">
                <Bell className="w-6 h-6 text-indigo-400" />
                <h2 className="text-2xl font-bold">What's New</h2>
              </div>

              {notifLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                </div>
              ) : visibleNotifications.length === 0 && deletedNotifications.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                  <p className="text-gray-400">No new notifications.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence>
                    {deletedNotifications.map(notif => (
                      <motion.div
                        key={`undo-${notif.id}`}
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center justify-between bg-indigo-500/20 border border-indigo-500/30 px-4 py-3 rounded-xl text-sm backdrop-blur-sm">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                              {undoCountdowns[notif.id] || 0}s
                            </div>
                            <span className="text-indigo-200">Notification deleted</span>
                          </div>
                          <button
                            onClick={() => handleUndoDelete(notif.id)}
                            className="flex items-center space-x-1 px-3 py-1 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 transition-colors shadow-lg"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Undo</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <AnimatePresence mode="popLayout">
                      {visibleNotifications.slice(0, 4).map((notif) => (
                        <motion.div
                          key={notif.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-colors relative group"
                        >
                          <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              notif.type === 'quote' 
                                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/20' 
                                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {notif.type === 'quote' ? <Quote className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start">
                                <h3 className="font-semibold text-white truncate pr-6">{notif.title}</h3>
                                <button
                                  onClick={() => handleDeleteNotification(notif)}
                                  className="absolute top-4 right-4 p-1.5 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  title="Delete notification"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <p className="text-sm text-gray-400 line-clamp-2 mt-1">{notif.message}</p>
                              <div className="flex items-center mt-2 text-[10px] text-indigo-300/60 uppercase tracking-widest font-bold">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(notif.createdAt)}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </motion.section>
          )}

          {activeTab === 'favorites' && (
            <motion.section
              key="favorites"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex items-center space-x-3 mb-8">
                <Heart className="w-6 h-6 text-pink-500 fill-pink-500" />
                <h2 className="text-2xl font-bold">Favorite Quotes</h2>
                <span className="bg-pink-500/20 text-pink-300 px-3 py-1 rounded-full text-sm font-semibold">
                  {favoriteQuotes.length}
                </span>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 gap-6">
                  {[1, 2].map(i => <QuoteCardSkeleton key={i} />)}
                </div>
              ) : favoriteQuotes.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
                  <Zap className="w-12 h-12 text-yellow-400 mx-auto mb-4 opacity-50" />
                  <p className="text-xl text-gray-300">No favorites yet.</p>
                  <p className="text-gray-500 mt-2">Heart some quotes in the feed to save them here.</p>
                </div>
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="space-y-6"
                >
                  <AnimatePresence mode="popLayout">
                    {favoriteQuotes.map(quote => (
                      <QuoteCard
                        key={quote.id}
                        id={quote.id}
                        text={quote.text}
                        author={quote.author}
                        category={quote.category}
                        createdAt={quote.createdAt}
                        isFavorited={true}
                        onToggleFavorite={handleToggleFavorite}
                        onClick={() => setSelectedQuote(quote)}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.section>
          )}

          {activeTab === 'settings' && (
            <motion.section
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center space-x-3 mb-6">
                <Settings className="w-6 h-6 text-indigo-400" />
                <h2 className="text-2xl font-bold">User Settings</h2>
              </div>

              {/* Profile Settings */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center text-indigo-300">
                  <User className="w-5 h-5 mr-2" />
                  Profile Information
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How should we call you?"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Short Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="A little bit about yourself..."
                      rows={3}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-8 backdrop-blur-sm">
                <h3 className="text-lg font-bold mb-6 flex items-center text-indigo-300">
                  <Bell className="w-5 h-5 mr-2" />
                  Notification Preferences
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Quote className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-white">Quote Updates</p>
                        <p className="text-xs text-gray-400">New quotes and status updates</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotifPrefs(prev => ({ ...prev, quoteNotifications: !prev.quoteNotifications }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifPrefs.quoteNotifications ? 'bg-indigo-500' : 'bg-gray-700'}`}
                    >
                      <motion.div
                        animate={{ x: notifPrefs.quoteNotifications ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-white">System Announcements</p>
                        <p className="text-xs text-gray-400">Important app news and maintenance</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotifPrefs(prev => ({ ...prev, systemNotifications: !prev.systemNotifications }))}
                      className={`w-12 h-6 rounded-full transition-colors relative ${notifPrefs.systemNotifications ? 'bg-indigo-500' : 'bg-gray-700'}`}
                    >
                      <motion.div
                        animate={{ x: notifPrefs.systemNotifications ? 24 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveProfile}
                  disabled={saveLoading}
                  className="flex items-center space-x-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  <span>Save All Changes</span>
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
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
                          {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(selectedQuote.createdAt)}
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
                          {new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(selectedQuote.createdAt)}
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
