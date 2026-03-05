import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import twilio from 'twilio';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

const db = new Database('app.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    password_hash TEXT,
    name TEXT,
    phone TEXT,
    avatar_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    subscription_end_date DATETIME,
    subscription_type TEXT
  );
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS quizzes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    folder_id TEXT,
    title TEXT,
    data TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(folder_id) REFERENCES folders(id)
  );
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id TEXT,
    student_name TEXT,
    center_name TEXT,
    parent_phone TEXT,
    score INTEGER,
    total INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS subscription_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    plan TEXT,
    screenshot_data TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Add columns if they don't exist (for migration)
try { db.exec('ALTER TABLE quizzes ADD COLUMN user_id TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE quizzes ADD COLUMN folder_id TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE results ADD COLUMN parent_phone TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN name TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN avatar_data TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN subject TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"'); } catch (e) {}

// Set super admin
try {
  const superAdminEmail = 'gergesnabil101@gmail.com';
  db.prepare('UPDATE users SET role = "admin" WHERE email = ?').run(superAdminEmail);
} catch (e) {}

// Helper to check if user has active access
function hasActiveAccess(user: any) {
  const now = new Date();
  const createdAt = new Date(user.created_at);
  const trialEnd = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
  
  if (now <= trialEnd) return true; // Trial is active
  
  if (user.subscription_end_date) {
    const subEnd = new Date(user.subscription_end_date);
    if (now <= subEnd) return true; // Subscription is active
  }
  
  return false;
}

