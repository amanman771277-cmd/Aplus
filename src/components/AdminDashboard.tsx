import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, getDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, LogOut, Quote, Users, Edit2, X, Save, Bell, Zap, Wand2, Trash2, AlertTriangle } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

interface QuoteData {
  id: string;
  text: string;
  author: string;
  category?: string;
  status?: 'published' | 'draft' | 'rejected';
  createdAt: any;
  createdBy: string;
}

interface UserData {
  id: string;
  email: string;
  role: string;
  createdAt: any;
}

export function AdminDashboard() {
  const [quoteText, setQuoteText] = useState('');
  const [author, setAuthor] = useState('Admin');
  const [category, setCategory] = useState('');
  const [quoteStatus, setQuoteStatus] = useState<'published' | 'draft'>('published');
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifLoading, setNotifLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  
  // Editing state
  const [editingQuote, setEditingQuote] = useState<QuoteData | null>(null);
  const [editQuoteText, setEditQuoteText] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<'published' | 'draft' | 'rejected'>('published');
  const [editLoading, setEditLoading] = useState(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Sorting & Filtering state
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'author'>('newest');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'rejected'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'broadcast-quote' | 'manage-quotes' | 'broadcast-announcement' | 'manage-users'>('broadcast-quote');

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen to the users collection
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];
      setUsers(usersData);
    }, (error) => {
      console.error("Error fetching users:", error);
    });

    // Listen to quotes
    const qQuotes = query(collection(db, 'quotes'), orderBy('createdAt', 'desc'));
    const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
      const quotesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as QuoteData[];
      setQuotes(quotesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching quotes:", error);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeQuotes();
    };
  }, [auth.currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteText.trim() || !author.trim()) return;

    setLoading(true);
    setSuccess(false);

    try {
      const newQuote: any = {
        text: quoteText.trim(),
        author: author.trim(),
        status: quoteStatus,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid
      };
      
      if (category.trim()) {
        newQuote.category = category.trim();
      }

      const quoteDoc = await addDoc(collection(db, 'quotes'), newQuote);
      
      // Create notification if published
      if (quoteStatus === 'published') {
        await addDoc(collection(db, 'notifications'), {
          title: 'New Inspiration!',
          message: `"${quoteText.substring(0, 50)}${quoteText.length > 50 ? '...' : ''}" by ${author}`,
          type: 'quote',
          link: quoteDoc.id,
          targetUserId: 'all',
          createdAt: serverTimestamp()
        });

        // Send push notification via backend
        try {
          await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'New Inspiration!',
              message: `"${quoteText.substring(0, 50)}${quoteText.length > 50 ? '...' : ''}" by ${author}`
            })
          });
        } catch (e) {
          console.error('Failed to send push notification:', e);
        }
      }

      setQuoteText('');
      setCategory('');
      setQuoteStatus('published');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;

    setNotifLoading(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        title: notifTitle.trim(),
        message: notifMessage.trim(),
        type: 'system',
        targetUserId: 'all',
        createdAt: serverTimestamp()
      });

      // Send push notification via backend
      try {
        await fetch('/api/send-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: notifTitle.trim(),
            message: notifMessage.trim()
          })
        });
      } catch (e) {
        console.error('Failed to send push notification:', e);
      }

      setNotifTitle('');
      setNotifMessage('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notifications');
    } finally {
      setNotifLoading(false);
    }
  };

  const generateQuoteWithGemini = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: "Generate a powerful, unique, and deeply motivational quote in Amharic (አማርኛ). Return it in JSON format with 'text', 'author', and 'category' fields. The category should be a single word like 'Success', 'Resilience', 'Leadership', or 'Mindset'.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              author: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["text", "author", "category"]
          }
        }
      });

      const data = JSON.parse(response.text || '{}');
      if (data.text) {
        setQuoteText(data.text);
        setAuthor(data.author || 'Unknown');
        setCategory(data.category || '');
      }
    } catch (error) {
      console.error("Error generating quote with Gemini:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEditClick = (quote: QuoteData) => {
    setEditingQuote(quote);
    setEditQuoteText(quote.text);
    setEditAuthor(quote.author);
    setEditCategory(quote.category || '');
    setEditStatus(quote.status || 'published');
  };

  const handleUpdateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuote || !editQuoteText.trim() || !editAuthor.trim()) return;

    setEditLoading(true);
    try {
      const quoteRef = doc(db, 'quotes', editingQuote.id);
      const updateData: any = {
        text: editQuoteText.trim(),
        author: editAuthor.trim(),
        status: editStatus
      };
      
      if (editCategory.trim()) {
        updateData.category = editCategory.trim();
      } else {
        updateData.category = '';
      }

      await updateDoc(quoteRef, updateData);
      setEditingQuote(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotes/${editingQuote.id}`);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteQuote = async () => {
    if (!deletingQuoteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'quotes', deletingQuoteId));
      setDeletingQuoteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `quotes/${deletingQuoteId}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (quoteId: string, newStatus: string) => {
    try {
      const quoteRef = doc(db, 'quotes', quoteId);
      const quoteSnap = await getDoc(quoteRef);
      if (!quoteSnap.exists()) return;
      
      const data = quoteSnap.data();
      await updateDoc(quoteRef, { status: newStatus });

      // Create notification for the user who submitted it
      if (data.createdBy) {
        const title = newStatus === 'published' ? 'Quote Approved!' : 'Quote Status Updated';
        const message = newStatus === 'published' 
          ? `Your quote "${data.text.substring(0, 30)}..." has been published!`
          : `Your quote status has been changed to ${newStatus}.`;

        await addDoc(collection(db, 'notifications'), {
          title,
          message,
          type: 'quote',
          link: quoteId,
          targetUserId: data.createdBy,
          createdAt: serverTimestamp()
        });

        // Send targeted push notification
        try {
          await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title,
              message,
              userId: data.createdBy
            })
          });
        } catch (e) {
          console.error('Failed to send push notification:', e);
        }
      }

      // If published, also send a global notification for everyone to see the new quote
      if (newStatus === 'published') {
        await addDoc(collection(db, 'notifications'), {
          title: 'New Inspiration!',
          message: `"${data.text.substring(0, 50)}..." by ${data.author}`,
          type: 'quote',
          link: quoteId,
          targetUserId: 'all',
          createdAt: serverTimestamp()
        });

        // Send global push notification
        try {
          await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'New Inspiration!',
              message: `"${data.text.substring(0, 50)}..." by ${data.author}`
            })
          });
        } catch (e) {
          console.error('Failed to send push notification:', e);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotes/${quoteId}`);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const filteredAndSortedQuotes = [...quotes]
    .filter(q => {
      const qStatus = q.status || 'published';
      const qCategory = q.category || '';
      
      const matchesStatus = statusFilter === 'all' || qStatus === statusFilter;
      const matchesCategory = categoryFilter === 'all' || qCategory === categoryFilter;
      
      return matchesStatus && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      } else if (sortBy === 'oldest') {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      } else if (sortBy === 'author') {
        return a.author.localeCompare(b.author);
      }
      return 0;
    });

  // Extract unique categories for suggestions and filtering
  const allCategories = Array.from(new Set(quotes.map(q => q.category).filter(Boolean))).sort() as string[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-8 pb-32">
      <datalist id="categories">
        {allCategories.map(cat => (
          <option key={cat} value={cat} />
        ))}
      </datalist>
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-12">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-yellow-400 via-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-300">
              <Zap className="text-white w-6 h-6 drop-shadow-[0_0_4px_rgba(255,255,255,0.6)]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Aplus Admin</h1>
              <p className="text-gray-400 text-sm">Manage your inspiration engine</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-lg">
              <Users className="w-5 h-5 text-indigo-400" />
              <span className="text-indigo-200 font-medium">
                {users.length > 0 ? `${users.length} Users` : 'Loading...'}
              </span>
            </div>
            <button
              onClick={() => auth.signOut()}
              className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'broadcast-quote' && (
            <motion.div
              key="broadcast-quote"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-sm"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center">
                  <Send className="w-5 h-5 mr-2 text-indigo-400" />
                  Broadcast New Quote
                </h2>
                
                <button
                  type="button"
                  onClick={generateQuoteWithGemini}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 px-4 py-2 rounded-xl border border-indigo-500/30 transition-all disabled:opacity-50"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  <span>Generate with Gemini</span>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Motivational Speech
                  </label>
                  <textarea
                    value={quoteText}
                    onChange={(e) => setQuoteText(e.target.value)}
                    required
                    rows={4}
                    placeholder="Write something inspiring..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Author Name
                    </label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      required
                      placeholder="e.g., Admin or Famous Person"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Category (Optional)
                    </label>
                    <input
                      type="text"
                      list="categories"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g., Leadership, Life, Success"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Initial Status
                    </label>
                    <select
                      value={quoteStatus}
                      onChange={(e) => setQuoteStatus(e.target.value as any)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="published" className="bg-gray-900">Published</option>
                      <option value="draft" className="bg-gray-900">Draft</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  {success ? (
                    <span className="text-green-400 font-medium">Quote published successfully!</span>
                  ) : (
                    <span className="text-gray-400 text-sm">This will be visible to all users instantly.</span>
                  )}
                  
                  <button
                    type="submit"
                    disabled={loading || !quoteText.trim()}
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>Publish</span>
                        <Send className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'manage-quotes' && (
            <motion.div
              key="manage-quotes"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h3 className="text-xl font-semibold flex items-center">
                  <Quote className="w-5 h-5 mr-2 text-indigo-400" />
                  Manage Quotes
                </h3>
                
                <div className="flex flex-wrap gap-3">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <option value="all" className="bg-gray-900">All Categories</option>
                    {allCategories.map(cat => (
                      <option key={cat} value={cat} className="bg-gray-900">{cat}</option>
                    ))}
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <option value="newest" className="bg-gray-900">Newest First</option>
                    <option value="oldest" className="bg-gray-900">Oldest First</option>
                    <option value="author" className="bg-gray-900">Sort by Author (A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Status Tabs */}
              <div className="flex space-x-2 mb-6 bg-white/5 p-1 rounded-xl w-fit">
                {(['all', 'published', 'draft', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      statusFilter === status 
                        ? 'bg-indigo-500 text-white shadow-lg' 
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
              
              <div className="space-y-4">
                {loading ? (
                  [1, 2, 3].map(i => (
                    <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 animate-pulse">
                      <div className="flex-1 space-y-3">
                        <div className="h-4 w-24 bg-white/10 rounded-full" />
                        <div className="h-6 w-full bg-white/10 rounded-lg" />
                        <div className="h-4 w-32 bg-white/10 rounded-lg" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-10 w-24 bg-white/10 rounded-lg" />
                        <div className="h-10 w-24 bg-white/10 rounded-lg" />
                      </div>
                    </div>
                  ))
                ) : filteredAndSortedQuotes.map((quote) => {
                  const currentStatus = quote.status || 'published';
                  
                  return (
                    <motion.div
                      key={quote.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            currentStatus === 'published' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            currentStatus === 'draft' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                            'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                          </span>
                          {quote.category && (
                            <span className="text-xs text-indigo-300 uppercase tracking-wider font-semibold">
                              {quote.category}
                            </span>
                          )}
                        </div>
                        <p className="text-lg text-white mb-2">"{quote.text}"</p>
                        <p className="text-indigo-300 text-sm">— {quote.author}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {currentStatus !== 'published' && (
                          <button
                            onClick={() => handleStatusChange(quote.id, 'published')}
                            className="px-3 py-2 bg-green-500/20 hover:bg-green-500/40 text-green-400 hover:text-white rounded-lg transition-all text-sm font-medium"
                            title="Approve & Publish"
                          >
                            Approve
                          </button>
                        )}
                        {currentStatus !== 'rejected' && (
                          <button
                            onClick={() => handleStatusChange(quote.id, 'rejected')}
                            className="px-3 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-white rounded-lg transition-all text-sm font-medium"
                            title="Reject"
                          >
                            Reject
                          </button>
                        )}
                        <button
                          onClick={() => handleEditClick(quote)}
                          className="flex items-center space-x-2 bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 hover:text-white px-4 py-2 rounded-lg transition-all whitespace-nowrap"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setDeletingQuoteId(quote.id)}
                          className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition-all"
                          title="Delete Quote"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
                
                {filteredAndSortedQuotes.length === 0 && !loading && (
                  <div className="text-center py-12 bg-white/5 border border-white/10 rounded-2xl">
                    <p className="text-gray-400">No quotes found for the selected filters.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'broadcast-announcement' && (
            <motion.div
              key="broadcast-announcement"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-sm"
            >
              <h2 className="text-xl font-semibold mb-6 flex items-center">
                <Bell className="w-5 h-5 mr-2 text-purple-400" />
                Broadcast System Announcement
              </h2>

              <form onSubmit={handleBroadcastNotification} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Announcement Title
                    </label>
                    <input
                      type="text"
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      required
                      placeholder="e.g., App Update, Maintenance"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Message
                    </label>
                    <input
                      type="text"
                      value={notifMessage}
                      onChange={(e) => setNotifMessage(e.target.value)}
                      required
                      placeholder="What do you want to tell everyone?"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={notifLoading || !notifTitle.trim()}
                    className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {notifLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>Broadcast</span>
                        <Bell className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activeTab === 'manage-users' && (
            <motion.div
              key="manage-users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h3 className="text-xl font-semibold mb-6 flex items-center">
                <Users className="w-5 h-5 mr-2 text-indigo-400" />
                Manage Users
              </h3>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-black/20 border-b border-white/10">
                        <th className="p-4 text-indigo-300 font-medium text-sm">Email</th>
                        <th className="p-4 text-indigo-300 font-medium text-sm">Joined</th>
                        <th className="p-4 text-indigo-300 font-medium text-sm">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 text-white text-sm">{user.email}</td>
                          <td className="p-4 text-gray-400 text-sm">
                            {user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : 'Unknown'}
                          </td>
                          <td className="p-4">
                            <select
                              value={user.role}
                              onChange={(e) => handleRoleChange(user.id, e.target.value)}
                              disabled={user.email?.toLowerCase() === 'amanuelyohannes929@gmail.com'}
                              className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value="user" className="bg-gray-900">User</option>
                              <option value="admin" className="bg-gray-900">Admin</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-gray-400">
                            No users found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation Bar */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl">
          <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl flex items-center justify-between gap-1">
            <button
              onClick={() => setActiveTab('broadcast-quote')}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                activeTab === 'broadcast-quote' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Send className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Broadcast</span>
            </button>
            <button
              onClick={() => setActiveTab('manage-quotes')}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                activeTab === 'manage-quotes' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Quote className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Quotes</span>
            </button>
            <button
              onClick={() => setActiveTab('broadcast-announcement')}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                activeTab === 'broadcast-announcement' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Bell className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">System</span>
            </button>
            <button
              onClick={() => setActiveTab('manage-users')}
              className={`flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all ${
                activeTab === 'manage-users' ? 'bg-indigo-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Users className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-bold uppercase tracking-tighter">Users</span>
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingQuote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-gray-900 border border-white/20 rounded-3xl p-6 md:p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center">
                  <Edit2 className="w-5 h-5 mr-2 text-indigo-400" />
                  Edit Quote
                </h3>
                <button
                  onClick={() => setEditingQuote(null)}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleUpdateQuote} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Motivational Speech
                  </label>
                  <textarea
                    value={editQuoteText}
                    onChange={(e) => setEditQuoteText(e.target.value)}
                    required
                    rows={4}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Author Name
                    </label>
                    <input
                      type="text"
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      required
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Category (Optional)
                    </label>
                    <input
                      type="text"
                      list="categories"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      placeholder="e.g., Leadership, Life, Success"
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="published" className="bg-gray-900">Published</option>
                      <option value="draft" className="bg-gray-900">Draft</option>
                      <option value="rejected" className="bg-gray-900">Rejected</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditingQuote(null)}
                    className="px-6 py-3 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editLoading || !editQuoteText.trim()}
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-all flex items-center space-x-2 disabled:opacity-50"
                  >
                    {editLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <span>Save Changes</span>
                        <Save className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingQuoteId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-red-500">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Delete Quote?</h3>
              <p className="text-gray-400 mb-8">
                Are you sure you want to remove this quote? This action cannot be undone and it will be removed for all users.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setDeletingQuoteId(null)}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteQuote}
                  disabled={isDeleting}
                  className="flex-1 px-6 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all shadow-lg shadow-red-600/20 flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Trash2 size={18} />
                      <span>Delete Now</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
