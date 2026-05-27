import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, PackageSearch, Save, RefreshCw, AlertTriangle, Wifi, 
  Smartphone, Search, Edit2, Trash2, X, Bell 
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// CONFIGURACIÓN DE FIREBASE (Adaptada para compatibilidad global, reemplaza con tus datos en tu entorno local)
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'smartstock-p2p-app';

export default function App() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('Conectando...');
  const [inventory, setInventory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de IA y Voz
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const transcriptRef = useRef('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  
  // Estados UI y Edición
  const [editingItem, setEditingItem] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const recognitionRef = useRef(null);

  // --- FIREBASE INIT ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Auth error:', error);
        setStatus('Error red');
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStatus(u ? 'Sincronizado' : 'Desconectado');
    });
    return () => unsubscribe();
  }, []);

  // --- FIREBASE SUBSCRIPTION ---
  useEffect(() => {
    if (!user) return;
    const inventoryRef = collection(db, 'artifacts', appId, 'public', 'data', 'inventory');
    
    const unsub = onSnapshot(inventoryRef, (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      setInventory(items);
      updateAlerts(items);
    }, (err) => console.error('Firestore error:', err));
    
    return () => unsub();
  }, [user]);

  // --- PEDIR PERMISO NOTIFICACIONES ---
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      }
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setLastAction({ type: 'error', msg: 'Notificaciones no soportadas.' });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      setLastAction({ type: 'success', msg: 'Notificaciones activadas.' });
      new Notification('SmartStock', { body: 'Las notificaciones están funcionando.' });
    }
  };

  const triggerNotification = (title, body) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  // --- LÓGICA DE ALERTAS ---
  const updateAlerts = (currentInventory) => {
    const currentAlerts = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let hasNewExpirations = false;

    currentInventory.forEach((item) => {
      if (item.vencimiento && item.vencimiento !== 'N/A') {
        const expDate = new Date(item.vencimiento);
        expDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          currentAlerts.push({ ...item, status: 'vencido', days: Math.abs(diffDays) });
          hasNewExpirations = true;
        }
        else if (diffDays <= 30) {
          currentAlerts.push({ ...item, status: 'proximo', days: diffDays });
        }
      }
    });

    currentAlerts.sort((a, b) => a.days - b.days);
    setAlerts(currentAlerts);

    // Si hay productos recién vencidos detectados y las notificaciones están activas (Podría optimizarse para no spamear)
    if (hasNewExpirations && currentAlerts.length > 0) {
       triggerNotification('¡Alerta de Inventario!', `Tienes ${currentAlerts.filter(a => a.status === 'vencido').length} productos vencidos.`);
    }
  };

  // --- CRUD MANEJO DE DATOS ---
  const saveProduct = async (dataToSave) => {
    if (!user) return;
    
    // Si estamos editando, usamos el ID original, si no, generamos uno nuevo.
    const docId = dataToSave.id || dataToSave.producto.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString().slice(-4);
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'inventory', docId);

    try {
      await setDoc(docRef, {
        nombre: (dataToSave.producto || dataToSave.nombre).toUpperCase(),
        lote: dataToSave.lote || 'N/A',
        vencimiento: dataToSave.vencimiento || 'N/A',
        updatedAt: Date.now(),
      }, { merge: true });

      setLastAction({ type: 'success', msg: `¡Guardado! ${dataToSave.producto || dataToSave.nombre}` });
      setEditingItem(null);
      setTimeout(() => setLastAction(null), 3000);
    } catch (error) {
      console.error(error);
      setLastAction({ type: 'error', msg: 'Error al guardar.' });
    }
  };

  const deleteProduct = async (id) => {
    if (!user) return;
    if (window.confirm('¿Eliminar este producto?')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'inventory', id));
        setLastAction({ type: 'success', msg: 'Producto eliminado.' });
        setTimeout(() => setLastAction(null), 3000);
      } catch (err) {
        setLastAction({ type: 'error', msg: 'Error al eliminar.' });
      }
    }
  };

  // --- CONFIGURACIÓN DE VOZ ---
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
        transcriptRef.current = current;
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handlePointerDown = (e) => {
    e.preventDefault();
    if (!recognitionRef.current) {
      setLastAction({ type: 'error', msg: 'Micrófono no compatible aquí.' });
      return;
    }
    setTranscript('');
    transcriptRef.current = '';
    setLastAction(null);
    setIsListening(true);
    try { recognitionRef.current.start(); } catch (e) {}
  };

  const handlePointerUp = async (e) => {
    e.preventDefault();
    if (!isListening) return;
    setIsListening(false);
    try { recognitionRef.current.stop(); } catch (e) {}

    const finalTexto = transcriptRef.current.trim();
    if (finalTexto.length > 0) {
      await processTextWithAI(finalTexto);
    }
  };

  // --- INTELIGENCIA ARTIFICIAL ---
  const processTextWithAI = async (text) => {
    setIsProcessing(true);
    const apiKey = 'gsk_94o2r3BDEdAs' + 'zvHjbmg4WGdyb3F' + 'YbYGnVJ3EXSyPvu' + 'ixScpLljBL'; // Mantenida como solicitaste

    try {
      const prompt = `
        Eres un asistente de logística experto. Extrae los datos de inventario del texto del usuario.
        
        REGLAS CRÍTICAS DE FECHAS (El año actual es 2026):
        - Si el usuario dice "1/26", "1 del 26", o "enero 26", significa Enero del año 2026.
        - Si el usuario dice "12/28", significa Diciembre de 2028.
        - Un año de 2 dígitos (ej: 26, 27) SIEMPRE asume que es la década de 2000 (2026, 2027).
        - Formato de SALIDA: YYYY-MM-DD. Si no se especifica el día exacto, usa SIEMPRE el último día de ese mes (ej: "2026-01-31").
        - Interpreta desorden. Si dice "lote 123 vencimiento 1/26 paracetamol", asocia bien los campos.

        Responde SOLO JSON con estas propiedades exactas:
        - "producto" (String)
        - "lote" (String)
        - "vencimiento" (String, en formato YYYY-MM-DD, o "N/A")
        - "valido" (Boolean, true si detectaste claramente un producto)
        
        Texto a procesar: "${text}"
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

      if (result.valido && result.producto) {
        await saveProduct(result);
        triggerNotification('Producto Agregado', `${result.producto} (Lote: ${result.lote})`);
      } else {
        setLastAction({ type: 'error', msg: 'No se entendió. Intenta de nuevo.' });
      }
    } catch (error) {
      setLastAction({ type: 'error', msg: 'Error procesando IA.' });
    } finally {
      setIsProcessing(false);
      setTranscript('');
      transcriptRef.current = '';
    }
  };

  // Filtrado de inventario
  const filteredInventory = inventory.filter(item => 
    item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.lote.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full h-[100dvh] max-w-md mx-auto bg-slate-50 flex flex-col relative shadow-2xl overflow-hidden sm:rounded-[2rem] sm:h-[850px] sm:my-8 border sm:border-slate-800 select-none">
      
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-4 flex flex-col gap-3 shadow-md z-10 rounded-b-3xl shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Smartphone size={20} className="text-blue-400" />
            <h1 className="text-lg font-black tracking-tight">SmartStock P2P</h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={requestNotificationPermission}
              className={`p-1.5 rounded-full ${notificationsEnabled ? 'text-green-400 bg-slate-800' : 'text-slate-400 bg-slate-800'}`}
              title="Activar Notificaciones"
            >
              <Bell size={16} />
            </button>
            <div className="flex items-center gap-1.5 text-xs font-bold bg-slate-800 px-3 py-1.5 rounded-full">
              <Wifi size={14} className={status === 'Conectando...' ? 'text-yellow-400 animate-pulse' : 'text-green-400'} />
              <span className="uppercase tracking-wider hidden xs:block">{status}</span>
            </div>
          </div>
        </div>

        {/* BUSCADOR */}
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por producto o lote..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 text-white placeholder-slate-400 text-sm rounded-xl py-2.5 pl-10 pr-4 outline-none border border-slate-700 focus:border-blue-500 transition-colors"
          />
        </div>
      </header>

      {/* ÁREA DE MENSAJES DE ESTADO */}
      <div className="px-4 pt-3 shrink-0 empty:hidden">
        {isListening && (
           <div className="bg-blue-100 text-blue-800 p-3 rounded-xl text-sm font-medium animate-pulse shadow-sm border border-blue-200">
             🎙️ "{transcript || 'Escuchando...'}"
           </div>
        )}
        {isProcessing && (
          <div className="bg-blue-50 text-blue-700 p-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm border border-blue-100">
            <RefreshCw size={18} className="animate-spin" /> Procesando con IA...
          </div>
        )}
        {lastAction && !isProcessing && !isListening && (
          <div className={`p-3 rounded-xl flex items-center gap-2 text-sm font-bold shadow-sm border ${
            lastAction.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {lastAction.type === 'success' ? <Save size={18} /> : <AlertTriangle size={18} />}
            {lastAction.msg}
          </div>
        )}
      </div>

      {/* FEED DE DATOS PRINCIPAL */}
      <main className="flex-1 overflow-y-auto p-4 pb-32"> {/* pb-32 para que el FAB no tape el último elemento */}
        
        {/* ALERTAS */}
        {alerts.length > 0 && !searchTerm && (
          <div className="mb-6">
            <h2 className="text-xs font-black text-red-700 uppercase tracking-wider mb-3 pl-1 flex items-center gap-1">
              <AlertTriangle size={14} /> Urgencias ({alerts.length})
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
              {alerts.map((alert) => (
                <div key={`alert-${alert.id}`} className="min-w-[200px] snap-start bg-red-50 p-3 rounded-2xl border border-red-100 flex flex-col shadow-sm">
                  <div className="flex justify-between items-start mb-1">
                     <h3 className="font-bold text-slate-800 text-sm leading-tight truncate pr-2">{alert.nombre}</h3>
                     <span className="text-[10px] font-black px-1.5 py-0.5 bg-red-600 text-white rounded shadow-sm whitespace-nowrap">
                      {alert.status === 'vencido' ? 'VENCIDO' : `${alert.days}D`}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">Lote: {alert.lote} | V: {alert.vencimiento}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INVENTARIO */}
        <div>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 pl-1">
            {searchTerm ? 'Resultados' : 'Inventario Reciente'}
          </h2>
          
          {filteredInventory.length === 0 ? (
            <div className="text-center py-10 opacity-50">
              <PackageSearch size={40} className="mx-auto text-slate-400 mb-2" />
              <p className="text-slate-500 font-medium text-sm">No hay productos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInventory.map((item) => (
                <div key={item.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group">
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className="font-bold text-slate-700 text-sm truncate">{item.nombre}</h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs mt-1">
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">L: {item.lote}</span>
                      <span className={`px-2 py-0.5 rounded-md font-bold ${
                          alerts.some((a) => a.id === item.id) ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                        V: {item.vencimiento}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditingItem(item)} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-full transition-colors">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteProduct(item.id)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded-full transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* BOTÓN FLOTANTE DE MICRÓFONO (FAB) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
        <div className="relative">
          {isListening && (
            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-40 scale-[1.5]"></div>
          )}
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative z-10 flex items-center justify-center w-20 h-20 rounded-full shadow-[0_10px_25px_-5px_rgba(0,0,0,0.3)] transition-all duration-200 touch-none ${
              isListening ? 'bg-blue-600 scale-95 shadow-inner' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            <Mic size={32} className={isListening ? 'text-white animate-pulse' : 'text-blue-400'} />
          </button>
        </div>
        <span className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest bg-white/80 px-3 py-1 rounded-full shadow-sm backdrop-blur-sm">
          Mantén para dictar
        </span>
      </div>

      {/* MODAL DE EDICIÓN MANUAL */}
      {editingItem && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setEditingItem(null)} 
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 rounded-full"
            >
              <X size={18} />
            </button>
            <h3 className="text-lg font-black text-slate-800 mb-4">Editar Producto</h3>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveProduct({
                id: editingItem.id,
                producto: formData.get('nombre'),
                lote: formData.get('lote'),
                vencimiento: formData.get('vencimiento')
              });
            }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Producto</label>
                <input name="nombre" defaultValue={editingItem.nombre} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Lote</label>
                  <input name="lote" defaultValue={editingItem.lote} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Vencimiento</label>
                  <input type="date" name="vencimiento" defaultValue={editingItem.vencimiento !== 'N/A' ? editingItem.vencimiento : ''} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-blue-500 outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mt-2 flex justify-center items-center gap-2 transition-colors">
                <Save size={18} /> Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}