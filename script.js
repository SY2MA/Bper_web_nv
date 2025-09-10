document.addEventListener('DOMContentLoaded', () => {

    const App = {
        state: {
            appData: {},
            balancesVisible: true,
            editMode: false,
            profileClickTimestamps: [], 
            currentFilter: 'all',
            currentSort: 'date_desc',
            activePopup: null,
            isDragging: false,
            dragStartY: 0,
            currentTranslateY: 0
        },

        DOM: {
            body: document.body,
            mainContent: document.getElementById('main-content'),
            header: document.querySelector('.app-header'),
            navTabs: document.querySelector('.nav-tabs'),
            contentSections: document.querySelectorAll('.content-section'),
            mainTransactionsList: document.getElementById('main-transactions-list'),
            allTransactionsList: document.getElementById('all-transactions-list'),
            searchInput: document.getElementById('transaction-search-input'),
            clearSearchBtn: document.querySelector('.clear-search-btn'),
            editModeBanner: document.getElementById('edit-mode-banner'),
            modalBackdrop: document.getElementById('modal-backdrop'),
            txDetailPopup: document.getElementById('transaction-detail-popup'),
            sortOptionsPopup: document.getElementById('sort-options-popup'),
            toast: document.getElementById('toast-notification'),
            txTemplate: document.getElementById('transaction-item-template'),
            allTransactionsScreen: document.getElementById('all-transactions-content'),
            fileImporter: document.getElementById('file-importer'),
        },

        config: {
            STORAGE_KEY: 'bperCloneData_final',
            categoryIcons: { 'payment': 'fa-solid fa-credit-card', 'salary': 'fa-solid fa-briefcase', 'groceries': 'fa-solid fa-cart-shopping', 'default': 'fa-solid fa-receipt', 'transfer_in': 'fa-solid fa-arrow-down' },
            TRIPLE_TAP_TIMEOUT: 600,
        },

        init() {
            this.loadData();
            this.updateUIFromData();
            this.bindEvents();
            this.toggleEditMode(false); 
            setTimeout(() => {
                this.DOM.body.querySelector('.loader').style.display = 'none';
                this.DOM.body.querySelector('.transactions-card-wrapper').style.display = 'block';
                this.render();
            }, 500);
            this.updateBalanceDate();
        },

        loadData() {
            const savedData = localStorage.getItem(this.config.STORAGE_KEY);
            if (savedData) {
                this.state.appData = JSON.parse(savedData);
                if (this.state.appData.transactions) {
                    this.state.appData.transactions.forEach(tx => {
                        tx.accountingDate = new Date(tx.accountingDate);
                        tx.currencyDate = new Date(tx.currencyDate);
                    });
                }
            } else {
                this.state.appData = {
                    accountTitle: 'Conto Corrente', accountHolder: 'Mario Rossi', iban: 'IT60X0538703202000000123456', balance: 0, transactions: []
                };
                this.saveData();
            }
        },

        saveData() {
            localStorage.setItem(this.config.STORAGE_KEY, JSON.stringify(this.state.appData));
        },
        
        bindEvents() {
            this.DOM.body.addEventListener('click', e => {
                const actionElement = e.target.closest('[data-action]');
                if (actionElement) {
                    const action = actionElement.dataset.action;
                    if (this.actions[action]) this.actions[action].call(this, e);
                }
            });

            this.DOM.body.addEventListener('touchstart', e => {
                const actionElement = e.target.closest('[data-action="handleProfileClick"]');
                if (actionElement) {
                    e.preventDefault();
                    this.actions.handleProfileClick.call(this, e);
                }
            }, { passive: false });
            
            this.DOM.modalBackdrop.addEventListener('click', () => {
                if (this.state.activePopup) {
                    this.hidePopup(this.state.activePopup);
                }
            });

            const popups = [this.DOM.txDetailPopup, this.DOM.sortOptionsPopup];
            popups.forEach(popup => {
                popup.addEventListener('mousedown', this.handleDragStart.bind(this));
                popup.addEventListener('touchstart', this.handleDragStart.bind(this));
            });
            document.addEventListener('mousemove', this.handleDragMove.bind(this));
            document.addEventListener('touchmove', this.handleDragMove.bind(this));
            document.addEventListener('mouseup', this.handleDragEnd.bind(this));
            document.addEventListener('touchend', this.handleDragEnd.bind(this));

            this.DOM.navTabs.addEventListener('click', e => {
                const navTab = e.target.closest('.nav-tab');
                if (navTab) {
                    this.DOM.navTabs.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                    navTab.classList.add('active');
                    const targetId = navTab.dataset.target;
                    this.DOM.contentSections.forEach(section => {
                        section.classList.toggle('active-content', section.id === targetId);
                    });
                }
            });

            this.DOM.mainContent.addEventListener('scroll', () => this.DOM.header.classList.toggle('scrolled', this.DOM.mainContent.scrollTop > 10));
            this.DOM.searchInput.addEventListener('input', () => this.renderAllTransactions());
            this.DOM.clearSearchBtn.addEventListener('click', () => { this.DOM.searchInput.value = ''; this.renderAllTransactions(); });
            this.DOM.body.querySelector('.all-transactions-tabs').addEventListener('click', e => {
                if (e.target.classList.contains('tab')) {
                    this.DOM.body.querySelectorAll('.all-transactions-tabs .tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    this.state.currentFilter = e.target.dataset.filter;
                    this.renderAllTransactions();
                }
            });
            this.DOM.fileImporter.addEventListener('change', this.handleFileUpload.bind(this));
        },
        
        actions: {
            handleProfileClick() {
                const now = Date.now();
                this.state.profileClickTimestamps.push(now);
                this.state.profileClickTimestamps = this.state.profileClickTimestamps.filter(
                    timestamp => now - timestamp < this.config.TRIPLE_TAP_TIMEOUT
                );
                if (this.state.profileClickTimestamps.length >= 3) {
                    this.toggleEditMode();
                    this.state.profileClickTimestamps = []; 
                }
            },
            exitEditMode() { this.toggleEditMode(false); },
            toggleBalanceVisibility() {
                this.state.balancesVisible = !this.state.balancesVisible;
                this.updateUIFromData(); this.render();
                document.getElementById('toggle-all-visibility').className = `toggle-icon fa-solid ${this.state.balancesVisible ? 'fa-eye-slash' : 'fa-eye'}`;
            },
            copyIban() { navigator.clipboard.writeText(this.state.appData.iban.replace(/\s/g, '')).then(() => this.showToast('IBAN copiato!')); },
            showAllTransactions() { this.DOM.allTransactionsScreen.classList.add('active'); },
            hideAllTransactions() { this.DOM.allTransactionsScreen.classList.remove('active'); },
            addTransaction() {
                const newTransaction = { id: 'tx_' + Date.now(), accountingDate: new Date(), currencyDate: new Date(), name: 'Nuova Transazione', type: 'PAGAMENTO', amount: -10.00, details: 'Aggiunto manualmente', category: 'payment' };
                this.state.appData.transactions.unshift(newTransaction);
                this.recalculateBalance();
                this.saveData(); this.updateUIFromData(); this.render();
                this.showToast('Nuova transazione aggiunta!');
            },
            importTransactions() { this.DOM.fileImporter.click(); },
            exportTransactions() {
                const transactions = this.state.appData.transactions;
                if (transactions.length === 0) {
                    this.showToast('Nessuna transazione da esportare.', 'warning');
                    return;
                }
                const header = ['Data operazione', 'Data valuta', 'Descrizione', 'Entrate', 'Uscite', 'Categoria'];
                const data = transactions.map(tx => {
                    const isIncome = tx.amount > 0;
                    return [
                        new Date(tx.accountingDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric'}),
                        new Date(tx.currencyDate).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric'}),
                        tx.name,
                        isIncome ? tx.amount.toFixed(2).replace('.', ',') : '',
                        !isIncome ? Math.abs(tx.amount).toFixed(2).replace('.', ',') : '',
                        tx.type 
                    ];
                });
                const sheetData = [header, ...data];
                const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimenti Conto');
                XLSX.writeFile(workbook, 'BPER_movimenti_export.xlsx');
                this.showToast('Transazioni esportate con successo!');
            },
            deleteAllTransactions() {
                if (!confirm('ATTENZIONE: Stai per eliminare TUTTE le transazioni. Sei sicuro?')) return;
                const confirmationText = prompt('Questa azione è irreversibile. Scrivi "ELIMINA" in maiuscolo per confermare.');
                if (confirmationText === 'ELIMINA') {
                    this.state.appData.transactions = [];
                    this.recalculateBalance();
                    this.saveData(); this.render(); this.updateUIFromData();
                    this.showToast('Tutte le transazioni sono state eliminate.');
                } else { this.showToast('Azione annullata.', 'error'); }
            },
            deleteTransaction(e) {
                const txId = e.target.closest('.transaction-item').dataset.id;
                if (confirm('Sei sicuro di voler eliminare questa transazione?')) {
                    const txIndex = this.state.appData.transactions.findIndex(t => t.id === txId);
                    if (txIndex > -1) {
                        this.state.appData.transactions.splice(txIndex, 1);
                        this.recalculateBalance();
                        this.saveData(); this.render();
                        this.showToast('Transazione eliminata.');
                    }
                }
            },
            showSortOptions(e) { 
                const content = `<div class="popup-handle"></div><div class="sort-options-wrapper"><h3>Ordina movimenti per</h3><div class="sort-option" data-action="selectSort" data-sort="date_desc"><span>Data (più recenti)</span><i class="fa-solid fa-check"></i></div><div class="sort-option" data-action="selectSort" data-sort="date_asc"><span>Data (meno recenti)</span><i class="fa-solid fa-check"></i></div><div class="sort-option" data-action="selectSort" data-sort="amount_desc"><span>Importo (dal più alto)</span><i class="fa-solid fa-check"></i></div><div class="sort-option" data-action="selectSort" data-sort="amount_asc"><span>Importo (dal più basso)</span><i class="fa-solid fa-check"></i></div></div>`;
                this.DOM.sortOptionsPopup.innerHTML = content;
                this.showPopup(this.DOM.sortOptionsPopup);
                this.updateSortOptionsUI();
            },
            selectSort(e) {
                const sortOption = e.target.closest('.sort-option');
                if (sortOption) {
                    this.state.currentSort = sortOption.dataset.sort;
                    this.updateSortOptionsUI();
                    this.renderAllTransactions();
                    this.hidePopup(this.DOM.sortOptionsPopup);
                }
            },
            showTxDetail(e) {
                if (this.state.editMode && e.target.closest('[data-action="deleteTransaction"]')) return;
                const transactionItem = e.target.closest('.transaction-item');
                if (transactionItem) {
                    const transaction = this.state.appData.transactions.find(t => t.id === transactionItem.dataset.id);
                    if (transaction) this.renderTransactionDetail(transaction);
                }
            }
        },

        handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.readAsArrayBuffer(file);
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
                    
                    const newTransactions = this.parseComplexExcelData(rows);

                    if (newTransactions.length > 0) {
                        this.state.appData.transactions.push(...newTransactions);
                        this.recalculateBalance(); 
                        this.saveData(); 
                        this.render();
                        this.showToast(`${newTransactions.length} transazioni importate!`);
                    } else { 
                        this.showToast('Nessuna nuova transazione trovata o solo duplicati.', 'warning'); 
                    }
                } catch (error) { 
                    console.error("Errore nell'elaborazione del file:", error); 
                    this.showToast(error.message || 'File non valido o corrotto.', 'error'); 
                }
            };
            event.target.value = '';
        },
        
        parseItalianDate(dateString) {
            if (!dateString || typeof dateString !== 'string') return null;
            if (dateString.includes('/')) {
                const parts = dateString.split('/');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[2], 10);
                    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return new Date(year, month, day);
                }
            }
            const monthMap = { 'gen': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mag': 4, 'giu': 5, 'lug': 6, 'ago': 7, 'set': 8, 'ott': 9, 'nov': 10, 'dic': 11, 'gennaio': 0, 'febbraio': 1, 'marzo': 2, 'aprile': 3, 'maggio': 4, 'giugno': 5, 'luglio': 6, 'agosto': 7, 'settembre': 8, 'ottobre': 9, 'novembre': 10, 'dicembre': 11 };
            const parts = dateString.toLowerCase().replace('.', '').split(' ');
            if (parts.length < 3) return null;
            const monthStr = parts[1];
            const month = monthMap[monthStr];
            const day = parseInt(parts[0], 10);
            const year = parseInt(parts[2], 10);
            if (!isNaN(day) && month !== undefined && !isNaN(year)) return new Date(year, month, day);
            return null;
        },

        parseComplexExcelData(rows) {
            const headerIndex = rows.findIndex(row => 
                String(row).toLowerCase().includes('data operazione') && String(row).toLowerCase().includes('descrizione')
            );

            if (headerIndex === -1) throw new Error("Intestazione non trovata. Cerca 'Data Operazione' e 'Descrizione'.");
            
            const headerRow = rows[headerIndex].map(h => String(h).toLowerCase());
            const colMap = {
                date: headerRow.findIndex(h => h.includes('data operazione')),
                description: headerRow.findIndex(h => h.includes('descrizione')),
                income: headerRow.findIndex(h => h.includes('entrate')),
                outcome: headerRow.findIndex(h => h.includes('uscite')),
                category: headerRow.findIndex(h => h.includes('categoria'))
            };

            if (colMap.date === -1 || colMap.description === -1) throw new Error("Colonne 'Data Operazione' o 'Descrizione' non trovate.");
            
            const transactionRows = rows.slice(headerIndex + 1);
            const rawTransactions = [];
            let currentTransaction = null;

            for (const row of transactionRows) {
                if (!Array.isArray(row) || row.length === 0 || !row.some(cell => cell)) continue;
                const rowStr = row.join(',').toLowerCase();
                if (rowStr.includes('totale movimenti') || rowStr.includes('saldo al')) break;

                const dateCandidate = row[colMap.date];
                const isNewTransaction = dateCandidate && (dateCandidate instanceof Date || String(dateCandidate).match(/\d{1,2}\s\w+\s\d{4}|\d{1,2}\/\d{1,2}\/\d{4}/));
                
                if (isNewTransaction) {
                    if (currentTransaction) rawTransactions.push(currentTransaction);
                    currentTransaction = {
                        dataOperazione: dateCandidate,
                        descrizione: String(row[colMap.description] || '').replace(/"/g, '').trim(),
                        entrate: colMap.income > -1 ? row[colMap.income] : '',
                        uscite: colMap.outcome > -1 ? row[colMap.outcome] : '',
                        categoria: colMap.category > -1 ? String(row[colMap.category] || '') : ''
                    };
                } else if (currentTransaction) {
                    const continuationText = String(row[colMap.description] || '').replace(/"/g, '').trim();
                    if (continuationText) currentTransaction.descrizione += ' ' + continuationText;
                }
            }
            if (currentTransaction) rawTransactions.push(currentTransaction);

            const existingTxKeys = new Set(this.state.appData.transactions.map(tx => `${new Date(tx.accountingDate).toLocaleDateString('it-IT')}_${tx.amount.toFixed(2)}_${tx.name}`));
            
            const finalTransactions = rawTransactions.map(t => {
                const entrate = parseFloat(String(t.entrate).replace(',', '.')) || 0;
                const uscite = parseFloat(String(t.uscite).replace(',', '.')) || 0;
                const importo = entrate || uscite;

                let data = t.dataOperazione instanceof Date ? t.dataOperazione : this.parseItalianDate(t.dataOperazione);
                if (!data || isNaN(data.getTime())) {
                    console.error("Data non valida, assegnata data odierna:", t);
                    data = new Date();
                }

                const nome = t.descrizione.replace(/\s+/g, ' ').trim();
                const key = `${data.toLocaleDateString('it-IT')}_${importo.toFixed(2)}_${nome}`;
                if (existingTxKeys.has(key)) return null;
                
                let categoriaApp = 'default';
                const catOriginale = t.categoria.toLowerCase();
                const descOriginale = t.descrizione.toLowerCase();

                if (catOriginale.includes('stipendio') || descOriginale.includes('emolumenti')) {
                    categoriaApp = 'salary';
                } else if (catOriginale.includes('versamento')) {
                    categoriaApp = 'transfer_in';
                } else if (
                    catOriginale.includes('bonifico') ||
                    catOriginale.includes('prelievo') ||
                    catOriginale.includes('commission') ||
                    catOriginale.includes('competenze') ||
                    catOriginale.includes('rata') ||
                    catOriginale.includes('pagamento') ||
                    catOriginale.includes('bancomat')
                ) {
                    categoriaApp = 'payment';
                }

                const tipoTransazione = t.categoria.trim() ? t.categoria.trim().toUpperCase() : (importo < 0 ? 'PAGAMENTO' : 'ACCREDITO');

                return {
                    id: 'imp_' + Date.now() + Math.random(),
                    accountingDate: data,
                    currencyDate: data,
                    name: nome,
                    type: tipoTransazione,
                    amount: parseFloat(importo.toFixed(2)),
                    details: 'Importato da file',
                    category: categoriaApp
                };
            }).filter(Boolean);
            return finalTransactions;
        },

        recalculateBalance() {
            this.state.appData.balance = this.state.appData.transactions.reduce((total, tx) => total + tx.amount, 0);
        },
        updateUIFromData() {
            document.querySelector('[data-field="accountTitle"]').textContent = this.state.appData.accountTitle;
            document.querySelector('.all-transactions-header .subtitle').textContent = this.state.appData.accountTitle;
            document.querySelector('[data-field="accountHolder"]').textContent = this.state.appData.accountHolder;
            document.getElementById('iban-text').textContent = this.state.appData.iban;
            const el = document.getElementById('current-balance');
            el.innerHTML = this.state.balancesVisible ? this.state.appData.balance.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : '•••••';
        },
        render() {
            const mainPageTxs = [...this.state.appData.transactions].sort((a,b) => new Date(b.accountingDate) - new Date(a.accountingDate)).slice(0, 5);
            this.renderTransactionList(mainPageTxs, this.DOM.mainTransactionsList);
            this.renderAllTransactions();
        },
        renderAllTransactions() {
            const s = this.DOM.searchInput.value.toLowerCase();
            this.DOM.clearSearchBtn.style.display = s ? 'block' : 'none';
            const f = this.state.appData.transactions.filter(tx => (tx.name.toLowerCase().includes(s) || tx.amount.toString().replace('.',',').includes(s)) && (this.state.currentFilter === 'all' || (this.state.currentFilter === 'incomes' && tx.amount > 0) || (this.state.currentFilter === 'expenses' && tx.amount < 0)));
            f.sort((a, b) => {
                switch (this.state.currentSort) {
                    case 'date_asc': return new Date(a.accountingDate) - new Date(b.accountingDate);
                    case 'amount_desc': return b.amount - a.amount;
                    case 'amount_asc': return a.amount - b.amount;
                    default: return new Date(b.accountingDate) - new Date(a.accountingDate);
                }
            });
            this.renderTransactionList(f, this.DOM.allTransactionsList);
        },
        renderTransactionList(txs, container) {
            container.innerHTML = '';
            const n = this.DOM.body.querySelector('.no-results-message');
            if (txs.length === 0 && container === this.DOM.allTransactionsList) {
                if(n) n.style.display = 'block';
            } else {
                if(n) n.style.display = 'none';
                const f = document.createDocumentFragment();
                txs.forEach(tx => f.appendChild(this.createTransactionElement(tx)));
                container.appendChild(f);
            }
            if (this.state.editMode) this.setEditableState(true, container);
        },
        createTransactionElement(tx) {
            const c = this.DOM.txTemplate.content.cloneNode(true);
            const i = c.querySelector('.transaction-item');
            i.dataset.id = tx.id;
            i.querySelector('.date-day').textContent = String(new Date(tx.accountingDate).getDate()).padStart(2, '0');
            i.querySelector('.date-month').textContent = new Date(tx.accountingDate).toLocaleDateString('it-IT', { month: 'short' }).replace('.', '');
            i.querySelector('.transaction-name').textContent = tx.name;
            i.querySelector('.transaction-type').textContent = tx.type;
            const a = i.querySelector('.transaction-amount');
            a.textContent = this.state.balancesVisible ? tx.amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : '•••••';
            a.className = `transaction-amount ${tx.amount > 0 ? 'positive' : 'negative'}`;
            return i;
        },
        toggleEditMode(forceState) {
            this.state.editMode = (forceState !== undefined) ? forceState : !this.state.editMode;
            this.DOM.body.classList.toggle('edit-mode-active', this.state.editMode);
            this.DOM.editModeBanner.style.display = this.state.editMode ? 'flex' : 'none';
            this.setEditableState(this.state.editMode, document);
            this.render();
        },
        setEditableState(isEditable, container = document) {
            container.querySelectorAll('[data-editable="true"]').forEach(el => {
                el.contentEditable = isEditable;
                el.spellcheck = false;
                el.removeEventListener('blur', this.saveOnBlur.bind(this)); 
                if (isEditable) { 
                    el.addEventListener('blur', this.saveOnBlur.bind(this)); 
                }
            });
        },

        saveOnBlur(e) {
            const el = e.target;
            const field = el.dataset.field;
            let newValue = el.innerText;
        
            const listItem = el.closest('.transaction-item');
            const detailPopup = el.closest('#transaction-detail-popup');
            let txId = null;
        
            if (listItem) {
                txId = listItem.dataset.id;
            } else if (detailPopup) {
                txId = detailPopup.dataset.currentTxId;
            }
        
            if (txId) { // Se stiamo modificando una transazione (da lista o da popup)
                const tx = this.state.appData.transactions.find(t => t.id === txId);
                if (!tx) return;
        
                const originalAmount = tx.amount;
        
                switch (field) {
                    case 'amount':
                        // Logica migliorata per riconoscere + e -
                        const cleanedString = newValue.replace(/\./g, '').replace(',', '.').replace(/€/g, '').trim();
                        const parsedAmount = parseFloat(cleanedString);
                        tx.amount = isNaN(parsedAmount) ? 0 : parsedAmount;
                        this.state.appData.balance += (tx.amount - originalAmount); // Aggiorna il saldo totale
                        break;
                    case 'name':
                    case 'type':
                    case 'details':
                        tx[field] = newValue;
                        break;
                    case 'accountingDate':
                    case 'currencyDate':
                        const parsedDate = this.parseItalianDate(newValue);
                        if (parsedDate && !isNaN(parsedDate.getTime())) {
                            tx[field] = parsedDate;
                        } else {
                            this.showToast('Formato data non valido.', 'error');
                            el.innerText = new Date(tx[field]).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }); // Ripristina
                        }
                        break;
                }
        
            } else { // Se stiamo modificando un campo generale (es. saldo, nome conto)
                if (field === 'balance') {
                    this.state.appData.balance = parseFloat(newValue.replace(/[^0-9,-]+/g, "").replace(',', '.')) || 0;
                } else {
                    this.state.appData[field] = newValue;
                }
            }
        
            this.saveData();
            this.updateUIFromData();
            this.render();
            if (this.state.activePopup === this.DOM.txDetailPopup) {
                const updatedTx = this.state.appData.transactions.find(t => t.id === txId);
                if(updatedTx) this.renderTransactionDetail(updatedTx);
            }
        },
        
        showToast(message, type = 'success') {
            this.DOM.toast.textContent = message;
            this.DOM.toast.style.backgroundColor = type === 'error' ? '#ff3b30' : 'rgba(0,0,0,0.8)';
            this.DOM.toast.classList.add('show');
            setTimeout(() => this.DOM.toast.classList.remove('show'), 3000);
        },

        renderTransactionDetail(tx) {
            this.DOM.txDetailPopup.dataset.currentTxId = tx.id; // Associa l'ID al popup
        
            const amountFormatted = tx.amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
            const accountingDateFormatted = new Date(tx.accountingDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
            const currencyDateFormatted = new Date(tx.currencyDate).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
        
            const content = `
                <div class="popup-handle"></div>
                <div class="transaction-detail-wrapper">
                    <div class="detail-header">
                        <div class="detail-category-icon"><i class="${this.config.categoryIcons[tx.category] || this.config.categoryIcons['default']}"></i></div>
                        <div class="detail-amount ${tx.amount > 0 ? 'positive' : 'negative'}" data-editable="true" data-field="amount">${amountFormatted}</div>
                        <div class="detail-name" data-editable="true" data-field="name">${tx.name}</div>
                    </div>
                    <div class="detail-info-block">
                        <div class="detail-info-row">
                            <span>Causale</span>
                            <span data-editable="true" data-field="details">${tx.details}</span>
                        </div>
                        <div class="detail-info-row">
                            <span>Data contabile</span>
                            <span data-editable="true" data-field="accountingDate">${accountingDateFormatted}</span>
                        </div>
                        <div class="detail-info-row">
                            <span>Data valuta</span>
                            <span data-editable="true" data-field="currencyDate">${currencyDateFormatted}</span>
                        </div>
                        <div class="detail-info-row">
                            <span>Tipo movimento</span>
                            <span data-editable="true" data-field="type">${tx.type}</span>
                        </div>
                    </div>
                </div>`;
            this.DOM.txDetailPopup.innerHTML = content;
        
            if (this.state.editMode) {
                this.setEditableState(true, this.DOM.txDetailPopup);
            }
        
            this.showPopup(this.DOM.txDetailPopup);
        },
        
        showPopup(el) { 
            this.state.activePopup = el;
            this.DOM.body.classList.add('modal-open'); 
            this.DOM.modalBackdrop.classList.add('active'); 
            el.classList.add('active'); 
        },
        hidePopup(el) { 
            if (!el) return;
            if (el === this.DOM.txDetailPopup) {
                el.removeAttribute('data-current-tx-id');
            }
            this.state.activePopup = null;
            this.DOM.body.classList.remove('modal-open'); 
            this.DOM.modalBackdrop.classList.remove('active'); 
            el.classList.remove('active'); 
        },
        updateSortOptionsUI() { if (this.DOM.sortOptionsPopup) { this.DOM.sortOptionsPopup.querySelectorAll('.sort-option').forEach(opt => { opt.classList.toggle('selected', opt.dataset.sort === this.state.currentSort); }); } },
        updateBalanceDate() { const n = new Date(), d = String(n.getDate()).padStart(2, '0'), m = String(n.getMonth() + 1).padStart(2, '0'); document.getElementById('balance-date').textContent = `${d}/${m}/${n.getFullYear()}`; },
        handleDragStart(e) {
            if (!this.state.activePopup) return;
            this.state.isDragging = true;
            this.state.dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
            this.state.activePopup.classList.add('dragging');
        },
        handleDragMove(e) {
            if (!this.state.isDragging || !this.state.activePopup) return;
            const currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - this.state.dragStartY;
            this.state.currentTranslateY = Math.max(0, deltaY);
            this.state.activePopup.style.transform = `translateY(${this.state.currentTranslateY}px)`;
        },
        handleDragEnd(e) {
            if (!this.state.isDragging || !this.state.activePopup) return;
            this.state.isDragging = false;
            this.state.activePopup.classList.remove('dragging');
            this.state.activePopup.style.transform = '';
            if (this.state.currentTranslateY > 100) {
                this.hidePopup(this.state.activePopup);
            }
            this.state.currentTranslateY = 0;
        }
    };

    App.init();
});