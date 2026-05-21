/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse, Type, ThinkingLevel } from "@google/genai";
import { 
  Camera, 
  Upload, 
  Utensils, 
  Scale, 
  ChevronRight, 
  Plus, 
  Minus, 
  Info, 
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  X,
  Mic,
  MicOff,
  Dumbbell,
  Target,
  Home,
  Trophy,
  User,
  Activity,
  Heart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import AuthScreen from './components/AuthScreen';

// --- Types ---

export interface UserProfile {
  age: number;
  gender: 'male' | 'female';
  height: number;
  weight: number;
  targetWeight: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  manualCalories?: number;
  // Calculated below
  bmi: number;
  bmiCategory: string;
  tdee: number;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
  };
  createdAt?: number;
  updatedAt?: number;
}

interface NutritionalInfo {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
}

interface MealAnalysis {
  items: string[];
  nutrition: NutritionalInfo;
  advice: string;
  suggestions: string[];
}

interface FitnessExercise {
  name: string;
  sets: string;
  reps: string;
  tip: string;
}

interface FitnessPlan {
  home: {
    title: string;
    exercises: FitnessExercise[];
  };
  gym?: {
    title: string;
    exercises: FitnessExercise[];
  };
  tips: {
    title: string;
    content: string;
  }[];
  nutrition: string;
}

