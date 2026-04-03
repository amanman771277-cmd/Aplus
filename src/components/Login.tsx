import React, { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { motion } from 'framer-motion';
import { Zap, Loader2 } from 'lucide-react';

export function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if user document exists, if not create it
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        try {
          const isAdmin = user.email?.toLowerCase() === 'amanuelyohannes929@gmail.com';
          await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            role: isAdmin ? 'admin' : 'user',
            createdAt: new Date()
          });
        } catch (firestoreError) {
          console.error("Error creating user doc:", firestoreError);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-black p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl"
      >
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 via-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Zap className="text-white w-8 h-8 -rotate-12 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          </div>
        </div>
        
        <h2 className="text-3xl font-bold text-center text-white mb-2">
          Aplus
        </h2>
        <p className="text-indigo-200 text-center mb-8">
          Your daily spark of inspiration
        </p>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-xl text-sm mb-6 text-center flex flex-col items-center space-y-3">
            <p>
              {error.includes('network-request-failed') 
                ? `Network Error: This usually happens because the browser is blocking the login popup inside this preview window.`
                : error}
            </p>
            {error.includes('network-request-failed') && (
              <button
                onClick={() => window.open(window.location.href, '_blank')}
                className="bg-white text-red-600 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-red-50 transition-colors"
              >
                Open App in New Tab to Login
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white text-gray-900 hover:bg-gray-100 font-semibold py-3.5 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-3 disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}