// Auth Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe webhook needs raw body
  app.post('/api/stripe/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    
    try {
      // For MVP, we'll just handle the checkout.session.completed event
      // In a real app, you'd verify the webhook signature
      const event = JSON.parse(req.body.toString());
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id;
        
        if (userId) {
          // Add 30 days for monthly, 365 for yearly
          const days = session.amount_total > 5000 ? 365 : 30; // Rough guess based on amount if we don't have metadata
          const subType = days === 365 ? 'yearly' : 'monthly';
          
          const stmt = db.prepare(`
            UPDATE users 
            SET subscription_end_date = datetime('now', '+${days} days'),
                subscription_type = ?
            WHERE id = ?
          `);
          stmt.run(subType, userId);
        }
      }
      res.json({received: true});
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  app.use(express.json({ limit: '10mb' }));

  // --- Auth Routes ---
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, name, subject, generateAvatar, avatarData: uploadedAvatarData } = req.body;
      if (!email || !password || !name) return res.status(400).json({ error: 'الاسم، البريد الإلكتروني، وكلمة المرور مطلوبة' });
      
      const hashedPassword = await bcrypt.hash(password, 10);
      const id = crypto.randomUUID();
      
      // Handle Avatar: Priority to uploaded, then AI generated
      let avatarData = uploadedAvatarData || '';
      
      if (!avatarData && generateAvatar && subject) {
        try {
          if (process.env.GEMINI_API_KEY) {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: {
                parts: [
                  {
                    text: `A professional, friendly, and attractive 3D cartoon style avatar of a teacher named ${name} who teaches ${subject}. The image should include subtle elements related to ${subject}. Clean background, high quality, vibrant colors.`,
                  },
                ],
              },
              config: {
                imageConfig: {
                  aspectRatio: "1:1",
                  imageSize: "512px"
                }
              }
            });
            
            for (const part of response.candidates?.[0]?.content?.parts || []) {
              if (part.inlineData) {
                avatarData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
              }
            }
          }
        } catch (aiError) {
          console.error("Failed to generate avatar:", aiError);
        }
      }
      
      const stmt = db.prepare('INSERT INTO users (id, email, password_hash, name, subject, avatar_data) VALUES (?, ?, ?, ?, ?, ?)');
      stmt.run(id, email, hashedPassword, name, subject || '', avatarData);
      
      const token = jwt.sign({ id, email }, JWT_SECRET);
      res.json({ token });
    } catch (e: any) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
      } else {
        res.status(500).json({ error: 'خطأ في الخادم' });
      }
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
      const user = stmt.get(email) as any;
      
      if (!user) return res.status(400).json({ error: 'Invalid credentials' });
      
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });
      
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
      res.json({ token });
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/auth/me', authenticateToken, (req: any, res: any) => {
    const stmt = db.prepare('SELECT id, email, name, subject, avatar_data, created_at, subscription_end_date, subscription_type, role FROM users WHERE id = ?');
    const user = stmt.get(req.user.id) as any;
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const now = new Date();
    const createdAt = new Date(user.created_at);
    const trialEnd = new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
    
    const isTrialActive = now <= trialEnd;
    const isSubActive = user.subscription_end_date ? now <= new Date(user.subscription_end_date) : false;
    
    // Check for pending subscription requests
    const pendingReqStmt = db.prepare('SELECT status FROM subscription_requests WHERE user_id = ? AND status = \'pending\'');
    const pendingRequest = pendingReqStmt.get(req.user.id);

    res.json({
      ...user,
      hasAccess: isTrialActive || isSubActive,
      isTrialActive,
      trialDaysLeft: isTrialActive ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0,
      hasPendingSubscription: !!pendingRequest
    });
  });

  // --- Manual Subscription Routes ---
  app.post('/api/subscriptions/request', authenticateToken, (req: any, res: any) => {
    const { plan, screenshot } = req.body;
    if (!plan || !screenshot) return res.status(400).json({ error: 'Plan and screenshot are required' });
    
    const id = crypto.randomUUID();
    const stmt = db.prepare('INSERT INTO subscription_requests (id, user_id, plan, screenshot_data) VALUES (?, ?, ?, ?)');
    stmt.run(id, req.user.id, plan, screenshot);
    res.json({ success: true });
  });

  // Admin: View all subscription requests
  app.get('/api/admin/subscriptions', authenticateToken, (req: any, res: any) => {
    const userStmt = db.prepare('SELECT role FROM users WHERE id = ?');
    const user = userStmt.get(req.user.id) as any;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    
    const stmt = db.prepare(`
      SELECT sr.*, u.email, u.name 
      FROM subscription_requests sr 
      JOIN users u ON sr.user_id = u.id 
      WHERE sr.status = 'pending'
      ORDER BY sr.created_at DESC
    `);
    const requests = stmt.all();
    res.json(requests);
  });

  // Admin: Approve subscription request
  app.post('/api/admin/subscriptions/approve', authenticateToken, (req: any, res: any) => {
    const userStmt = db.prepare('SELECT role FROM users WHERE id = ?');
    const user = userStmt.get(req.user.id) as any;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    
    const { requestId } = req.body;
    const reqStmt = db.prepare('SELECT * FROM subscription_requests WHERE id = ?');
    const subRequest = reqStmt.get(requestId) as any;
    
    if (!subRequest) return res.status(404).json({ error: 'Request not found' });
    
    const days = subRequest.plan === 'yearly' ? 365 : 30;
    
    db.transaction(() => {
      // Update request status
      db.prepare('UPDATE subscription_requests SET status = "approved" WHERE id = ?').run(requestId);
      
      // Update user subscription
      db.prepare(`
        UPDATE users 
        SET subscription_end_date = datetime('now', '+${days} days'),
            subscription_type = ?
        WHERE id = ?
      `).run(subRequest.plan, subRequest.user_id);
    })();
    
    res.json({ success: true });
  });

  // --- Stripe Routes ---
  app.post('/api/stripe/create-checkout', authenticateToken, async (req: any, res: any) => {
    const { plan } = req.body; // 'monthly' or 'yearly'
    
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables.' });
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
      
      if (!priceId) {
        return res.status(500).json({ error: `Price ID for ${plan} plan is not configured.` });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.APP_URL || 'http://localhost:3000'}?payment=success`,
        cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}?payment=cancelled`,
        client_reference_id: req.user.id,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Folders Management ---
  app.get('/api/folders', authenticateToken, (req: any, res: any) => {
    const stmt = db.prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC');
    const folders = stmt.all(req.user.id);
    res.json(folders);
  });

  app.post('/api/folders', authenticateToken, (req: any, res: any) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Folder name is required' });
    
    const id = crypto.randomUUID();
    const stmt = db.prepare('INSERT INTO folders (id, user_id, name) VALUES (?, ?, ?)');
    stmt.run(id, req.user.id, name);
    res.json({ id, name });
  });

  app.delete('/api/folders/:id', authenticateToken, (req: any, res: any) => {
    // First, set folder_id to null for all quizzes in this folder
    const updateStmt = db.prepare('UPDATE quizzes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?');
    updateStmt.run(req.params.id, req.user.id);
    
    // Then delete the folder
    const deleteStmt = db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?');
    deleteStmt.run(req.params.id, req.user.id);
    res.json({ success: true });
  });

  app.get('/api/user/quizzes', authenticateToken, (req: any, res: any) => {
    const stmt = db.prepare('SELECT id, title, folder_id FROM quizzes WHERE user_id = ? ORDER BY id DESC');
    const quizzes = stmt.all(req.user.id);
    res.json(quizzes);
  });

  app.delete('/api/quizzes/:id', authenticateToken, (req: any, res: any) => {
    // Delete results first
    const deleteResultsStmt = db.prepare('DELETE FROM results WHERE quiz_id = ?');
    deleteResultsStmt.run(req.params.id);
    
    // Delete quiz
    const deleteQuizStmt = db.prepare('DELETE FROM quizzes WHERE id = ? AND user_id = ?');
    deleteQuizStmt.run(req.params.id, req.user.id);
    res.json({ success: true });
  });

  // --- Quiz Routes ---
  app.post('/api/quizzes', authenticateToken, (req: any, res: any) => {
    const stmtUser = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmtUser.get(req.user.id);
    
    if (!hasActiveAccess(user)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    const { id, title, data, folder_id } = req.body;

    // Enforce 3 quiz limit for trial users
    if (user.subscription_type !== 'monthly' && user.subscription_type !== 'yearly') {
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM quizzes WHERE user_id = ?');
      const { count } = countStmt.get(req.user.id) as any;
      
      const existingQuizStmt = db.prepare('SELECT id FROM quizzes WHERE id = ? AND user_id = ?');
      const existingQuiz = existingQuizStmt.get(id, req.user.id);
      
      if (!existingQuiz && count >= 3) {
        return res.status(403).json({ error: 'لقد وصلت للحد الأقصى (3 اختبارات) في النسخة التجريبية. يرجى الاشتراك للمتابعة.' });
      }
    }

    const stmt = db.prepare('INSERT OR REPLACE INTO quizzes (id, user_id, folder_id, title, data) VALUES (?, ?, ?, ?, ?)');
    stmt.run(id, req.user.id, folder_id || null, title, data);
    res.json({ success: true });
  });

  // Public route for students to take the quiz
  app.get('/api/quizzes/:id', (req, res) => {
    const stmt = db.prepare(`
      SELECT q.*, u.name as teacher_name, u.subject as teacher_subject, u.avatar_data as teacher_avatar 
      FROM quizzes q 
      LEFT JOIN users u ON q.user_id = u.id 
      WHERE q.id = ?
    `);
    const quiz = stmt.get(req.params.id);
    if (quiz) {
      res.json(quiz);
    } else {
      res.status(404).json({ error: 'Quiz not found' });
    }
  });

  // Public route for students to submit results
  app.post('/api/quizzes/:id/results', async (req, res) => {
    const { student_name, center_name, parent_phone, score, total } = req.body;
    
    // Check trial limits for students
    const quizStmt = db.prepare('SELECT user_id, title FROM quizzes WHERE id = ?');
    const quiz = quizStmt.get(req.params.id) as any;
    
    if (quiz) {
      const userStmt = db.prepare('SELECT subscription_type FROM users WHERE id = ?');
      const user = userStmt.get(quiz.user_id) as any;
      
      if (user && user.subscription_type !== 'monthly' && user.subscription_type !== 'yearly') {
        const resultsCountStmt = db.prepare('SELECT COUNT(*) as count FROM results WHERE quiz_id = ?');
        const { count } = resultsCountStmt.get(req.params.id) as any;
        
        if (count >= 5) {
          return res.status(403).json({ error: 'عذراً، لقد وصل هذا الاختبار للحد الأقصى من الطلاب (5 طلاب) في النسخة التجريبية للمعلم.' });
        }
      }
    }
    
    // Save result
    const stmt = db.prepare('INSERT INTO results (quiz_id, student_name, center_name, parent_phone, score, total) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(req.params.id, student_name, center_name, parent_phone || '', score, total);
    
    // Fetch history for this student
    const historyStmt = db.prepare('SELECT score, total, created_at FROM results WHERE student_name = ? AND center_name = ? ORDER BY created_at ASC');
    const history = historyStmt.all(student_name, center_name) as any[];
    
    let aiMessage = 'تم تسجيل نتيجتك بنجاح!';
    
    try {
      if (history.length > 1) {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const prompt = `أنت معلم خبير. هذا هو سجل درجات الطالب "${student_name}" في الاختبارات السابقة بالترتيب الزمني:
${history.map((h, i) => `الاختبار ${i + 1}: ${h.score} من ${h.total}`).join('\n')}

قم بتحليل مستوى الطالب في سطرين أو ثلاثة كحد أقصى باللغة العربية، وأخبره بوضوح هل مستواه يتحسن، يتراجع، أم يحافظ على مستواه، مع تقديم نصيحة تشجيعية قصيرة. تحدث مع الطالب مباشرة.`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        aiMessage = response.text || aiMessage;
      } else {
        aiMessage = 'هذا هو أول اختبار لك معنا! بداية موفقة، استمر في بذل الجهد وسنتابع تطور مستواك في الاختبارات القادمة.';
      }
    } catch (e) {
      console.error("AI Error:", e);
    }

    let whatsappStatus = 'none';
    // Automatically send WhatsApp message to parent if phone is provided
    if (parent_phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio sandbox number
        
        // Format phone number (assume Egypt +20 if starts with 01)
        let formattedPhone = parent_phone.replace(/\D/g, '');
        if (formattedPhone.startsWith('01')) {
          formattedPhone = '+20' + formattedPhone.substring(1);
        } else if (!formattedPhone.startsWith('+')) {
          formattedPhone = '+' + formattedPhone;
        }

        const quizStmt = db.prepare('SELECT title FROM quizzes WHERE id = ?');
        const quiz = quizStmt.get(req.params.id) as any;
        const quizTitle = quiz ? quiz.title : 'الاختبار';

        await client.messages.create({
          body: `مرحباً، نتيجة الطالب ${student_name} في اختبار "${quizTitle}" هي ${score} من ${total}.\n\nتحليل المستوى:\n${aiMessage}`,
          from: fromNumber,
          to: `whatsapp:${formattedPhone}`
        });
        console.log('WhatsApp message sent automatically to', formattedPhone);
        whatsappStatus = 'sent';
      } catch (twError) {
        console.error('Twilio Error:', twError);
        whatsappStatus = 'error';
      }
    }

    res.json({ success: true, aiMessage, whatsappStatus });
  });

  // Protected route for teachers to view results
  app.get('/api/quizzes/:id/results', authenticateToken, (req: any, res: any) => {
    const stmtUser = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmtUser.get(req.user.id);
    
    if (!hasActiveAccess(user)) {
      return res.status(403).json({ error: 'Subscription required' });
    }

    // Verify ownership
    const stmtQuiz = db.prepare('SELECT user_id FROM quizzes WHERE id = ?');
    const quiz = stmtQuiz.get(req.params.id) as any;
    
    if (quiz && quiz.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const stmt = db.prepare('SELECT * FROM results WHERE quiz_id = ? ORDER BY center_name ASC, student_name ASC');
    const results = stmt.all(req.params.id);
    res.json(results);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