// --- App Component ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('yemekcim_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeTab, setActiveTab] = useState<'profile' | 'image' | 'text' | 'recipe' | 'fitness'>('profile');
  const [image, setImage] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [dietGoal, setDietGoal] = useState('high-cal-high-prot');
  const [fitnessLevel, setFitnessLevel] = useState('beginner');
  const [fitnessGoal, setFitnessGoal] = useState('muscle-gain');
  const [equipment, setEquipment] = useState('none');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [recipeResult, setRecipeResult] = useState<{ title: string; dishes: string[]; content: string } | null>(null);
  const [fitnessPlan, setFitnessPlan] = useState<FitnessPlan | null>(null);
  const [recipeImage, setRecipeImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dietGoals = [
    { id: 'high-cal-high-prot', label: 'Yüksek Kalori & Yüksek Protein', emoji: '💪' },
    { id: 'low-cal-high-prot', label: 'Düşük Kalori & Yüksek Protein', emoji: '🏃‍♂️' },
    { id: 'balanced', label: 'Dengeli Beslenme', emoji: '⚖️' },
    { id: 'vegan-prot', label: 'Vegan Protein Odağı', emoji: '🌱' },
    { id: 'keto', label: 'Ketojenik (Düşük Karb)', emoji: '🥩' },
  ];

  const fitnessLevels = [
    { id: 'beginner', label: 'Başlangıç', desc: 'Spora yeni başlıyorum' },
    { id: 'intermediate', label: 'Orta Seviye', desc: 'Düzenli spor yapıyorum' },
    { id: 'advanced', label: 'İleri Seviye', desc: 'Yüksek yoğunluklu antrenman' },
  ];

  const fitnessGoals = [
    { id: 'muscle-gain', label: 'Kas Kazanımı', emoji: '💪' },
    { id: 'fat-loss', label: 'Yağ Yakımı', emoji: '🔥' },
    { id: 'endurance', label: 'Dayanıklılık', emoji: '🏃' },
    { id: 'flexibility', label: 'Esneklik & Mobilite', emoji: '🧘' },
  ];

  const equipmentOptions = [
    { id: 'none', label: 'Ekipman Yok', desc: 'Sadece vücut ağırlığı' },
    { id: 'basic', label: 'Temel Ekipman', desc: 'Dambıl, direnç bandı' },
    { id: 'full', label: 'Tam Donanımlı Salon', desc: 'Makineler ve serbest ağırlıklar' },
  ];

  // Profile State Setup (Form)
  const [profileForm, setProfileForm] = useState<Partial<UserProfile>>(
    profile || {
      age: 25,
      gender: 'male',
      height: 175,
      weight: 70,
      targetWeight: 75,
      activityLevel: 'moderate'
    }
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            setProfile(data);
            setProfileForm(data);
            setActiveTab('image');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        // Fallback to local storage if not logged in
        const saved = localStorage.getItem('yemekcim_profile');
        if (saved) {
          const parsed = JSON.parse(saved);
          setProfile(parsed);
          setProfileForm(parsed);
          setActiveTab('image');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const calculateProfile = (data: Partial<UserProfile>): UserProfile => {
    const { age, gender, height, weight, activityLevel, targetWeight, manualCalories } = data;
    const a = age || 25, h = height || 175, w = weight || 70, tw = targetWeight || 75;
    
    // Mifflin-St Jeor
    let bmr = (10 * w) + (6.25 * h) - (5 * a);
    bmr += gender === 'male' ? 5 : -161;

    const activityMultipliers: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const tdee = Math.round(bmr * activityMultipliers[activityLevel || 'moderate']);
    const bmi = Number((w / Math.pow(h / 100, 2)).toFixed(1));

    let bmiCategory = '';
    if (bmi < 18.5) bmiCategory = 'Zayıf';
    else if (bmi >= 18.5 && bmi <= 24.9) bmiCategory = 'Normal';
    else if (bmi >= 25 && bmi <= 29.9) bmiCategory = 'Fazla Kilolu';
    else bmiCategory = 'Obez';

    // Calculate targets
    let targetCalories = tdee;
    if (manualCalories && manualCalories > 0) {
      targetCalories = manualCalories;
    } else {
      if (tw > w) targetCalories += (tw - w > 5 ? 500 : 250); // Bulking
      else if (tw < w) targetCalories -= (w - tw > 5 ? 500 : 250); // Cutting
    }
    
    // Goal based macros
    let protein = Math.round(w * (tw > w ? 2.2 : tw < w ? 2.0 : 1.8)); 
    let fats = Math.round((targetCalories * 0.25) / 9);
    let carbs = Math.round((targetCalories - (protein * 4) - (fats * 9)) / 4);
    let fiber = Math.round(targetCalories / 1000 * 14);

    return {
      age: a, gender: gender as any, height: h, weight: w, targetWeight: tw,
      activityLevel: activityLevel as any, manualCalories,
      bmi, bmiCategory, tdee,
      targets: { calories: targetCalories, protein, carbs, fats, fiber }
    };
  };

  const saveProfile = async () => {
    const calculated = calculateProfile(profileForm);
    setProfile(calculated);
    localStorage.setItem('yemekcim_profile', JSON.stringify(calculated));

    if (user) {
      try {
        const docRef = doc(db, 'users', user.uid);
        const dataToSave = {
          ...calculated,
          createdAt: profile?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(docRef, dataToSave, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      }
    }
  };
  
  const getProfileContext = () => {
    if (!profile) return 'Kullanıcı profili henüz oluşturulmadı.';
    return `Kullanıcı Profili Bilgileri: ${profile.age} yaşında ${profile.gender === 'male' ? 'Erkek' : 'Kadın'}, Boy: ${profile.height} cm, Kilo: ${profile.weight} kg, BMI: ${profile.bmi} (${profile.bmiCategory}).
    Hedef Kilo: ${profile.targetWeight} kg. Tahmini TDEE (Günlük Enerji Harcaması): ${profile.tdee} kcal. Özel Hedef Kalori: ${profile.manualCalories ? profile.manualCalories : 'Yok'}.
    GÜNLÜK BESLENME HEDEFLERİ: Kalori: ${profile.targets.calories} kcal, Protein: ${profile.targets.protein}g, Karbonhidrat: ${profile.targets.carbs}g, Yağ: ${profile.targets.fats}g, Lif: ${profile.targets.fiber}g.
    Lütfen tüm analizleri, tarifleri ve tavsiyeleri kullanıcının bu kişisel hedeflerine ve fiziksel durumuna uydurarak ve bu profile atıfta bulunarak ver.`;
  };

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Lütfen bir resim dosyası yükleyin.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setAnalysis(null);
      setError(null);
      setActiveTab('image');
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => {
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const base64Data = image.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `${getProfileContext()}
                
                Sen kilo alma konusunda uzmanlaşmış, son derece dikkatli bir sanal beslenme uzmanısın. 
                Görevin, bu yemek fotoğrafını titizlikle analiz etmektir.
                
                KRİTİK TALİMATLAR:
                1. SADECE fotoğrafta net bir şekilde görünen yiyecek ve içecekleri tanımla. 
                2. Fotoğrafta olmayan hiçbir şeyi (varsayılan yan ürünler, garnitürler vb.) ekleme. Halüsinasyon görme.
                3. Porsiyon büyüklüklerini görsel ölçeğe göre tahmin et.
                4. Besin değerlerini (kalori, protein, karbonhidrat, yağ) bu spesifik porsiyonlara göre hesapla.
                5. Kilo alma hedefleri için empatik, arkadaşça ve motive edici tavsiyeler ver. Emoji kullan! 🥗💪
                6. Mevcut öğünü daha yüksek kalorili veya daha besleyici hale getirecek 3-4 somut değişiklik öner.
                
                Tüm yanıtları TÜRKÇE olarak ver.
                Yanıtı şu yapıya sahip JSON formatında döndür:
                {
                  "items": ["sadece görünen öğe 1", "sadece görünen öğe 2"],
                  "nutrition": {
                    "calories": sayı,
                    "protein": sayı,
                    "carbs": sayı,
                    "fats": sayı
                  },
                  "advice": "Görsel kanıtlara dayanan, empatik tavsiyeler ve emojiler içeren Markdown dizesi",
                  "suggestions": ["emoji içeren somut öneri 1", "emoji içeren somut öneri 2"]
                }`
              },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const result = JSON.parse(response.text || '{}') as MealAnalysis;
      setAnalysis(result);
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Resim analiz edilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeText = async () => {
    if (!manualText.trim()) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                text: `${getProfileContext()}
                
                Sen kilo alma konusunda uzmanlaşmış bir sanal beslenme uzmanısın. 
                Kullanıcının girdiği şu yiyecekleri analiz et: "${manualText}"
                
                NOT: Yiyecekler sesli komutla girilmiş olabilir, bu nedenle bazı kelimeler yanlış yazılmış veya eksik olabilir (Örn: "tavuk" yerine "tavuh", "yumurta" yerine "yumurta" gibi). Lütfen en yakın anlamlı yiyecekleri tahmin et.
                
                TALİMATLAR:
                1. Yazılan yiyecekleri ve miktarlarını tanımla.
                2. Besin değerlerini (kalori, protein, karbonhidrat, yağ) hesapla.
                3. Kilo alma hedefleri için tavsiyeler ver. Emoji kullan! 🥗💪
                4. Bu öğünü daha besleyici hale getirecek 3-4 öneri sun.
                
                Tüm yanıtları TÜRKÇE olarak ver.
                Yanıtı şu yapıya sahip JSON formatında döndür:
                {
                  "items": ["yiyecek 1", "yiyecek 2"],
                  "nutrition": {
                    "calories": sayı,
                    "protein": sayı,
                    "carbs": sayı,
                    "fats": sayı
                  },
                  "advice": "Empatik tavsiyeler ve emojiler içeren Markdown dizesi",
                  "suggestions": ["emoji içeren öneri 1", "emoji içeren öneri 2"]
                }`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      const result = JSON.parse(response.text || '{}') as MealAnalysis;
      setAnalysis(result);
    } catch (err) {
      console.error('Analysis error:', err);
      setError('Metin analiz edilemedi. Lütfen tekrar deneyin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateRecipe = async () => {
    if (!ingredients.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setRecipeResult(null);
    setRecipeImage(null);

    const selectedGoal = dietGoals.find(g => g.id === dietGoal)?.label;

    try {
      // PHASE 1: Quick Dish Name Generation (To start image gen ASAP)
      const quickResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [{
            text: `${getProfileContext()}
            
            Malzemeler: "${ingredients}". Hedef: "${selectedGoal}". 
            Sadece bu malzemelerle yapılacak en iyi 2 yemeğin adını JSON olarak ver: {"dishes": ["Yemek 1", "Yemek 2"], "title": "Tema Adı"}`
          }]
        }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      let quickData;
      try {
        quickData = JSON.parse(quickResponse.text || '{"dishes": ["Özel Yemek"], "title": "Tarifler"}');
      } catch (e) {
        quickData = { dishes: ["Özel Yemek"], title: "Tarifler" };
      }

      // Update UI with initial names to show something immediately
      setRecipeResult({ 
        title: quickData.title, 
        dishes: quickData.dishes, 
        content: "Tarif detayları hazırlanıyor... 👨‍🍳" 
      });

      // PHASE 2: Parallel Generation (Image + Full Content)
      const imagePromise = ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{
            text: `A professional food photography shot of ${quickData.dishes.join(' and ')}. High resolution, appetizing, gourmet plating, warm lighting.`,
          }],
        },
        config: {
          imageConfig: { aspectRatio: "16:9" },
        },
      }).then(response => {
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            setRecipeImage(`data:image/png;base64,${part.inlineData.data}`);
            break;
          }
        }
      }).catch(err => console.error('Image gen failed:', err));

      const contentPromise = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [{
            text: `${getProfileContext()}
            
            Sen uzman bir şefsin. Şu yemekler için detaylı tarifler yaz: ${quickData.dishes.join(', ')}. 
            Hedef: ${selectedGoal}. Malzemeler: ${ingredients}. 
            Markdown formatında, iştah açıcı bir dille yaz. Hazırlama süresi, zorluk derecesi, adım adım yapılışı ve MUTLAKA her tarifin sonunda porsiyon başına tahmini makro besin değerlerini (Kalori, Protein, Karbonhidrat, Yağ) ekle.`
          }]
        }],
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      }).then(response => {
        setRecipeResult(prev => prev ? { ...prev, content: response.text || "Tarif oluşturulamadı." } : null);
      }).catch(err => {
        console.error('Content gen failed:', err);
        setError('Tarif detayları oluşturulamadı.');
      });

      // Wait for both to finish if we want to clear the loading state properly
      await Promise.all([imagePromise, contentPromise]);

    } catch (err) {
      console.error('Recipe error:', err);
      setError('Hızlı analiz başarısız oldu. Lütfen tekrar deneyin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startListening = (target: 'manual' | 'ingredients') => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Tarayıcınız sesli girişi desteklemiyor.');
      return;
    }

    if (isListening) {
      // If already listening, stop it (toggle behavior)
      const existingRecognition = (window as any)._currentRecognition;
      if (existingRecognition) existingRecognition.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    (window as any)._currentRecognition = recognition;

    let finalTranscript = '';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsListening(false);
      (window as any)._currentRecognition = null;
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setError('Mikrofon erişimine izin verilmedi.');
      } else {
        setError('Ses algılama hatası oluştu.');
      }
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      // Update the target text area with the final transcript so far
      if (target === 'manual') {
        setManualText(prev => {
          // We only want to append the NEW final parts to the existing text
          // But since we are in continuous mode, it's easier to just manage the session's transcript
          return prev.trim() + ' ' + finalTranscript.trim();
        });
        // Clear session transcript after appending to avoid double-appending
        finalTranscript = ''; 
      } else {
        setIngredients(prev => prev.trim() + ' ' + finalTranscript.trim());
        finalTranscript = '';
      }
    };

    recognition.start();
  };

  const generateFitnessPlan = async () => {
    setIsAnalyzing(true);
    setError(null);
    setFitnessPlan(null);

    const levelLabel = fitnessLevels.find(l => l.id === fitnessLevel)?.label;
    const goalLabel = fitnessGoals.find(g => g.id === fitnessGoal)?.label;
    const equipLabel = equipmentOptions.find(e => e.id === equipment)?.label;

    try {
      const isGymSelected = equipment === 'full';
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [{
            text: `${getProfileContext()}
            
            Sen uzman bir kişisel antrenör ve beslenme uzmanısın. Kullanıcı için özel bir egzersiz planı oluştur.
            
            Kullanıcı Bilgileri:
            - Seviye: ${levelLabel}
            - Hedef: ${goalLabel}
            - Ekipman Durumu: ${equipLabel}
            
            TALİMATLAR:
            1. ${isGymSelected 
                ? "Hem EV (Home) hem de SALON (Gym) ortamları için varyasyonlar içeren detaylı bir plan hazırla." 
                : "SADECE EV (Home) ortamı için, kullanıcının belirttiği ekipman durumuna uygun detaylı bir plan hazırla. Salon (Gym) kısmını JSON'dan tamamen çıkar."}
            2. Egzersizlerin set ve tekrar sayılarını belirt.
            3. Motivasyonel ipuçları ve beslenme tavsiyeleri ekle.
            4. Yanıtı SADECE aşağıdaki JSON formatında döndür.
            
            JSON Yapısı:
            {
              "home": {
                "title": "Ev Antrenmanı Başlığı",
                "exercises": [
                  { "name": "Egzersiz Adı", "sets": "Set Sayısı", "reps": "Tekrar Sayısı", "tip": "Kısa İpucu" }
                ]
              },
              ${isGymSelected ? `"gym": {
                "title": "Salon Antrenmanı Başlığı",
                "exercises": [
                  { "name": "Egzersiz Adı", "sets": "Set Sayısı", "reps": "Tekrar Sayısı", "tip": "Kısa İpucu" }
                ]
              },` : ''}
              "tips": [
                { "title": "İpucu Başlığı", "content": "İpucu İçeriği" }
              ],
              "nutrition": "Beslenme ve egzersiz ilişkisi hakkında kısa tavsiye"
            }`
          }]
        }],
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      const result = JSON.parse(response.text || '{}') as FitnessPlan;
      setFitnessPlan(result);
    } catch (err) {
      console.error('Fitness plan error:', err);
      setError('Egzersiz planı oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setImage(null);
    setManualText('');
    setIngredients('');
    setAnalysis(null);
    setRecipeResult(null);
    setFitnessPlan(null);
    setRecipeImage(null);
    setError(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] font-sans selection:bg-orange-500/30 selection:text-orange-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1e293b]/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
              <Utensils size={18} />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Yemekçim</h1>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-400">
            <span className="hidden md:inline">Sanal Beslenme Uzmanı</span>
            {(image || manualText || ingredients || analysis || recipeResult) && (
              <button 
                onClick={reset}
                className="flex items-center gap-1.5 text-orange-500 hover:text-orange-400 transition-colors"
              >
                <RefreshCw size={14} />
                Sıfırla
              </button>
            )}
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-3 ml-2 border-l border-slate-700 pl-4">
                  <span className="text-sm text-slate-300 truncate max-w-[120px]">{user.displayName || user.email}</span>
                  <button onClick={logout} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors border border-slate-700">Çıkış Yap</button>
                </div>
              ) : (
                <div className="ml-2 border-l border-slate-700 pl-4">
                  <button onClick={loginWithGoogle} className="text-xs bg-white text-slate-900 font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors">Giriş Yap / Kaydol</button>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Tab Navigation */}
        <div className="flex justify-center mb-12">
          <div className="bg-slate-800 p-1 rounded-2xl flex flex-wrap justify-center gap-1">
            <button
              onClick={() => { setActiveTab('profile'); setAnalysis(null); setRecipeResult(null); setFitnessPlan(null); }}
              className={cn(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'profile' ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <User size={16} />
              Profilim
            </button>
            <button
              onClick={() => { setActiveTab('image'); setAnalysis(null); setRecipeResult(null); setFitnessPlan(null); }}
              className={cn(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'image' ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Camera size={16} />
              Fotoğraf
            </button>
            <button
              onClick={() => { setActiveTab('text'); setAnalysis(null); setRecipeResult(null); }}
              className={cn(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'text' ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Scale size={16} />
              Kalori Hesapla
            </button>
            <button
              onClick={() => { setActiveTab('recipe'); setAnalysis(null); setRecipeResult(null); setFitnessPlan(null); }}
              className={cn(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'recipe' ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Utensils size={16} />
              Tarif Bul
            </button>
            <button
              onClick={() => { setActiveTab('fitness'); setAnalysis(null); setRecipeResult(null); setFitnessPlan(null); }}
              className={cn(
                "px-4 sm:px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2",
                activeTab === 'fitness' ? "bg-orange-500 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Dumbbell size={16} />
              Fitness
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'profile' && !fitnessPlan && !analysis && !recipeResult ? (
            <motion.div
              key="profile-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 mb-8 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                    <User size={28} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-orange-600">Kişisel Profilin</h2>
                    <p className="text-slate-400 text-sm">Yaş, boy, kilo gibi bilgilerini gir, sana özel günlük hedeflerini (Kalori, Protein vb.) hesaplayalım.</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Yaş</label>
                      <input 
                        type="number" min="10" max="120"
                        value={profileForm.age}
                        onChange={(e) => setProfileForm({ ...profileForm, age: Number(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Cinsiyet</label>
                      <select 
                        value={profileForm.gender}
                        onChange={(e) => setProfileForm({ ...profileForm, gender: e.target.value as any })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all font-medium appearance-none"
                      >
                        <option value="male">Erkek</option>
                        <option value="female">Kadın</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Boy (cm)</label>
                      <input 
                        type="number" min="100" max="250"
                        value={profileForm.height}
                        onChange={(e) => setProfileForm({ ...profileForm, height: Number(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-all font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Güncel Kilo (kg)</label>
                      <input 
                        type="number" min="30" max="300"
                        value={profileForm.weight}
                        onChange={(e) => setProfileForm({ ...profileForm, weight: Number(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-all font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Hedef Kilo (kg)</label>
                      <input 
                        type="number" min="30" max="300"
                        value={profileForm.targetWeight}
                        onChange={(e) => setProfileForm({ ...profileForm, targetWeight: Number(e.target.value) })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-all font-medium" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Hedef Kalori (İsteğe Bağlı)</label>
                      <input 
                        type="number" min="1000" max="10000" placeholder="Otomatik (Tavsiye edilir)"
                        value={profileForm.manualCalories || ''}
                        onChange={(e) => setProfileForm({ ...profileForm, manualCalories: e.target.value ? Number(e.target.value) : undefined })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-all font-medium" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-2">Hareket Seviyesi</label>
                      <select 
                        value={profileForm.activityLevel}
                        onChange={(e) => setProfileForm({ ...profileForm, activityLevel: e.target.value as any })}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-all font-medium appearance-none"
                      >
                        <option value="sedentary">Hareketsiz (Sürekli masa başı)</option>
                        <option value="light">Hafif (Hafif yürüyüş vs.)</option>
                        <option value="moderate">Orta Hareketli (Haftada 3-4 gün spor)</option>
                        <option value="active">Aktif (Haftada 5-6 gün spor)</option>
                        <option value="very_active">Çok Aktif (Ağır fiziksel iş/spor)</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    onClick={() => { saveProfile(); }}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/25 transition-all active:scale-[0.98] flex justify-center items-center gap-2 mt-4"
                  >
                    <CheckCircle2 size={20} />
                    Profili Kaydet ve Hesapla
                  </button>
                </div>
              </div>

              {profile && (
                <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 mb-8 shadow-2xl">
                  <div className="flex items-center gap-3 mb-6">
                    <Activity className="text-blue-400" size={24} />
                    <h3 className="text-xl font-bold text-white">Günlük Hedeflerin</h3>
                  </div>

                  <div className="bg-slate-900/50 rounded-2xl border border-slate-700/50 p-5 mb-6">
                    <h4 className="flex items-center gap-2 font-bold mb-2 text-white">
                      <Info size={18} className="text-blue-400" />
                      Vücut Kitle Endeksi (BMI) Nedir?
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed mb-3">
                      Vücut Kitle Endeksi (BMI), boyunuza oranla kilonuzun sağlıklı aralıkta olup olmadığını değerlendiren evrensel bir sağlık ölçütüdür. Vücut ağırlığınızın (kg), boyunuzun karesine (m²) bölünmesiyle hesaplanır.
                    </p>
                    <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
                      <p className="text-sm text-slate-300">
                        Senin Vücut Kitle Endeksin <strong className="text-white text-lg">{profile.bmi}</strong> ve bu değere göre kategorin: <strong className={cn(
                        "px-2 py-0.5 rounded-full outline-1 outline -outline-offset-1 text-xs ml-1 font-bold",
                        profile.bmiCategory === 'Zayıf' ? 'bg-blue-500/10 text-blue-400 outline-blue-500/20' :
                        profile.bmiCategory === 'Normal' ? 'bg-green-500/10 text-green-400 outline-green-500/20' :
                        profile.bmiCategory === 'Fazla Kilolu' ? 'bg-orange-500/10 text-orange-400 outline-orange-500/20' :
                        'bg-red-500/10 text-red-400 outline-red-500/20'
                      )}>{profile.bmiCategory}</strong>.
                      </p>
                      <p className="text-sm text-slate-400 mt-2 font-medium">
                        {profile.bmiCategory === 'Zayıf' && "Kilonuz sağlığınız için ideal sınırın altında. Kas kütlesi ekleyip sağlıklı beslenerek kilo almanız faydalı olacaktır."}
                        {profile.bmiCategory === 'Normal' && "Harika! Boyunuza göre en ideal kilodasınız. Dengeli ve düzenli beslenerek bu uyumu korumaya odaklanın."}
                        {profile.bmiCategory === 'Fazla Kilolu' && "Kilonuz ideal aralığın biraz üzerinde. Sağlıklı bir diyet ve düzenli egzersiz programıyla fazla kilolarınızdan kurtulabilirsiniz."}
                        {profile.bmiCategory === 'Obez' && "Kilonuz önemli sağlık riskleri taşıyabilecek bir seviyede (Obezite). Bir doktora danışarak kontrollü şekilde kilo verme sürecine başlamalısınız."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                      <p className="text-slate-400 text-xs font-semibold mb-1 uppercase tracking-wider">Günlük Harcama (TDEE)</p>
                      <p className="text-2xl font-bold tracking-tight text-white">{profile.tdee} <span className="text-sm font-normal text-slate-500">kcal</span></p>
                      <p className="text-[10px] text-slate-500 mt-1">Sabit kilonuzu korumak için.</p>
                    </div>
                    <div className="bg-orange-500/10 p-4 rounded-2xl border border-orange-500/20 text-center flex flex-col justify-center">
                      <p className="text-orange-400/80 text-xs font-semibold mb-1 uppercase tracking-wider">
                        {profile.manualCalories ? "Bireysel Özel Hedef" : (profile.targetWeight > profile.weight ? "MİNİMUM HEDEF (Kilo Alma)" : profile.targetWeight < profile.weight ? "MAKSİMUM HEDEF (Kilo Verme)" : "KORUMA HEDEFİ")}
                      </p>
                      <p className="text-3xl font-black tracking-tight text-orange-500 drop-shadow-md">{profile.targets.calories} <span className="text-lg font-bold text-orange-500/60">kcal</span></p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><Heart size={16} className="text-red-400" /> Makro İhtiyaçların</h4>
                    <div className="grid grid-cols-4 gap-2">
                       <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700/50 text-center">
                          <p className="text-blue-400 text-xs font-bold mb-1 uppercase">Protein</p>
                          <p className="text-xl font-bold text-white">{profile.targets.protein}<span className="text-xs text-slate-500 ml-1">g</span></p>
                       </div>
                       <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700/50 text-center">
                          <p className="text-amber-400 text-xs font-bold mb-1 uppercase">Karb</p>
                          <p className="text-xl font-bold text-white">{profile.targets.carbs}<span className="text-xs text-slate-500 ml-1">g</span></p>
                       </div>
                       <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700/50 text-center">
                          <p className="text-pink-400 text-xs font-bold mb-1 uppercase">Yağ</p>
                          <p className="text-xl font-bold text-white">{profile.targets.fats}<span className="text-xs text-slate-500 ml-1">g</span></p>
                       </div>
                       <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-700/50 text-center">
                          <p className="text-green-400 text-xs font-bold mb-1 uppercase">Lif</p>
                          <p className="text-xl font-bold text-white">{profile.targets.fiber}<span className="text-xs text-slate-500 ml-1">g</span></p>
                       </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ) : fitnessPlan ? (
            <motion.div
              key="fitness-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Header Card */}
              <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                    <Trophy size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Kişisel Fitness Planın</h3>
                    <p className="text-slate-400">Hedeflerine ulaşman için hazırlandı.</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="bg-orange-500/10 text-orange-500 px-4 py-1.5 rounded-full text-sm font-bold border border-orange-500/20 flex items-center gap-2">
                    {fitnessGoals.find(g => g.id === fitnessGoal)?.emoji} {fitnessGoals.find(g => g.id === fitnessGoal)?.label}
                  </span>
                  <span className="bg-blue-500/10 text-blue-400 px-4 py-1.5 rounded-full text-sm font-bold border border-blue-500/20 flex items-center gap-2">
                    <Target size={14} /> {fitnessLevels.find(l => l.id === fitnessLevel)?.label}
                  </span>
                </div>
              </div>

              {/* Workouts Grid */}
              <div className={cn(
                "grid grid-cols-1 gap-8",
                fitnessPlan.gym ? "lg:grid-cols-2" : "max-w-2xl mx-auto"
              )}>
                {/* Home Workout */}
                <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 overflow-hidden flex flex-col">
                  <div className="p-6 bg-slate-800/80 border-b border-slate-700 flex items-center gap-3">
                    <Home className="text-orange-500" size={24} />
                    <h4 className="text-lg font-bold text-white">{fitnessPlan.home.title}</h4>
                  </div>
                  <div className="p-6 space-y-4 flex-1">
                    {fitnessPlan.home.exercises.map((ex, i) => (
                      <div key={i} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 group hover:border-orange-500/30 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <h5 className="font-bold text-slate-100">{ex.name}</h5>
                          <div className="flex gap-2">
                            <span className="text-xs font-bold bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded uppercase">{ex.sets} Set</span>
                            <span className="text-xs font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase">{ex.reps} Tekrar</span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 italic flex items-center gap-1.5">
                          <Info size={12} /> {ex.tip}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gym Workout - Only if available */}
                {fitnessPlan.gym && (
                  <div className="bg-slate-800/50 rounded-3xl border border-slate-700/50 overflow-hidden flex flex-col">
                    <div className="p-6 bg-slate-800/80 border-b border-slate-700 flex items-center gap-3">
                      <Dumbbell className="text-orange-500" size={24} />
                      <h4 className="text-lg font-bold text-white">{fitnessPlan.gym.title}</h4>
                    </div>
                    <div className="p-6 space-y-4 flex-1">
                      {fitnessPlan.gym.exercises.map((ex, i) => (
                        <div key={i} className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50 group hover:border-orange-500/30 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-bold text-slate-100">{ex.name}</h5>
                            <div className="flex gap-2">
                              <span className="text-xs font-bold bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded uppercase">{ex.sets} Set</span>
                              <span className="text-xs font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded uppercase">{ex.reps} Tekrar</span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 italic flex items-center gap-1.5">
                            <Info size={12} /> {ex.tip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tips and Nutrition */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 px-2">Motivasyonel İpuçları</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fitnessPlan.tips.map((tip, i) => (
                      <div key={i} className="bg-slate-800/30 p-6 rounded-3xl border border-slate-700/50 space-y-2">
                        <h5 className="font-bold text-orange-400 flex items-center gap-2">
                          <CheckCircle2 size={16} /> {tip.title}
                        </h5>
                        <p className="text-sm text-slate-400 leading-relaxed">{tip.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-slate-500 px-2">Beslenme Notu</h4>
                  <div className="bg-orange-500/5 border border-orange-500/10 p-6 rounded-3xl h-full flex flex-col justify-center">
                    <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-500 mb-4">
                      <Utensils size={20} />
                    </div>
                    <p className="text-sm text-orange-100/80 leading-relaxed italic">
                      "{fitnessPlan.nutrition}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-8">
                <button 
                  onClick={() => setFitnessPlan(null)}
                  className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition-all flex items-center gap-2 border border-slate-700"
                >
                  <RefreshCw size={18} /> Ayarları Güncelle
                </button>
              </div>
            </motion.div>
          ) : activeTab === 'fitness' ? (
            <motion.div
              key="fitness-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-3">
                <h2 className="text-4xl font-bold tracking-tight">
                  Vücudunu <span className="text-orange-500">harekete geçir.</span>
                </h2>
                <p className="text-slate-400 text-lg">
                  Beslenmeni doğru antrenmanla destekle. Sana özel egzersiz planını hemen oluştur.
                </p>
              </div>

              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-sm space-y-8">
                {/* Level Selection */}
                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Target size={16} className="text-orange-500" /> Antrenman Seviyen
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {fitnessLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => setFitnessLevel(level.id)}
                        className={cn(
                          "p-4 rounded-2xl text-sm transition-all border text-left flex flex-col gap-1",
                          fitnessLevel === level.id 
                            ? "bg-orange-500 border-orange-400 text-white shadow-lg" 
                            : "bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <span className="font-bold">{level.label}</span>
                        <span className={cn("text-xs opacity-70", fitnessLevel === level.id ? "text-white" : "text-slate-500")}>
                          {level.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Goal Selection */}
                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Trophy size={16} className="text-orange-500" /> Hedefin Nedir?
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {fitnessGoals.map((goal) => (
                      <button
                        key={goal.id}
                        onClick={() => setFitnessGoal(goal.id)}
                        className={cn(
                          "p-4 rounded-2xl text-sm font-bold transition-all border flex items-center gap-3",
                          fitnessGoal === goal.id 
                            ? "bg-orange-500 border-orange-400 text-white shadow-lg" 
                            : "bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <span className="text-xl">{goal.emoji}</span>
                        {goal.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Equipment Selection */}
                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Home size={16} className="text-orange-500" /> Ekipman Durumu
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    {equipmentOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setEquipment(option.id)}
                        className={cn(
                          "p-4 rounded-2xl text-sm transition-all border text-left flex items-center justify-between",
                          equipment === option.id 
                            ? "bg-orange-500 border-orange-400 text-white shadow-lg" 
                            : "bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-bold">{option.label}</span>
                          <span className={cn("text-xs opacity-70", equipment === option.id ? "text-white" : "text-slate-500")}>
                            {option.desc}
                          </span>
                        </div>
                        {equipment === option.id && <CheckCircle2 size={20} />}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateFitnessPlan}
                  disabled={isAnalyzing}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-semibold shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Plan Oluşturuluyor...
                    </>
                  ) : (
                    <>
                      <Dumbbell size={20} />
                      Egzersiz Planımı Hazırla
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : recipeResult ? (
            <motion.div
              key="recipe-results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 rounded-3xl border border-slate-700/50 shadow-sm overflow-hidden flex flex-col"
            >
              {/* Recipe Header - Always at top */}
              <div className="p-8 border-b border-slate-700 flex items-center justify-between bg-slate-800/80 backdrop-blur-sm">
                <div className="flex items-center gap-3 text-orange-500">
                  <Utensils size={28} />
                  <h3 className="text-2xl sm:text-3xl font-bold text-white">{recipeResult.title}</h3>
                </div>
                <div className="hidden sm:flex bg-orange-500/10 text-orange-500 px-4 py-1.5 rounded-full text-sm font-bold border border-orange-500/20">
                  {dietGoals.find(g => g.id === dietGoal)?.emoji} {dietGoals.find(g => g.id === dietGoal)?.label}
                </div>
              </div>

              {/* Image and Summary Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 border-b border-slate-700">
                {/* Left: Image */}
                <div className="relative h-64 md:h-auto min-h-[300px] bg-slate-900/50">
                  {recipeImage ? (
                    <img src={recipeImage} alt={recipeResult.title} className="w-full h-full object-cover" />
                  ) : isAnalyzing ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <RefreshCw size={32} className="animate-spin text-orange-500" />
                      <p className="text-sm text-slate-500 font-medium tracking-wide">Görsel hazırlanıyor...</p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-700">
                      <Utensils size={48} />
                    </div>
                  )}
                </div>

                {/* Right: Dish Names */}
                <div className="p-8 bg-slate-800/30 flex flex-col justify-center space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-orange-500/80">Hazırlanacak Yemekler</h4>
                    <ul className="space-y-3">
                      {recipeResult.dishes.map((dish, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-lg text-slate-100 font-semibold">
                          <div className="w-2 h-2 rounded-full bg-orange-500" />
                          {dish}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <span className="bg-orange-500/10 text-orange-500 px-3 py-1 rounded-lg text-xs font-bold border border-orange-500/20">
                      {dietGoals.find(g => g.id === dietGoal)?.label}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="prose prose-invert prose-orange max-w-none leading-relaxed prose-headings:text-orange-100 prose-p:text-slate-300 prose-li:text-slate-300">
                  <ReactMarkdown>{recipeResult.content}</ReactMarkdown>
                </div>
                
                <div className="pt-8 border-t border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-6">
                  <button 
                    onClick={() => { setRecipeResult(null); setRecipeImage(null); }}
                    className="w-full sm:w-auto px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} /> Yeni Tarifler Oluştur
                  </button>
                </div>
              </div>
            </motion.div>
          ) : analysis ? (
            <motion.div
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12"
            >
              {/* Left Column: Image or Text Summary */}
              <div className="space-y-6">
                {activeTab === 'image' && image ? (
                  <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-slate-800 border border-slate-700">
                    <img 
                      src={image} 
                      alt="Yemek" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : (
                  <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-sm min-h-[200px] flex flex-col justify-center">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Girilen Öğün</h3>
                    <p className="text-xl font-medium text-slate-200 italic">"{manualText}"</p>
                  </div>
                )}

                <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 shadow-sm space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Tespit Edilenler</h3>
                  <div className="flex flex-wrap gap-2">
                    {analysis.items.map((item, i) => (
                      <span key={i} className="px-3 py-1 bg-slate-700 rounded-full text-sm font-medium text-slate-200">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Results */}
              <div className="space-y-8">
                {/* Nutrition Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Kalori', value: analysis.nutrition.calories, unit: 'kcal', color: 'bg-orange-500' },
                    { label: 'Protein', value: analysis.nutrition.protein, unit: 'g', color: 'bg-blue-500' },
                    { label: 'Karbonhidrat', value: analysis.nutrition.carbs, unit: 'g', color: 'bg-green-500' },
                    { label: 'Yağ', value: analysis.nutrition.fats, unit: 'g', color: 'bg-yellow-500' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-slate-800/50 p-5 rounded-3xl border border-slate-700/50 shadow-sm group hover:border-orange-500/30 transition-colors">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">{stat.label}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-slate-100">{stat.value}</span>
                        <span className="text-sm text-slate-500 font-medium">{stat.unit}</span>
                      </div>
                      <div className="mt-3 h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: '70%' }}
                          className={cn("h-full rounded-full", stat.color)}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Advice Section */}
                <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-sm space-y-4">
                  <div className="flex items-center gap-2 text-orange-500">
                    <Utensils size={20} />
                    <h3 className="font-bold text-lg">Beslenme Tavsiyesi</h3>
                  </div>
                  <div className="prose prose-sm prose-invert max-w-none text-slate-300 leading-relaxed">
                    <ReactMarkdown>{analysis.advice}</ReactMarkdown>
                  </div>
                </div>

                {/* Suggestions */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 px-2">Geliştirme Önerileri</h3>
                  <div className="space-y-3">
                    {analysis.suggestions.map((suggestion, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-orange-500/5 border border-orange-500/10 p-4 rounded-2xl flex items-center gap-3 group hover:bg-orange-500/10 transition-colors"
                      >
                        <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center text-orange-500 shadow-sm">
                          <Plus size={16} />
                        </div>
                        <p className="text-sm font-medium text-orange-100/80">{suggestion}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'image' ? (
            <motion.div
              key="image-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {!image ? (
                <>
                  <div className="text-center space-y-3">
                    <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
                      Öğünlerini takip et, <br />
                      <span className="text-orange-500 text-glow">güvenle kilo al.</span>
                    </h2>
                    <p className="text-slate-400 max-w-lg mx-auto text-lg">
                      Hedeflerine ulaşman için detaylı besin analizi ve özel tavsiyeler almak üzere yemeğinin fotoğrafını yükle.
                    </p>
                  </div>

                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative group cursor-pointer border-2 border-dashed rounded-3xl p-12 transition-all duration-300",
                      dragActive 
                        ? "border-orange-500 bg-orange-500/5" 
                        : "border-slate-800 hover:border-orange-500/50 hover:bg-slate-800/50"
                    )}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                      className="hidden" 
                      accept="image/*"
                    />
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform duration-300">
                        <Camera size={32} />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-medium">Fotoğrafı buraya tıkla veya sürükle</p>
                        <p className="text-sm text-slate-500">JPG, PNG, WEBP desteklenir</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="max-w-md mx-auto space-y-6">
                  <div className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl bg-slate-800 border border-slate-700">
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    {isAnalyzing && (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-4">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                          <RefreshCw size={40} />
                        </motion.div>
                        <p className="font-medium tracking-wide">Analiz ediliyor...</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={analyzeImage}
                    disabled={isAnalyzing}
                    className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-semibold shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isAnalyzing ? 'Analiz Ediliyor...' : 'Fotoğrafı Analiz Et'}
                  </button>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'text' ? (
            <motion.div
              key="text-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-3">
                <h2 className="text-4xl font-bold tracking-tight">
                  Öğününü <span className="text-orange-500">yazarak anlat.</span>
                </h2>
                <p className="text-slate-400 text-lg">
                  Yediğin yiyecekleri ve miktarlarını yaz, senin için besin değerlerini hesaplayalım.
                </p>
              </div>

              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-sm space-y-6">
                <div className="relative">
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Örn: 2 adet yumurta, 1 dilim tam buğday ekmeği, 1 avuç ceviz..."
                    className="w-full h-40 bg-slate-900/50 border border-slate-700 rounded-2xl p-6 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors resize-none pr-14"
                  />
                  <button
                    onClick={() => startListening('manual')}
                    className={cn(
                      "absolute top-4 right-4 p-3 rounded-xl transition-all",
                      isListening ? "bg-red-500 text-white animate-pulse" : "bg-slate-800 text-slate-400 hover:text-orange-500"
                    )}
                  >
                    {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                </div>
                <button
                  onClick={analyzeText}
                  disabled={isAnalyzing || !manualText.trim()}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-semibold shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Hesaplanıyor...
                    </>
                  ) : (
                    <>
                      <Scale size={20} />
                      Kalorileri Hesapla
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50 flex items-start gap-3">
                  <Info size={18} className="text-orange-500 shrink-0 mt-1" />
                  <p className="text-sm text-slate-400">Miktarları belirtmek (gram, adet, porsiyon) daha doğru sonuçlar verir.</p>
                </div>
                <div className="p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-orange-500 shrink-0 mt-1" />
                  <p className="text-sm text-slate-400">Yapay zekamız yiyeceklerin ortalama besin değerlerini anında hesaplar.</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="recipe-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-3">
                <h2 className="text-4xl font-bold tracking-tight">
                  Malzemeleri yaz, <span className="text-orange-500">tarifini bul.</span>
                </h2>
                <p className="text-slate-400 text-lg">
                  Elindeki malzemelere ve hedefine göre sana özel yemek tarifleri.
                </p>
              </div>

              <div className="bg-slate-800/50 p-8 rounded-3xl border border-slate-700/50 shadow-sm space-y-6">
                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Diyet Hedefin</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dietGoals.map((goal) => (
                      <button
                        key={goal.id}
                        onClick={() => setDietGoal(goal.id)}
                        className={cn(
                          "px-4 py-3 rounded-xl text-sm font-medium transition-all text-left flex items-center gap-3 border",
                          dietGoal === goal.id 
                            ? "bg-orange-500 border-orange-400 text-white shadow-lg" 
                            : "bg-slate-900/50 border-slate-700 text-slate-400 hover:border-slate-600"
                        )}
                      >
                        <span className="text-lg">{goal.emoji}</span>
                        {goal.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">Eldeki Malzemeler</label>
                  <div className="relative">
                    <textarea
                      value={ingredients}
                      onChange={(e) => setIngredients(e.target.value)}
                      placeholder="Örn: Tavuk göğsü, brokoli, pirinç, zeytinyağı..."
                      className="w-full h-32 bg-slate-900/50 border border-slate-700 rounded-2xl p-6 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors resize-none pr-14"
                    />
                    <button
                      onClick={() => startListening('ingredients')}
                      className={cn(
                        "absolute top-4 right-4 p-3 rounded-xl transition-all",
                        isListening ? "bg-red-500 text-white animate-pulse" : "bg-slate-800 text-slate-400 hover:text-orange-500"
                      )}
                    >
                      {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={generateRecipe}
                  disabled={isAnalyzing || !ingredients.trim()}
                  className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl font-semibold shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Tarifler Hazırlanıyor...
                    </>
                  ) : (
                    <>
                      <Utensils size={20} />
                      Tarifleri Oluştur
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="max-w-md mx-auto mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-4">
          <p className="text-sm text-slate-500">
            NutriGain Assistant &copy; 2026. Yapay zeka destekli besin tahminleri.
          </p>
          <div className="flex items-center justify-center gap-6 text-xs font-medium text-slate-600 uppercase tracking-widest">
            <span>Doğruluk: ~%85</span>
            <span>Kilo Alımı Odaklı</span>
            <span>Önce Gizlilik</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
