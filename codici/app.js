// CONFIGURAZIONE SUPABASE
const SUPABASE_URL = 'il_tuo_supabase_account';
const SUPABASE_KEY = 'LA_TUA_CHIAVE_DI_SUPABASE';

// Inizializzazione Client
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Stato Globale
let allCards = [];
let filteredCards = [];
let currentUser = null;
let currentAuthTab = 'login';

// Elementi DOM
const catalogGrid = document.getElementById('catalog-grid');
const searchInput = document.getElementById('search-input');
const expansionFilter = document.getElementById('expansion-filter');
const totalAssetDisplay = document.getElementById('total-asset-value');
const dbStatus = document.getElementById('db-status');
const apiLatency = document.getElementById('api-latency');
const authHeader = document.getElementById('auth-header');
const authModal = document.getElementById('auth-modal');
const registerFields = document.getElementById('register-fields');
const authForm = document.getElementById('auth-form');

// --- LOGICA DI CACHING AVANZATA (Immagini e Dati) ---

/**
 * Converte un URL immagine in Base64 e lo salva localmente.
 * Se l'immagine è già in cache, la restituisce immediatamente.
 */
async function getOrCacheImage(cardId, imageUrl) {
    if (!imageUrl) return '';
    try {
        const cachedImg = await idbKeyval.get(`img_${cardId}`);
        if (cachedImg) return cachedImg;

        // Se non è in cache, scaricala e convertila
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64data = reader.result;
                await idbKeyval.set(`img_${cardId}`, base64data);
                resolve(base64data);
            };
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn("Errore cache immagine per:", cardId, e);
        return imageUrl; // Fallback all'URL originale
    }
}

// --- AUTH LOGIC ---

function initAuth() {
    _supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();
    });
}

function updateAuthUI() {
    if (!authHeader) return;
    if (currentUser) {
        const username = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
        const avatar = currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${username}&background=7200f5&color=fff`;
        authHeader.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="flex flex-col items-end hidden sm:flex">
                    <span class="text-xs font-bold text-white">${username}</span>
                    <button onclick="handleLogout()" class="text-[10px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors">Esci</button>
                </div>
                <div class="h-10 w-10 rounded-full border-2 border-primary/40 p-0.5 overflow-hidden">
                    <img src="${avatar}" class="h-full w-full rounded-full object-cover">
                </div>
            </div>`;
    } else {
        authHeader.innerHTML = `
            <button onclick="openAuthModal()" class="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary hover:text-white transition-all text-sm font-semibold">
                Accedi
            </button>`;
    }
}

function openAuthModal() { authModal.classList.remove('hidden'); switchAuthTab('login'); }
function closeAuthModal() { authModal.classList.add('hidden'); }

