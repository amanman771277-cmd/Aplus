import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('Firebase Admin initialized');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
    }
  }

  app.use(express.json());

  // API Route to send notifications
  app.post('/api/send-notification', async (req, res) => {
    const { title, message, userId } = req.body;

    if (!admin.apps.length) {
      return res.status(500).json({ error: 'Firebase Admin not initialized' });
    }

    try {
      const db = admin.firestore();
      let tokens: string[] = [];

      if (userId) {
        // Fetch tokens only for the specific user
        const tokensSnapshot = await db.collection('users').doc(userId).collection('fcm_tokens').get();
        tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      } else {
        // Fetch all tokens from all users
        const tokensSnapshot = await db.collectionGroup('fcm_tokens').get();
        tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      }

      if (tokens.length === 0) {
        return res.json({ success: true, message: 'No tokens found' });
      }

      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
          title,
          body: message,
        },
      });

      res.json({ success: true, response });
    } catch (error) {
      console.error('Error sending notification:', error);
      res.status(500).json({ error: 'Failed to send notification' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
