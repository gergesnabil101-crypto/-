import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { PlusCircle, Trash2, CheckCircle2, XCircle, FileText, User, Play, Share2, QrCode, Download, Copy, X, Users, LogOut, Lock, CreditCard, Save, FileUp, Loader2, Sparkles, Upload, CheckCircle, MessageCircle } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { GoogleGenAI, Type } from "@google/genai";

type Question = {
  id: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
};

type Quiz = {
  id: string;
  title: string;
  folder_id?: string;
  questions: Question[];
  showCorrectAnswers?: boolean;
};

type Folder = {
  id: string;
  name: string;
};

type TeacherInfo = {
  name: string;
  subject: string;
  avatar_data: string;
};

export default function App() {
  const [mode, setMode] = useState<'dashboard' | 'build' | 'take-intro' | 'take' | 'results'>('dashboard');
  const [quiz, setQuiz] = useState<Quiz>({
    id: crypto.randomUUID(),
    title: 'اختبار جديد',
    questions: [
      {
        id: crypto.randomUUID(),
        text: '',
        options: ['', ''],
        correctOptionIndex: 0,
      },
    ],
  });
  const [studentAnswers, setStudentAnswers] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  
  const [studentName, setStudentName] = useState('');
  const [centerName, setCenterName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [whatsappError, setWhatsappError] = useState(false);
  const [teacherResults, setTeacherResults] = useState<any[]>([]);
  const [showResultsModal, setShowResultsModal] = useState(false);

  // Auth & Subscription State
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authSubject, setAuthSubject] = useState('');
  const [generateAvatar, setGenerateAvatar] = useState(false);
  const [authAvatarData, setAuthAvatarData] = useState<string | null>(null);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Dashboard State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [teacherInfo, setTeacherInfo] = useState<TeacherInfo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDashboardData = async (authToken: string) => {
    try {
      const [foldersRes, quizzesRes] = await Promise.all([
        fetch('/api/folders', { headers: { 'Authorization': `Bearer ${authToken}` } }),
        fetch('/api/user/quizzes', { headers: { 'Authorization': `Bearer ${authToken}` } })
      ]);
      
      if (foldersRes.ok && quizzesRes.ok) {
        const foldersData = await foldersRes.json();
        const quizzesData = await quizzesRes.json();
        setFolders(foldersData);
        setQuizzes(quizzesData);
      }
    } catch (e) {
      console.error("Failed to fetch dashboard data", e);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const q = params.get('q');
    const payment = params.get('payment');
    
    if (payment === 'success') {
      alert('تم الاشتراك بنجاح! شكراً لك.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (id) {
      fetch(`/api/quizzes/${id}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.data) {
            setQuiz(JSON.parse(data.data));
            if (data.teacher_name) {
              setTeacherInfo({
                name: data.teacher_name,
                subject: data.teacher_subject,
                avatar_data: data.teacher_avatar
              });
            }
            setMode('take-intro');
            setIsShared(true);
          }
          setIsLoading(false);
        })
        .catch(e => {
          console.error("Failed to fetch quiz", e);
          setIsLoading(false);
        });
    } else if (q) {
      try {
        const decodedQuiz = JSON.parse(decodeURIComponent(atob(q)));
        setQuiz(decodedQuiz);
        setMode('take-intro');
        setIsShared(true);
      } catch (e) {
        console.error("Failed to parse quiz from URL", e);
      }
      setIsLoading(false);
    } else {
      // Teacher mode
      if (token) {
        fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => {
          if (!res.ok) throw new Error('Invalid token');
          return res.json();
        })
        .then(data => {
          setUser(data);
          fetchDashboardData(token);
          setIsLoading(false);
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
          setAuthMode('login');
          setIsLoading(false);
        });
      } else {
        setAuthMode('login');
        setIsLoading(false);
      }
    }
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const payload: any = { email: authEmail, password: authPassword };
      if (authMode === 'register') {
        payload.name = authName;
        payload.subject = authSubject;
        payload.generateAvatar = generateAvatar;
        if (authAvatarData) {
          payload.avatarData = authAvatarData;
        }
      }
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'حدث خطأ');
      
      setToken(data.token);
      localStorage.setItem('token', data.token);
      setAuthMode(null);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim() || !token) return;
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: newFolderName })
      });
      if (res.ok) {
        const newFolder = await res.json();
        setFolders([newFolder, ...folders]);
        setNewFolderName('');
      }
    } catch (e) {
      console.error("Failed to create folder", e);
    }
  };

  const createNewQuiz = (folderId?: string) => {
    setQuiz({
      id: crypto.randomUUID(),
      title: 'اختبار جديد',
      folder_id: folderId,
      showCorrectAnswers: true,
      questions: [
        {
          id: crypto.randomUUID(),
          text: '',
          options: ['', ''],
          correctOptionIndex: 0,
        },
      ],
    });
    setMode('build');
  };

  const editQuiz = async (quizId: string) => {
    try {
      const res = await fetch(`/api/quizzes/${quizId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.data) {
          setQuiz(JSON.parse(data.data));
          setMode('build');
        }
      }
    } catch (e) {
      console.error("Failed to fetch quiz for editing", e);
    }
  };

  const deleteQuiz = async (quizId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاختبار؟ سيتم حذف جميع نتائجه أيضاً.')) return;
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setQuizzes(quizzes.filter(q => q.id !== quizId));
      }
    } catch (e) {
      console.error("Failed to delete quiz", e);
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المجلد؟ لن يتم حذف الاختبارات بداخله، بل ستصبح بدون مجلد.')) return;
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFolders(folders.filter(f => f.id !== folderId));
        setQuizzes(quizzes.map(q => q.folder_id === folderId ? { ...q, folder_id: null } : q));
      }
    } catch (e) {
      console.error("Failed to delete folder", e);
    }
  };

  const sendToWhatsApp = (result?: any) => {
    const targetQuizTitle = result ? quiz.title : quiz.title;
    const targetStudent = result ? result.student_name : studentName;
    const targetPhone = result ? result.parent_phone : parentPhone;
    const targetCenter = result ? result.center_name : centerName;
    const targetScore = result ? result.score : calculateScore();
    const targetTotal = result ? result.total : quiz.questions.length;

    if (!targetQuizTitle || !targetStudent || !targetPhone) return;
    
    const percentage = (targetScore / targetTotal) * 100;
    
    let level = '';
    if (percentage >= 90) level = 'ممتاز 🌟';
    else if (percentage >= 75) level = 'جيد جداً 👍';
    else if (percentage >= 60) level = 'جيد 🙂';
    else if (percentage >= 50) level = 'مقبول 😐';
    else level = 'ضعيف (يحتاج لمراجعة) ⚠️';

    const message = `*نتيجة اختبار الطالب*\n\n` +
      `👤 *الطالب:* ${targetStudent}\n` +
      `📝 *الاختبار:* ${targetQuizTitle}\n` +
      `🏫 *السنتر:* ${targetCenter}\n` +
      `📊 *الدرجة:* ${targetScore} من ${targetTotal}\n` +
      `📈 *المستوى:* ${level}\n\n` +
      `_تم التصحيح بواسطة مصحح الواجبات الذكي_ ✨`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${targetPhone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    setAuthMode('login');
  };

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly' | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<string | null>(null);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const handleManualPayment = async () => {
    if (!paymentScreenshot || !selectedPlan) {
      alert('الرجاء رفع صورة التحويل أولاً');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const res = await fetch('/api/subscriptions/request', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: selectedPlan,
          screenshot: paymentScreenshot,
          date: new Date().toISOString()
        })
      });

      if (res.ok) {
        alert('تم إرسال طلب الاشتراك بنجاح. سيتم تفعيل حسابك خلال 24 ساعة بعد مراجعة التحويل.');
        setShowPaymentModal(false);
        setPaymentScreenshot(null);
      } else {
        throw new Error('فشل إرسال الطلب');
      }
    } catch (err) {
      alert('حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubscribe = (plan: 'monthly' | 'yearly') => {
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const [adminRequests, setAdminRequests] = useState<any[]>([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const fetchAdminData = async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await fetch('/api/admin/subscriptions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAdminRequests(data);
    } catch (e) {
      console.error("Failed to fetch admin data", e);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin' && showAdminPanel) {
      fetchAdminData();
    }
  }, [user, showAdminPanel]);

  const approveRequest = async (requestId: string) => {
    try {
      const res = await fetch('/api/admin/subscriptions/approve', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      if (res.ok) {
        alert('تم تفعيل الاشتراك بنجاح');
        fetchAdminData();
      }
    } catch (e) {
      alert('حدث خطأ أثناء التفعيل');
    }
  };

  const shareQuiz = async () => {
    if (!user?.hasAccess) return;
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: quiz.id,
          title: quiz.title,
          folder_id: quiz.folder_id,
          data: JSON.stringify(quiz)
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      if (token) {
        fetchDashboardData(token);
      }
      
      const url = `${window.location.origin}${window.location.pathname}?id=${quiz.id}`;
      setShareUrl(url);
      setShowShareModal(true);
    } catch (e: any) {
      console.error("Failed to save quiz", e);
      alert(e.message || 'حدث خطأ أثناء حفظ الاختبار. يرجى التأكد من اشتراكك.');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const downloadQRCode = () => {
    const canvas = document.getElementById('qr-code-canvas') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
      let downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${quiz.title || 'quiz'}-QR.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const addQuestion = () => {
    setQuiz({
      ...quiz,
      questions: [
        ...quiz.questions,
        {
          id: crypto.randomUUID(),
          text: '',
          options: ['', ''],
          correctOptionIndex: 0,
        },
      ],
    });
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('الرجاء اختيار ملف PDF فقط');
      return;
    }

    setIsGenerating(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = (event.target?.result as string).split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64Data
              }
            },
            {
              text: "قم بتحويل هذا الملف إلى مجموعة من الأسئلة لاختبار. استخرج الأسئلة والخيارات والإجابة الصحيحة لكل سؤال. إذا كانت الإجابة الصحيحة محددة في الملف (مثلاً بخط عريض أو علامة أو لون مختلف أو تحتها خط)، فقم باستخراجها بدقة كإجابة صحيحة. أرجع النتيجة بتنسيق JSON فقط كقائمة من الكائنات، كل كائن يحتوي على 'text' (نص السؤال)، 'options' (قائمة من 4 خيارات)، و 'correctOptionIndex' (رقم الإجابة الصحيحة يبدأ من 0). تأكد من أن اللغة هي العربية."
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  correctOptionIndex: { type: Type.INTEGER }
                },
                required: ["text", "options", "correctOptionIndex"]
              }
            }
          }
        });

        const generatedQuestions = JSON.parse(response.text || '[]');
        if (generatedQuestions.length > 0) {
          const formattedQuestions = generatedQuestions.map((q: any) => ({
            id: crypto.randomUUID(),
            text: q.text,
            options: q.options,
            correctOptionIndex: q.correctOptionIndex
          }));
          
          setQuiz(prev => ({
            ...prev,
            questions: [...prev.questions, ...formattedQuestions].filter(q => q.text !== '')
          }));
        }
        setIsGenerating(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("AI Generation Error:", error);
      alert('حدث خطأ أثناء معالجة الملف. الرجاء المحاولة مرة أخرى.');
      setIsGenerating(false);
    }
  };

  const updateQuestionText = (id: string, text: string) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((q) => (q.id === id ? { ...q, text } : q)),
    });
  };

  const addOption = (questionId: string) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, ''] } : q
      ),
    });
  };

  const updateOptionText = (questionId: string, optionIndex: number, text: string) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt, idx) => (idx === optionIndex ? text : opt)),
            }
          : q
      ),
    });
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((q) => {
        if (q.id === questionId) {
          const newOptions = q.options.filter((_, idx) => idx !== optionIndex);
          let newCorrectIndex = q.correctOptionIndex;
          if (newCorrectIndex === optionIndex) {
            newCorrectIndex = 0;
          } else if (newCorrectIndex > optionIndex) {
            newCorrectIndex -= 1;
          }
          return { ...q, options: newOptions, correctOptionIndex: newCorrectIndex };
        }
        return q;
      }),
    });
  };

  const setCorrectOption = (questionId: string, optionIndex: number) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.map((q) =>
        q.id === questionId ? { ...q, correctOptionIndex: optionIndex } : q
      ),
    });
  };

  const removeQuestion = (id: string) => {
    setQuiz({
      ...quiz,
      questions: quiz.questions.filter((q) => q.id !== id),
    });
  };

  const handleStudentAnswer = (questionId: string, optionIndex: number) => {
    setStudentAnswers({
      ...studentAnswers,
      [questionId]: optionIndex,
    });
  };

  const calculateScore = () => {
    let correct = 0;
    quiz.questions.forEach((q) => {
      if (studentAnswers[q.id] === q.correctOptionIndex) {
        correct += 1;
      }
    });
    return correct;
  };

  const submitQuiz = async () => {
    const score = calculateScore();
    setMode('results');
    setAiMessage('جاري تحليل مستواك...');
    
    if (studentName && centerName && (isShared || quiz.id)) {
      try {
        const res = await fetch(`/api/quizzes/${quiz.id}/results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_name: studentName,
            center_name: centerName,
            parent_phone: parentPhone,
            score: score,
            total: quiz.questions.length
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.aiMessage) {
            setAiMessage(data.aiMessage);
          }
          if (data.whatsappStatus === 'sent') {
            setWhatsappSent(true);
          } else if (data.whatsappStatus === 'error') {
            setWhatsappError(true);
            sendToWhatsApp(); // Fallback to manual if automatic fails
          } else {
            // If no automatic sending configured, trigger manual automatically
            sendToWhatsApp();
          }
        } else if (res.status === 403) {
          const data = await res.json();
          setAiMessage(data.error || 'عذراً، لقد وصل هذا الاختبار للحد الأقصى من الطلاب في النسخة التجريبية.');
        } else {
          setAiMessage('حدث خطأ أثناء تسجيل النتيجة.');
        }
      } catch (e) {
        console.error("Failed to save result", e);
        setAiMessage('تم تسجيل نتيجتك بنجاح!');
      }
    } else {
      setAiMessage('تم الانتهاء من الاختبار التجريبي.');
    }
  };

  const fetchResults = async (quizId?: string) => {
    if (!user?.hasAccess) return;
    const targetId = quizId || quiz.id;
    try {
      const res = await fetch(`/api/quizzes/${targetId}/results`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTeacherResults(data);
      setShowResultsModal(true);
    } catch (e) {
      console.error("Failed to fetch results", e);
      alert('حدث خطأ. يرجى التأكد من اشتراكك أو حفظ الاختبار أولاً.');
    }
  };

  const downloadExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    const groupedResults = teacherResults.reduce((acc, result) => {
      const center = result.center_name || 'غير محدد';
      if (!acc[center]) acc[center] = [];
      acc[center].push(result);
      return acc;
    }, {} as Record<string, any[]>);

    Object.entries(groupedResults).forEach(([center, results]) => {
      const worksheetData = (results as any[]).map(r => ({
        'اسم الطالب': r.student_name,
        'السنتر / المجموعة': r.center_name,
        'الدرجة': r.score,
        'الدرجة النهائية': r.total,
        'تاريخ ووقت الاختبار': new Date(r.created_at).toLocaleString('ar-EG')
      }));
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      
      const safeSheetName = center.substring(0, 31).replace(/[\\/*?:\[\]]/g, '_');
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    });

    XLSX.writeFile(workbook, `${quiz.title || 'نتائج_الطلاب'}.xlsx`);
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  }

  // Render Auth Screen
  if (!isShared && authMode) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md animate-in zoom-in-95 duration-300">
          <div className="text-center mb-8">
            <div className="bg-indigo-100 text-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">مصحح الواجبات الذكي</h1>
            <p className="text-slate-500 mt-2">
              {authMode === 'login' ? 'سجل دخولك لإدارة اختباراتك' : 'أنشئ حساباً جديداً للبدء (نسخة تجريبية 7 أيام)'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
                {authError}
              </div>
            )}
            
            {authMode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">المادة الدراسية</label>
                  <input
                    type="text"
                    required
                    value={authSubject}
                    onChange={(e) => setAuthSubject(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="مثال: لغة عربية، رياضيات، فيزياء..."
                  />
                </div>
                <div className="flex flex-col gap-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="genAvatar"
                      checked={generateAvatar}
                      onChange={(e) => {
                        setGenerateAvatar(e.target.checked);
                        if (e.target.checked) setAuthAvatarData(null);
                      }}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="genAvatar" className="text-sm font-medium text-indigo-900 cursor-pointer flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      توليد صورة احترافية بالذكاء الاصطناعي (اختياري)
                    </label>
                  </div>
                  
                  <div className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-700">أو ارفع صورتك الشخصية:</span>
                      {authAvatarData && (
                        <button 
                          type="button"
                          onClick={() => setAuthAvatarData(null)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          حذف الصورة
                        </button>
                      )}
                    </div>
                    <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-100/50 transition-all cursor-pointer overflow-hidden group">
                      {authAvatarData ? (
                        <img src={authAvatarData} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center text-indigo-400 group-hover:text-indigo-600">
                          <Upload size={24} />
                          <span className="text-xs mt-1">اختر صورة</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setAuthAvatarData(event.target?.result as string);
                              setGenerateAvatar(false);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl font-bold shadow-md transition-all mt-4"
            >
              {authMode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
            >
              {authMode === 'login' ? 'ليس لديك حساب؟ أنشئ حساباً جديداً' : 'لديك حساب بالفعل؟ سجل دخولك'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Paywall Screen
  if (!isShared && user && !user.hasAccess) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-900">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-2xl animate-in zoom-in-95 duration-300">
          <div className="text-center mb-8">
            <div className="bg-amber-100 text-amber-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-3xl font-bold text-slate-800">انتهت الفترة التجريبية</h1>
            <p className="text-slate-500 mt-3 text-lg">
              لقد انتهت فترة الـ 14 يوماً التجريبية المجانية. يرجى الاشتراك لمواصلة إنشاء الاختبارات وعرض النتائج.
            </p>
          </div>

          {user.hasPendingSubscription ? (
            <div className="bg-indigo-50 p-8 rounded-3xl border-2 border-indigo-200 text-center space-y-4">
              <div className="bg-indigo-100 text-indigo-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <Loader2 size={32} className="animate-spin" />
              </div>
              <h3 className="text-2xl font-bold text-indigo-900">طلبك قيد المراجعة</h3>
              <p className="text-indigo-700 leading-relaxed">
                لقد استلمنا طلب اشتراكك وصورة التحويل بنجاح. 
                <br />
                يتم الآن مراجعة الطلب من قبل الإدارة، وسيتم تفعيل حسابك خلال أقل من 24 ساعة.
              </p>
              <div className="pt-4">
                <button onClick={() => window.location.reload()} className="text-indigo-600 font-bold hover:underline">تحديث الصفحة</button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              {/* Monthly Plan */}
              <div className="border-2 border-slate-200 rounded-2xl p-6 hover:border-indigo-300 transition-colors flex flex-col">
                <h3 className="text-xl font-bold text-slate-800 mb-2">الاشتراك الشهري</h3>
                <div className="text-3xl font-black text-indigo-600 mb-4">150 ج.م <span className="text-sm text-slate-500 font-normal">/ شهر</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> إنشاء اختبارات غير محدودة</li>
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> عدد طلاب غير محدود</li>
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> تصدير النتائج للإكسل</li>
                </ul>
                <button
                  onClick={() => handleSubscribe('monthly')}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard size={18} />
                  اشترك شهرياً
                </button>
              </div>

              {/* Yearly Plan */}
              <div className="border-2 border-indigo-600 bg-indigo-50/50 rounded-2xl p-6 relative flex flex-col">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                  الأكثر توفيراً
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">الاشتراك السنوي</h3>
                <div className="text-3xl font-black text-indigo-600 mb-4">1500 ج.م <span className="text-sm text-slate-500 font-normal">/ سنة</span></div>
                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> جميع ميزات الخطة الشهرية</li>
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> توفير شهرين مجاناً</li>
                  <li className="flex items-center gap-2 text-slate-600"><CheckCircle2 size={18} className="text-emerald-500" /> دعم فني أولوية</li>
                </ul>
                <button
                  onClick={() => handleSubscribe('yearly')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl font-bold shadow-md transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard size={18} />
                  اشترك سنوياً
                </button>
              </div>
            </div>
          )}
          
          <div className="mt-8 text-center">
            <button onClick={logout} className="text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-2 mx-auto">
              <LogOut size={18} />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <CheckCircle2 size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">مصحح الواجبات الذكي</h1>
            {!isShared && user?.avatar_data && (
              <img 
                src={user.avatar_data} 
                alt={user.name} 
                className="w-8 h-8 rounded-full border border-indigo-200 shadow-sm mr-2"
                referrerPolicy="no-referrer"
              />
            )}
            {!isShared && user?.isTrialActive && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-bold mr-2">
                تجريبي ({user.trialDaysLeft} أيام متبقية)
              </span>
            )}
          </div>
          {!isShared && (
            <div className="flex items-center gap-4">
              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg hidden sm:flex">
                <button
                  onClick={() => setMode('dashboard')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'dashboard' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={16} />
                  لوحة التحكم
                </button>
                <button
                  onClick={() => setMode('build')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode === 'build' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={16} />
                  وضع المعلم
                </button>
                <button
                  onClick={() => {
                    setMode('take-intro');
                    setStudentAnswers({});
                    setStudentName('');
                    setCenterName('');
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    mode.startsWith('take') || mode === 'results' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User size={16} />
                  وضع الطالب
                </button>
              </div>
              <button onClick={logout} className="text-slate-400 hover:text-red-500 transition-colors" title="تسجيل الخروج">
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {mode === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">لوحة التحكم</h2>
              <div className="flex gap-2">
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition-colors flex items-center gap-2"
                  >
                    <Lock size={20} />
                    {showAdminPanel ? 'إغلاق لوحة المسؤول' : 'طلبات الاشتراك'}
                  </button>
                )}
                <button
                  onClick={() => createNewQuiz()}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                  <PlusCircle size={20} />
                  اختبار جديد
                </button>
              </div>
            </div>

            {showAdminPanel && user?.role === 'admin' && (
              <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 animate-in fade-in slide-in-from-top-4 duration-300">
                <h3 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-2">
                  <Users size={24} />
                  طلبات الاشتراك المعلقة ({adminRequests.length})
                </h3>
                {adminRequests.length === 0 ? (
                  <p className="text-amber-700 text-center py-8">لا توجد طلبات معلقة حالياً.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {adminRequests.map((req) => (
                      <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-amber-200">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-slate-800">{req.name}</p>
                            <p className="text-xs text-slate-500">{req.email}</p>
                            <p className="text-xs font-bold text-indigo-600 mt-1">الخطة: {req.plan === 'yearly' ? 'سنوي' : 'شهري'}</p>
                          </div>
                          <button
                            onClick={() => approveRequest(req.id)}
                            className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-emerald-600 transition-colors"
                          >
                            تفعيل الحساب
                          </button>
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-slate-400 mb-1">إيصال الدفع:</p>
                          <img 
                            src={req.screenshot_data} 
                            alt="Payment Proof" 
                            className="w-full h-40 object-cover rounded-lg border border-slate-100 cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(req.screenshot_data, '_blank')}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
              <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                <Sparkles size={20} />
                دليل المبتدئين: كيف تستخدم التطبيق؟
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-right" dir="rtl">
                <div className="space-y-2">
                  <div className="bg-white w-8 h-8 rounded-full flex items-center justify-center text-indigo-600 font-bold shadow-sm">1</div>
                  <h4 className="font-bold text-slate-800">إنشاء الاختبارات</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">اضغط على "اختبار جديد" وابدأ بكتابة أسئلتك، أو استخدم خاصية الذكاء الاصطناعي لرفع ملف PDF وتحويله لأسئلة فوراً.</p>
                </div>
                <div className="space-y-2">
                  <div className="bg-white w-8 h-8 rounded-full flex items-center justify-center text-indigo-600 font-bold shadow-sm">2</div>
                  <h4 className="font-bold text-slate-800">مشاركة الرابط</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">بعد الحفظ، انسخ رابط الاختبار وأرسله لطلابك عبر الواتساب. سيقوم النظام بتصحيح الإجابات تلقائياً.</p>
                </div>
                <div className="space-y-2">
                  <div className="bg-white w-8 h-8 rounded-full flex items-center justify-center text-indigo-600 font-bold shadow-sm">3</div>
                  <h4 className="font-bold text-slate-800">تنزيل التطبيق</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">لفتح التطبيق كبرنامج على الكمبيوتر أو الموبايل: اضغط على "إضافة إلى الشاشة الرئيسية" من إعدادات المتصفح (Chrome/Safari).</p>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
              <h3 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2">
                <MessageCircle size={20} />
                إعدادات الواتساب التلقائي (للمعلمين)
              </h3>
              <div className="space-y-4 text-slate-700">
                <p className="text-sm leading-relaxed">
                  لإرسال النتائج تلقائياً لأولياء الأمور في الخلفية (بدون تدخل الطالب)، يرجى تفعيل حساب <strong>Twilio</strong> وإضافة البيانات التالية في إعدادات البيئة (Environment Variables):
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono bg-white/50 p-4 rounded-xl">
                  <div>TWILIO_ACCOUNT_SID</div>
                  <div>TWILIO_AUTH_TOKEN</div>
                  <div>TWILIO_WHATSAPP_NUMBER</div>
                </div>
                <p className="text-xs text-slate-500 italic">
                  * إذا لم تتوفر هذه البيانات، سيقوم التطبيق بفتح رابط واتساب للطالب ليقوم بالإرسال يدوياً.
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">المجلدات</h3>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="اسم المجلد الجديد..."
                  className="flex-1 p-2 border border-slate-200 rounded-lg focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                />
                <button
                  onClick={createFolder}
                  disabled={!newFolderName.trim()}
                  className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  إضافة مجلد
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {folders.map(folder => (
                  <div key={folder.id} className="border border-slate-200 p-4 rounded-xl hover:border-indigo-300 transition-colors relative group">
                    <button
                      onClick={() => deleteFolder(folder.id)}
                      className="absolute top-2 left-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="حذف المجلد"
                    >
                      <Trash2 size={16} />
                    </button>
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                      <FileText size={18} className="text-indigo-500" />
                      {folder.name}
                    </h4>
                    <div className="text-sm text-slate-500 mb-4">
                      {quizzes.filter(q => q.folder_id === folder.id).length} اختبارات
                    </div>
                    <button
                      onClick={() => createNewQuiz(folder.id)}
                      className="text-indigo-600 text-sm hover:underline flex items-center gap-1"
                    >
                      <PlusCircle size={14} />
                      إضافة اختبار هنا
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">جميع الاختبارات</h3>
              {quizzes.length === 0 ? (
                <p className="text-slate-500 text-center py-8">لا يوجد اختبارات بعد.</p>
              ) : (
                <div className="space-y-3">
                  {quizzes.map(q => (
                    <div key={q.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors">
                      <div>
                        <h4 className="font-bold text-slate-800">{q.title}</h4>
                        <span className="text-xs text-slate-500">
                          {q.folder_id ? folders.find(f => f.id === q.folder_id)?.name || 'مجلد محذوف' : 'بدون مجلد'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setQuiz({ id: q.id, title: q.title, folder_id: q.folder_id, questions: [] });
                            fetchResults(q.id);
                          }}
                          className="text-slate-600 hover:text-indigo-600 p-2 rounded-lg transition-colors"
                          title="النتائج"
                        >
                          <Users size={18} />
                        </button>
                        <button
                          onClick={() => editQuiz(q.id)}
                          className="text-slate-600 hover:text-indigo-600 p-2 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <FileText size={18} />
                        </button>
                        <button
                          onClick={() => deleteQuiz(q.id)}
                          className="text-slate-600 hover:text-red-500 p-2 rounded-lg transition-colors"
                          title="حذف"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'build' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-500 mb-2">عنوان الاختبار</label>
                  <input
                    type="text"
                    value={quiz.title}
                    onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
                    className="w-full text-2xl font-bold border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-600 focus:outline-none transition-colors pb-2 bg-transparent"
                    placeholder="أدخل عنوان الاختبار هنا..."
                  />
                </div>
                <div className="md:w-64">
                  <label className="block text-sm font-medium text-slate-500 mb-2">المجلد</label>
                  <select
                    value={quiz.folder_id || ''}
                    onChange={(e) => setQuiz({ ...quiz, folder_id: e.target.value || undefined })}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white"
                  >
                    <option value="">بدون مجلد</option>
                    {folders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <input
                  type="checkbox"
                  id="showAnswers"
                  checked={quiz.showCorrectAnswers ?? true}
                  onChange={(e) => setQuiz({ ...quiz, showCorrectAnswers: e.target.checked })}
                  className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="showAnswers" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  إظهار الإجابات الصحيحة للطالب بعد الانتهاء من الاختبار
                </label>
              </div>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIndex) => (
                <div key={q.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative group">
                  <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => removeQuestion(q.id)}
                      className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"
                      title="حذف السؤال"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                  
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 mt-1">
                      {qIndex + 1}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={q.text}
                        onChange={(e) => updateQuestionText(q.id, e.target.value)}
                        className="w-full text-lg font-medium border-b border-slate-200 focus:border-indigo-600 focus:outline-none pb-2 bg-transparent"
                        placeholder="اكتب نص السؤال هنا..."
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pl-12">
                    {q.options.map((opt, optIndex) => (
                      <div key={optIndex} className="flex items-center gap-3">
                        <button
                          onClick={() => setCorrectOption(q.id, optIndex)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            q.correctOptionIndex === optIndex
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-slate-300 hover:border-emerald-400'
                          }`}
                          title="تعيين كإجابة صحيحة"
                        >
                          {q.correctOptionIndex === optIndex && <CheckCircle2 size={14} />}
                        </button>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOptionText(q.id, optIndex, e.target.value)}
                          className={`flex-1 p-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${
                            q.correctOptionIndex === optIndex
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                          placeholder={`الخيار ${optIndex + 1}`}
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(q.id, optIndex)}
                            className="text-slate-400 hover:text-red-500 p-2 transition-colors"
                          >
                            <XCircle size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    <button
                      onClick={() => addOption(q.id)}
                      className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mt-4 px-2 py-1 rounded-md hover:bg-indigo-50 transition-colors"
                    >
                      <PlusCircle size={16} />
                      إضافة خيار
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <button
                  onClick={addQuestion}
                  className="flex items-center gap-2 bg-white border-2 border-dashed border-slate-300 text-slate-600 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 px-6 py-4 rounded-xl font-medium transition-all justify-center"
                >
                  <PlusCircle size={20} />
                  إضافة سؤال جديد
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-indigo-50 border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-100 hover:border-indigo-300 px-6 py-4 rounded-xl font-medium transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  {isGenerating ? 'جاري استخراج الأسئلة...' : 'توليد أسئلة من ملف PDF'}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePdfUpload}
                  accept="application/pdf"
                  className="hidden"
                />
              </div>
            </div>

            <div className="fixed bottom-6 left-6 flex gap-3">
              <button
                onClick={fetchResults}
                className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-medium"
              >
                <Users size={18} />
                عرض النتائج
              </button>
              <button
                onClick={shareQuiz}
                className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-medium"
              >
                <Save size={18} />
                حفظ التعديلات
              </button>
              <button
                onClick={() => {
                  shareQuiz();
                  alert('تم حفظ الاختبار. يمكنك الآن مشاركة الرابط.');
                }}
                className="bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-medium"
              >
                <QrCode size={18} />
                مشاركة الاختبار
              </button>
              <button
                onClick={() => {
                  setMode('take-intro');
                  setStudentAnswers({});
                  setStudentName('');
                  setCenterName('');
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-medium"
              >
                <Play size={18} />
                تجربة الاختبار
              </button>
            </div>
          </div>
        )}

        {mode === 'take-intro' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-md mx-auto">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
              {teacherInfo?.avatar_data && (
                <div className="flex flex-col items-center mb-6">
                  <img 
                    src={teacherInfo.avatar_data} 
                    alt={teacherInfo.name} 
                    className="w-24 h-24 rounded-full border-4 border-indigo-100 shadow-md object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <p className="mt-2 font-bold text-indigo-900">أ/ {teacherInfo.name}</p>
                  {teacherInfo.subject && <p className="text-xs text-slate-500 font-medium">مدرس {teacherInfo.subject}</p>}
                </div>
              )}
              <h2 className="text-2xl font-bold text-slate-800 mb-6">{quiz.title}</h2>
              <p className="text-slate-500 mb-8">الرجاء إدخال بياناتك قبل بدء الاختبار</p>
              
              <div className="space-y-4 text-right">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">اسم الطالب (ثلاثي)</label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="أدخل اسمك هنا..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">السنتر / المجموعة</label>
                  <input
                    type="text"
                    value={centerName}
                    onChange={(e) => setCenterName(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="أدخل اسم السنتر أو المجموعة..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">رقم واتساب ولي الأمر</label>
                  <input
                    type="tel"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                    placeholder="مثال: 01012345678"
                    dir="ltr"
                  />
                </div>
              </div>

              <button
                onClick={() => setMode('take')}
                disabled={!studentName.trim() || !centerName.trim() || !parentPhone.trim()}
                className="mt-8 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all w-full"
              >
                بدء الاختبار
              </button>
            </div>
          </div>
        )}

        {mode === 'take' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
            {teacherInfo?.avatar_data && (
              <div className="flex flex-col items-center mb-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <img 
                  src={teacherInfo.avatar_data} 
                  alt={teacherInfo.name} 
                  className="w-20 h-20 rounded-full border-4 border-indigo-100 shadow-sm object-cover"
                  referrerPolicy="no-referrer"
                />
                <p className="mt-2 font-bold text-indigo-900">أ/ {teacherInfo.name}</p>
                {teacherInfo.subject && <p className="text-xs text-slate-500 font-medium">مدرس {teacherInfo.subject}</p>}
              </div>
            )}
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-slate-800 mb-2">{quiz.title}</h2>
              <p className="text-slate-500">أجب عن جميع الأسئلة ثم اضغط على تسليم</p>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIndex) => (
                <div key={q.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-medium text-slate-800 mb-4 flex gap-3">
                    <span className="text-indigo-600 font-bold">{qIndex + 1}.</span>
                    {q.text || 'سؤال بدون نص'}
                  </h3>
                  <div className="space-y-3 pl-6">
                    {q.options.map((opt, optIndex) => (
                      <label
                        key={optIndex}
                        className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                          studentAnswers[q.id] === optIndex
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          studentAnswers[q.id] === optIndex
                            ? 'border-indigo-600'
                            : 'border-slate-300'
                        }`}>
                          {studentAnswers[q.id] === optIndex && (
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                          )}
                        </div>
                        <span className="text-slate-700">{opt || `الخيار ${optIndex + 1}`}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center pt-8 pb-12">
              <button
                onClick={submitQuiz}
                disabled={Object.keys(studentAnswers).length < quiz.questions.length}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-4 rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all w-full max-w-md"
              >
                تسليم الإجابات
              </button>
            </div>
          </div>
        )}

        {mode === 'results' && (
          <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500 max-w-3xl mx-auto">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">نتيجة الاختبار</h2>
              
              <div className="relative w-40 h-40 mx-auto mb-6">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-indigo-100"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={70 * 2 * Math.PI}
                    strokeDashoffset={70 * 2 * Math.PI * (1 - calculateScore() / quiz.questions.length)}
                    className="text-indigo-600 transition-all duration-1000 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-indigo-600">
                    {calculateScore()}
                  </span>
                  <span className="text-slate-500 font-medium text-sm">من {quiz.questions.length}</span>
                </div>
              </div>
              
              <p className="text-lg text-slate-600 font-medium mb-6">
                {calculateScore() === quiz.questions.length 
                  ? 'ممتاز! إجاباتك كلها صحيحة 🌟' 
                  : calculateScore() >= quiz.questions.length / 2 
                    ? 'جيد جداً! أداء رائع 👍' 
                    : 'حاول مرة أخرى، يمكنك تحقيق نتيجة أفضل 💪'}
              </p>

              {whatsappSent && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6 flex items-center gap-3 text-emerald-700 font-medium">
                  <div className="bg-emerald-500 text-white p-1 rounded-full">
                    <CheckCircle2 size={16} />
                  </div>
                  تم إرسال نتيجتك تلقائياً لواتساب ولي الأمر ✅
                </div>
              )}

              {aiMessage && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-6 text-right">
                  <h4 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                    <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">✨</span>
                    تحليل الذكاء الاصطناعي لمستواك:
                  </h4>
                  <p className="text-indigo-900 leading-relaxed">{aiMessage}</p>
                </div>
              )}

              <button
                onClick={sendToWhatsApp}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-2xl font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-3 mb-4"
              >
                <div className="bg-white/20 p-2 rounded-lg">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                إرسال النتيجة لواتساب ولي الأمر
              </button>
            </div>

            <div className="space-y-6">
              <h3 className="text-xl font-bold text-slate-800 px-2">مراجعة الإجابات:</h3>
              {quiz.questions.map((q, qIndex) => {
                const studentAns = studentAnswers[q.id];
                const isCorrect = studentAns === q.correctOptionIndex;
                const showAnswers = quiz.showCorrectAnswers ?? true;
                
                return (
                  <div key={q.id} className={`bg-white p-6 rounded-2xl shadow-sm border-2 ${
                    showAnswers ? (isCorrect ? 'border-emerald-200' : 'border-red-200') : 'border-slate-200'
                  }`}>
                    <div className="flex items-start gap-3 mb-4">
                      {showAnswers && (
                        isCorrect ? (
                          <CheckCircle2 className="text-emerald-500 shrink-0 mt-1" size={24} />
                        ) : (
                          <XCircle className="text-red-500 shrink-0 mt-1" size={24} />
                        )
                      )}
                      <h3 className="text-lg font-medium text-slate-800">
                        {qIndex + 1}. {q.text || 'سؤال بدون نص'}
                      </h3>
                    </div>
                    
                    <div className="space-y-2 pl-9">
                      {q.options.map((opt, optIndex) => {
                        let optionClass = "border-slate-100 bg-slate-50 text-slate-500";
                        let icon = null;
                        
                        if (showAnswers) {
                          if (optIndex === q.correctOptionIndex) {
                            optionClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium";
                            icon = <CheckCircle2 size={18} className="text-emerald-500" />;
                          } else if (optIndex === studentAns && !isCorrect) {
                            optionClass = "border-red-500 bg-red-50 text-red-800";
                            icon = <XCircle size={18} className="text-red-500" />;
                          } else if (optIndex === studentAns && isCorrect) {
                            optionClass = "border-emerald-500 bg-emerald-50 text-emerald-800 font-medium";
                            icon = <CheckCircle2 size={18} className="text-emerald-500" />;
                          }
                        } else {
                          if (optIndex === studentAns) {
                            optionClass = "border-indigo-500 bg-indigo-50 text-indigo-800 font-medium";
                            icon = <div className="w-4 h-4 rounded-full bg-indigo-500" />;
                          }
                        }

                        return (
                          <div
                            key={optIndex}
                            className={`flex items-center justify-between p-3 rounded-xl border ${optionClass}`}
                          >
                            <span>{opt || `الخيار ${optIndex + 1}`}</span>
                            {icon}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center pt-4 pb-12 gap-4">
              <button
                onClick={() => {
                  setMode('take-intro');
                  setStudentAnswers({});
                  setStudentName('');
                  setCenterName('');
                }}
                className="bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-xl font-bold transition-all"
              >
                إعادة الاختبار
              </button>
              {!isShared && (
                <button
                  onClick={() => setMode('build')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
                >
                  العودة للتعديل
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-right"
            dir="rtl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-800">تفعيل الاشتراك</h3>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                <p className="text-indigo-900 font-bold mb-2">طرق الدفع المتاحة:</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm">
                    <span className="font-mono text-indigo-600 font-bold">01012345678</span>
                    <span className="text-sm text-slate-600">فودافون كاش</span>
                  </div>
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl shadow-sm">
                    <span className="font-mono text-indigo-600 font-bold">gergesnabil101@instapay</span>
                    <span className="text-sm text-slate-600">إنستا باي (InstaPay)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-slate-600">بعد التحويل، يرجى رفع صورة إيصال الدفع لتفعيل حسابك:</p>
                <label className="block w-full border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleScreenshotUpload} 
                    className="hidden" 
                  />
                  {paymentScreenshot ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle className="text-emerald-500" size={32} />
                      <span className="text-sm text-emerald-600 font-bold">تم اختيار الصورة بنجاح</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="text-slate-400" size={32} />
                      <span className="text-sm text-slate-500">اضغط لرفع صورة الإيصال</span>
                    </div>
                  )}
                </label>
              </div>

              <button
                onClick={handleManualPayment}
                disabled={!paymentScreenshot || isSubmittingPayment}
                className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
                  paymentScreenshot && !isSubmittingPayment
                    ? 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-700'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmittingPayment ? 'جاري الإرسال...' : 'تأكيد وإرسال الطلب'}
              </button>
              
              <p className="text-xs text-center text-slate-400">
                سيتم مراجعة طلبك وتفعيل الحساب خلال 24 ساعة كحد أقصى.
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Share2 size={24} className="text-indigo-600" />
                مشاركة الاختبار
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                  <QRCodeCanvas
                    id="qr-code-canvas"
                    value={shareUrl}
                    size={200}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <button
                  onClick={downloadQRCode}
                  className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-colors"
                >
                  <Download size={18} />
                  تحميل رمز الاستجابة السريعة (QR Code)
                </button>
                <p className="text-sm text-slate-500 text-center">
                  يمكنك طباعة هذا الرمز في الملازم الخاصة بك ليقوم الطلاب بمسحه باستخدام هواتفهم.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">أو شارك الرابط مباشرة:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-left text-sm focus:outline-none"
                    dir="ltr"
                  />
                  <button
                    onClick={copyToClipboard}
                    className={`flex items-center justify-center w-12 shrink-0 rounded-xl transition-colors ${
                      copied ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                    title="نسخ الرابط"
                  >
                    {copied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResultsModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users size={24} className="text-indigo-600" />
                نتائج الطلاب
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadExcel}
                  disabled={teacherResults.length === 0}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white px-4 py-2 rounded-xl font-medium transition-colors"
                >
                  <Download size={18} />
                  تحميل شيت إكسل
                </button>
                <button
                  onClick={() => setShowResultsModal(false)}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {teacherResults.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  لا توجد نتائج مسجلة حتى الآن.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-4 font-semibold text-slate-700">اسم الطالب</th>
                        <th className="p-4 font-semibold text-slate-700">السنتر / المجموعة</th>
                        <th className="p-4 font-semibold text-slate-700">الدرجة</th>
                        <th className="p-4 font-semibold text-slate-700">التاريخ</th>
                        <th className="p-4 font-semibold text-slate-700">إرسال لواتساب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherResults.map((result, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4 text-slate-800 font-medium">{result.student_name}</td>
                          <td className="p-4 text-slate-600">
                            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                              {result.center_name}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className={`font-bold ${result.score >= result.total / 2 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {result.score} / {result.total}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500 text-sm" dir="ltr">
                            {new Date(result.created_at).toLocaleString('ar-EG')}
                          </td>
                          <td className="p-4">
                            <button
                              onClick={() => sendToWhatsApp(result)}
                              disabled={!result.parent_phone}
                              className="bg-emerald-100 text-emerald-700 p-2 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-30"
                              title="إرسال لواتساب ولي الأمر"
                            >
                              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
