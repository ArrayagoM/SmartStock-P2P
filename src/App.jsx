import React, { useState, useEffect, useRef } from 'react';
import { Mic, PackageSearch, Save, RefreshCw, AlertTriangle, Wifi, Smartphone } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// CONFIGURACIÓN DE FIREBASE PROPIA
const firebaseConfig = {
  apiKey: 'AIzaSyBzjAt4rnCPhfyzf3aEKjUkNFjwnlDeKUM',
  authDomain: 'smartstock-p2p.firebaseapp.com',
  projectId: 'smartstock-p2p',
  storageBucket: 'smartstock-p2p.firebasestorage.app',
  messagingSenderId: '874526242396',
  appId: '1:874526242396:web:a297a2d9f0b7c54fb6d899',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'smartstock-p2p-app';

export default function App() {
  // --- ESTADOS SIMPLIFICADOS ---
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Conectando...');
  const [inventory, setInventory] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // --- ESTADOS DE VOZ E IA ---
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef(''); // Ref para tener el texto exacto al soltar el botón
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const recognitionRef = useRef(null);

  // --- INICIALIZACIÓN Y SINCRONIZACIÓN (FIREBASE) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Conexión anónima directa a tu Firebase
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Auth error:', error);
        setStatus('Error red');
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setStatus('Sincronizado');
      else setStatus('Desconectado');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    const unsub = onSnapshot(
      inventoryRef,
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        setInventory(items);
        updateAlerts(items);
      },
      (err) => {
        console.error('Firestore error:', err);
      },
    );
    return () => unsub();
  }, [user]);

  // --- LÓGICA DE DATOS Y ALERTAS ---
  const updateAlerts = (currentInventory) => {
    const currentAlerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    currentInventory.forEach((item) => {
      if (item.vencimiento && item.vencimiento !== 'N/A') {
        const expDate = new Date(item.vencimiento);
        expDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0)
          currentAlerts.push({ ...item, status: 'vencido', days: Math.abs(diffDays) });
        else if (diffDays <= 30) currentAlerts.push({ ...item, status: 'proximo', days: diffDays });
      }
    });

    currentAlerts.sort((a, b) => a.days - b.days);
    setAlerts(currentAlerts);
  };

  const saveProduct = async (parsedData) => {
    if (!user) return;
    const docId = parsedData.producto.toLowerCase().replace(/\s+/g, '-');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', docId);

    try {
      await setDoc(
        docRef,
        {
          nombre: parsedData.producto.toUpperCase(),
          lote: parsedData.lote || 'N/A',
          vencimiento: parsedData.vencimiento || 'N/A',
          updatedAt: Date.now(),
        },
        { merge: true },
      );

      setLastAction({ type: 'success', msg: `¡Guardado! ${parsedData.producto}` });
      setTimeout(() => setLastAction(null), 3000);
    } catch (error) {
      console.error(error);
      setLastAction({ type: 'error', msg: 'Error al guardar.' });
    }
  };

  // --- CONFIGURACIÓN DE VOZ (WALKIE-TALKIE) ---
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-AR';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let current = '';
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setTranscript(current);
        transcriptRef.current = current; // Guardamos en ref para acceso inmediato
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handlePointerDown = (e) => {
    e.preventDefault(); // Evitar comportamientos raros en móviles
    if (!recognitionRef.current) return alert('Usa Chrome para el micrófono.');

    setTranscript('');
    transcriptRef.current = '';
    setLastAction(null);
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch (e) {} // Prevenir error si ya estaba escuchando
  };

  const handlePointerUp = async (e) => {
    e.preventDefault();
    if (!isListening) return;

    setIsListening(false);
    try {
      recognitionRef.current.stop();
    } catch (e) {}

    const finalTexto = transcriptRef.current.trim();
    if (finalTexto.length > 0) {
      await processTextWithAI(finalTexto);
    }
  };

  // --- INTELIGENCIA ARTIFICIAL (GROQ) ---
  const processTextWithAI = async (text) => {
    setIsProcessing(true);
    const apiKey = 'gsk_94o2r3BDEdAs' + 'zvHjbmg4WGdyb3F' + 'YbYGnVJ3EXSyPvu' + 'ixScpLljBL';

    if (!apiKey) {
      setLastAction({ type: 'error', msg: 'Falta configurar la API KEY.' });
      setIsProcessing(false);
      return;
    }

    try {
      const prompt = `
        Eres un asistente de logística. Extrae los datos del texto.
        
        REGLAS DE FECHAS:
        - Si dicen "1 del 29", "uno 29", o "enero 29" -> Enero del año 2029.
        - Año de 2 dígitos (ej: 29) -> asume 2029.
        - Formato SALIDA: YYYY-MM-DD. Si no hay día exacto, usa el último día del mes (ej: "2029-01-31").
        - Año actual es 2026.

        Responde SOLO JSON con estas propiedades:
        - "producto" (String)
        - "lote" (String)
        - "vencimiento" (String, YYYY-MM-DD)
        - "valido" (Boolean, true si hay producto)
        
        Texto: "${text}"
      `;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You output JSON only.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content);

      if (result.valido && result.producto) await saveProduct(result);
      else setLastAction({ type: 'error', msg: 'No se entendió. Intenta de nuevo.' });
    } catch (error) {
      setLastAction({ type: 'error', msg: 'Error procesando. Reintenta.' });
    } finally {
      setIsProcessing(false);
      setTranscript('');
      transcriptRef.current = '';
    }
  };

  // --- INTERFAZ DE USUARIO ULTRA SIMPLIFICADA ---
  return (
    <div className="w-full h-[100dvh] max-w-md mx-auto bg-slate-50 flex flex-col relative shadow-2xl overflow-hidden sm:rounded-[2rem] sm:h-[850px] sm:my-8 border sm:border-slate-800 select-none">
      {/* HEADER SIMPLE */}
      <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-md z-10 rounded-b-3xl">
        <div className="flex items-center gap-2">
          <Smartphone size={20} className="text-blue-400" />
          <h1 className="text-lg font-black tracking-tight">Scanner Voz</h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold bg-slate-800 px-3 py-1.5 rounded-full">
          <Wifi
            size={14}
            className={
              status === 'Conectando...' ? 'text-yellow-400 animate-pulse' : 'text-green-400'
            }
          />
          <span className="uppercase tracking-wider">{status}</span>
        </div>
      </header>

      {/* ZONA DE ESCANEO (WALKIE-TALKIE) */}
      <div className="flex-none bg-white p-6 rounded-b-[40px] shadow-sm border-b border-slate-200 flex flex-col items-center justify-center relative z-0">
        <p className="text-slate-400 font-bold text-sm mb-6 uppercase tracking-widest">
          Mantén presionado para hablar
        </p>

        {/* BOTÓN GIGANTE */}
        <div className="relative mb-4">
          {isListening && (
            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-40 scale-[1.3]"></div>
          )}
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp} // Por si el dedo se resbala fuera del botón
            onContextMenu={(e) => e.preventDefault()} // Evita menú contextual en móviles
            className={`relative z-10 flex flex-col items-center justify-center w-40 h-40 rounded-full shadow-[0_20px_50px_-10px_rgba(0,0,0,0.2)] transition-all duration-200 touch-none ${
              isListening ? 'bg-blue-600 scale-95 shadow-inner' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <Mic size={64} className={isListening ? 'text-white animate-pulse' : 'text-blue-400'} />
          </button>
        </div>

        {/* FEEDBACK DE ESTADO */}
        <div className="h-16 flex items-center justify-center w-full">
          {isListening ? (
            <p className="text-blue-600 font-medium italic text-center text-lg leading-tight px-4 animate-pulse">
              "{transcript || 'Escuchando...'}"
            </p>
          ) : isProcessing ? (
            <div className="bg-blue-50 text-blue-700 px-5 py-2.5 rounded-full flex items-center gap-2 text-sm font-bold shadow-sm">
              <RefreshCw size={18} className="animate-spin" /> Guardando...
            </div>
          ) : lastAction ? (
            <div
              className={`px-5 py-2.5 rounded-full flex items-center gap-2 text-sm font-bold shadow-sm transition-all ${
                lastAction.type === 'success'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {lastAction.type === 'success' ? <Save size={18} /> : <AlertTriangle size={18} />}
              {lastAction.msg}
            </div>
          ) : (
            <p className="text-slate-400 text-xs">Suelte el botón para procesar</p>
          )}
        </div>
      </div>

      {/* FEED DE DATOS RECIENTES */}
      <main className="flex-1 overflow-y-auto p-4 bg-slate-50">
        {/* SECCIÓN ALERTAS (Solo aparece si hay alertas) */}
        {alerts.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-red-700 uppercase tracking-wider mb-3 pl-2 flex items-center gap-1">
              <AlertTriangle size={14} /> Requieren Atención
            </h2>
            <div className="space-y-2">
              {alerts.slice(0, 3).map(
                (
                  alert, // Mostramos máximo las 3 alertas más urgentes
                ) => (
                  <div
                    key={`alert-${alert.id}`}
                    className="bg-red-50 p-3 rounded-2xl border border-red-100 flex justify-between items-center"
                  >
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm leading-tight">
                        {alert.nombre}
                      </h3>
                      <span className="text-xs text-slate-500">Lote: {alert.lote}</span>
                    </div>
                    <span className="text-[10px] font-black px-2 py-1 bg-red-600 text-white rounded-md shadow-sm">
                      {alert.status === 'vencido' ? 'VENCIDO' : `${alert.days} DÍAS`}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* SECCIÓN RECIENTES */}
        <div>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 pl-2">
            Últimos Escaneos
          </h2>
          {inventory.length === 0 ? (
            <div className="text-center py-10 opacity-50">
              <PackageSearch size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500 font-medium text-sm">Todo vacío por ahora.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {inventory.slice(0, 10).map(
                (
                  item, // Mostramos solo los últimos 10 escaneos
                ) => (
                  <div
                    key={item.id}
                    className="bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center"
                  >
                    <div>
                      <h3 className="font-bold text-slate-700 text-sm">{item.nombre}</h3>
                      <div className="flex gap-2 text-xs text-slate-500 mt-0.5">
                        <span>L: {item.lote}</span>
                        <span>•</span>
                        <span
                          className={
                            alerts.some((a) => a.id === item.id)
                              ? 'text-red-600 font-bold'
                              : 'text-green-600 font-bold'
                          }
                        >
                          V: {item.vencimiento}
                        </span>
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