function switchAuthTab(tab) {
    currentAuthTab = tab;
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    if (tab === 'login') {
        registerFields.classList.add('hidden');
        tabLogin.className = "flex-1 py-4 text-sm font-bold border-b-2 border-primary text-white";
        tabRegister.className = "flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-white transition-colors";
    } else {
        registerFields.classList.remove('hidden');
        tabLogin.className = "flex-1 py-4 text-sm font-bold border-b-2 border-transparent text-slate-400 hover:text-white transition-colors";
        tabRegister.className = "flex-1 py-4 text-sm font-bold border-b-2 border-primary text-white";
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('auth-submit-btn');
    btn.classList.add('btn-loading');
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const username = document.getElementById('auth-username').value;
    try {
        if (currentAuthTab === 'register') {
            const { error } = await _supabase.auth.signUp({
                email, password, options: { data: { username } }
            });
            if (error) throw error;
            showNotification("Controlla l'email per confermare!");
        } else {
            const { error } = await _supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            showNotification("Accesso effettuato!");
        }
        closeAuthModal();
    } catch (error) {
        showNotification(error.message, 'error');
    } finally {
        btn.classList.remove('btn-loading');
    }
}

async function handleLogout() {
    const { error } = await _supabase.auth.signOut();
    if (error) showNotification(error.message, 'error');
    else showNotification("Logout effettuato.");
}

// --- MARKETPLACE LOGIC ---

async function fetchCards() {
    const startTime = performance.now();
    
    // 1. CARICAMENTO IMMEDIATO DALLA CACHE (IndexedDB)
    try {
        const cachedData = await idbKeyval.get('tcg_local_cards');
        if (cachedData) {
            allCards = cachedData;
            applyFilters();
            if (apiLatency) apiLatency.innerText = `Cached`;
        }
    } catch (e) { console.error("Errore lettura cache", e); }

    // 2. RECUPERO DATI DA SUPABASE
    try {
        const { data: cards, error } = await _supabase
            .from('inventario_asset')
            .select('*')
            .eq('stato', 'Disponibile')
            .order('nome_carta', { ascending: true });

        if (error) throw error;

        // 3. CONTROLLO NOVITÀ E CACHING IMMAGINI
        // Confrontiamo i dati nuovi con quelli vecchi per evitare lavoro inutile
        const currentDataString = JSON.stringify(allCards.map(c => ({id: c.id, stato: c.stato})));
        const newDataString = JSON.stringify(cards.map(c => ({id: c.id, stato: c.stato})));

        if (currentDataString !== newDataString) {
            console.log("Nuovi dati rilevati, aggiorno immagini e cache...");
            
            // Per ogni carta, gestiamo l'immagine locale
            const processedCards = await Promise.all(cards.map(async (card) => {
                const localImg = await getOrCacheImage(card.id, card.url_immagine);
                return { ...card, local_img: localImg };
            }));

            allCards = processedCards;
            await idbKeyval.set('tcg_local_cards', allCards);
            applyFilters();
        }

        const endTime = performance.now();
        if (apiLatency) apiLatency.innerText = `${(endTime - startTime).toFixed(0)}ms`;
        if (dbStatus) {
            dbStatus.innerText = 'Online';
            dbStatus.className = 'text-[10px] text-green-500 font-bold uppercase';
        }
        populateExpansions(allCards);

    } catch (error) {
        if (dbStatus) {
            dbStatus.innerText = 'Offline';
            dbStatus.className = 'text-[10px] text-red-500 font-bold uppercase';
        }
        if (allCards.length === 0) showNotification("Errore database", "error");
    }
}

function populateExpansions(cards) {
    if (!expansionFilter) return;
    const current = expansionFilter.value;
    const exps = [...new Set(cards.map(c => c.espansione))].sort();
    expansionFilter.innerHTML = '<option value="Tutte le espansioni">Tutte le espansioni</option>' +
        exps.map(exp => `<option value="${exp}" ${exp === current ? 'selected' : ''}>${exp}</option>`).join('');
}

function updateStats(cards) {
    if (!totalAssetDisplay) return;
    const total = cards.reduce((sum, card) => sum + (Number(card.prezzo_negozio) || 0), 0);
    totalAssetDisplay.innerText = `€${total.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;
}

function applyFilters() {
    const search = searchInput?.value.toLowerCase() || "";
    const ex = expansionFilter?.value || "Tutte le espansioni";

    filteredCards = allCards.filter(card => {
        const matchSearch = card.nome_carta.toLowerCase().includes(search) || card.espansione.toLowerCase().includes(search);
        const matchEx = ex === "Tutte le espansioni" || card.espansione === ex;
        return matchSearch && matchEx;
    });

    updateStats(filteredCards);
    renderCards(filteredCards);
}

function renderCards(cards) {
    if (!catalogGrid) return;
    if (cards.length === 0) {
        catalogGrid.innerHTML = `<div class="col-span-full py-20 text-center animate-pulse"><p class="text-slate-500">Nessun risultato.</p></div>`;
        return;
    }

    catalogGrid.innerHTML = cards.map(card => {
        const isDeal = card.prezzo_mercato && (Number(card.prezzo_negozio) < Number(card.prezzo_mercato));
        // Usiamo local_img se disponibile, altrimenti l'URL originale
        const displayImg = card.local_img || card.url_immagine;
        
        return `
            <div class="card-gradient group relative flex flex-col bg-slate-100 dark:bg-card-dark border ${isDeal ? 'border-accent-blue/50 shadow-[0_0_15px_rgba(0,212,255,0.2)]' : 'border-slate-200 dark:border-border-dark'} rounded-xl overflow-hidden transition-all duration-300">
                ${isDeal ? `<div class="absolute top-4 left-4 z-10"><div class="badge-glow bg-accent-blue text-slate-900 text-[10px] font-black px-2.5 py-1 rounded shadow-lg uppercase">Affare</div></div>` : ''}
                <div class="relative aspect-[3/4] bg-slate-800">
                    <img src="${displayImg}" class="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-700 img-fade-in">
                </div>
                <div class="p-5 flex flex-col flex-1">
                    <h3 class="text-lg font-bold text-white mb-1">${card.nome_carta}</h3>
                    <p class="text-xs text-slate-400 mb-4">${card.espansione}</p>
                    <div class="bg-slate-200/50 dark:bg-background-dark/50 p-3 rounded-lg mb-5">
                        <div class="flex justify-between text-sm font-bold"><span>Prezzo</span><span>€${Number(card.prezzo_negozio).toFixed(2)}</span></div>
                    </div>
                    <button onclick="buyCard('${card.id}', '${card.nome_carta.replace(/'/g, "\\'")}')" class="w-full py-3 bg-primary text-white rounded-lg font-bold text-sm">ACQUISTA ORA</button>
                </div>
            </div>`;
    }).join('');
}

async function buyCard(id, name) {
    if (!currentUser) {
        showNotification("Devi accedere per acquistare!", "error");
        openAuthModal();
        return;
    }
    if (!confirm(`Confermi l'acquisto di ${name}?`)) return;
    try {
        const { error } = await _supabase.from('inventario_asset').update({ stato: 'Venduto' }).eq('id', id);
        if (error) throw error;
        showNotification("Acquisto completato!");
        fetchCards(); // Aggiorna dopo l'acquisto
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

function setupRealtime() {
    _supabase.channel('realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'inventario_asset' }, () => fetchCards()).subscribe();
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-symbols-outlined ${type === 'success' ? 'text-green-500' : 'text-red-500'}">${type === 'success' ? 'check_circle' : 'error'}</span><span class="text-sm font-medium">${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Event Listeners
if (searchInput) searchInput.addEventListener('input', applyFilters);
if (expansionFilter) expansionFilter.addEventListener('change', applyFilters);

// --- CSV UPLOAD LOGIC ---

function triggerCsvUpload() {
    if (!currentUser) {
        showNotification("Devi accedere!", "error");
        openAuthModal();
        return;
    }
    document.getElementById('csv-input').click();
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    if (!file.name.endsWith('.csv')) {
        showNotification("Seleziona un CSV valido.", "error");
        return;
    }
    await uploadCsv(file);
}

async function uploadCsv(file) {
    const WEBHOOK_URL = 'http://localhost:5678/webhook-test/import-csv';
    const uploadBtn = document.querySelector('button[onclick="triggerCsvUpload()"]');
    if (uploadBtn) uploadBtn.classList.add('btn-loading');
    const formData = new FormData();
    formData.append('email', currentUser.email);
    formData.append('data', file);
    try {
        const response = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
        showNotification("File inviato! Il Digital Twin si sta aggiornando.");
    } catch (error) {
        showNotification("Errore invio: " + error.message, 'error');
    } finally {
        if (uploadBtn) uploadBtn.classList.remove('btn-loading');
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    fetchCards();
    setupRealtime();
});

/**
 * Cancella tutta la cache locale (immagini e dati) e ricarica la pagina.
 * Utile in caso di errori di sincronizzazione o per forzare il download.
 */
async function clearLocalCache() {
    if (!confirm("Sei sicuro di voler svuotare la cache? Tutte le immagini verranno riscaricate al prossimo avvio.")) return;
    
    try {
        const storageBtn = document.querySelector('button[onclick="clearLocalCache()"]');
        if (storageBtn) storageBtn.classList.add('animate-spin');

        // Cancella tutto il database locale
        await idbKeyval.clear();
        
        showNotification("Cache svuotata con successo!", "success");
        
        // Ricarica la pagina dopo un breve delay
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (error) {
        console.error("Errore durante il reset della cache:", error);
        showNotification("Errore nel reset della cache", "error");
    }
}
