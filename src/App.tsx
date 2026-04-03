import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { UserDashboard } from './components/UserDashboard';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';

const ADMIN_EMAIL = 'Amanuelyohannes929@gmail.com'.toLowerCase();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Check if the logged-in user is the specific admin email
  const isAdmin = user.email?.toLowerCase() === ADMIN_EMAIL;

  return (
    <>
      <Toaster 
        position="top-center" 
        richColors 
        theme="dark"
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
          },
        }}
      />
      {isAdmin ? <AdminDashboard /> : <UserDashboard />}
    </>
  );
}

