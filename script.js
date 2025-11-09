// Initialize Supabase with your configuration
const supabaseUrl = 'https://qgayglybnnrhobcvftrs.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnYXlnbHlibm5yaG9iY3ZmdHJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2ODQ5ODMsImV4cCI6MjA3ODI2MDk4M30.dqiEe-v1cro5N4tuawu7Y1x5klSyjINsLHd9-V40QjQ';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Initialize data structures
const sections = ['grill', 'wholesale', 'building', 'food'];
const sectionNames = {
    'grill': 'Grill',
    'wholesale': 'Wholesale',
    'building': 'Building Material',
    'food': 'Food Supplies'
};

// Initialize empty inventory for each section
const inventory = {
    'grill': [],
    'wholesale': [],
    'building': [],
    'food': []
};

// Initialize empty carts for each section
const carts = {
    'grill': [],
    'wholesale': [],
    'building': [],
    'food': []
};

// Initialize empty sales data for each section
const salesData = {
    'grill': { totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-', dailySales: 0, dailyTransactions: 0 },
    'wholesale': { totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-', dailySales: 0, dailyTransactions: 0 },
    'building': { totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-', dailySales: 0, dailyTransactions: 0 },
    'food': { totalSales: 0, totalTransactions: 0, avgTransaction: 0, topItem: '-', dailySales: 0, dailyTransactions: 0 }
};

// Initialize empty user data
const userData = {
    'grill': { transactions: 0, sales: 0 },
    'wholesale': { transactions: 0, sales: 0 },
    'building': { transactions: 0, sales: 0 },
    'food': { transactions: 0, sales: 0 }
};

// Current section and view
let currentSection = 'grill';
let currentView = 'pos';
let currentFilter = 'all';
let currentUser = null;

// Generate unique ID for offline records
function generateOfflineId() {
    return 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Save data to local storage for offline use
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
}

// Load data from local storage
function loadFromLocalStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
        console.error('Error loading from localStorage:', e);
        return defaultValue;
    }
}

// Check if a product is expired
function isExpired(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    const expiry = new Date(expiryDate);
    return expiry < today;
}

// Check if a product is expiring soon (within 7 days)
function isExpiringSoon(expiryDate) {
    if (!expiryDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison
    const expiry = new Date(expiryDate);
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
}

// Get product status based on stock and expiry
function getProductStatus(item) {
    if (isExpired(item.expiry_date)) {
        return 'expired';
    } else if (isExpiringSoon(item.expiry_date)) {
        return 'expiring-soon';
    } else if (item.stock === 0) {
        return 'out-of-stock';
    } else if (item.stock < 10) {
        return 'low-stock';
    } else {
        return 'in-stock';
    }
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

// Update category inventory summary
function updateCategoryInventorySummary(section) {
    let totalProducts = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    
    inventory[section].forEach(item => {
        totalProducts++;
        totalValue += item.price * item.stock;
        
        const status = getProductStatus(item);
        if (status === 'low-stock') {
            lowStockCount++;
        } else if (status === 'expiring-soon') {
            expiringSoonCount++;
        } else if (status === 'expired') {
            expiredCount++;
        }
    });
    
    // Update the summary cards
    document.getElementById(`${section}-total-products`).textContent = totalProducts;
    document.getElementById(`${section}-total-value`).textContent = `₦${totalValue.toFixed(2)}`;
    document.getElementById(`${section}-low-stock-count`).textContent = lowStockCount;
    document.getElementById(`${section}-expiring-soon-count`).textContent = expiringSoonCount;
    document.getElementById(`${section}-expired-count`).textContent = expiredCount;
}

// Save data to Supabase with offline support
async function saveDataToSupabase(table, data, id = null) {
    // Add timestamp and user info
    data.timestamp = new Date().toISOString();
    data.userId = currentUser ? currentUser.id : 'offline_user';
    
    // Save to local storage immediately for offline access
    const localKey = `${table}_${id || 'new'}`;
    saveToLocalStorage(localKey, data);
    
    // Update local data structures immediately
    if (table === 'inventory') {
        if (!id) {
            // New item - generate temporary ID
            id = generateOfflineId();
            data.id = id;
            data.isOffline = true;
            inventory[data.section].push(data);
        } else {
            // Update existing item
            const index = inventory[data.section].findIndex(item => item.id === id);
            if (index !== -1) {
                inventory[data.section][index] = { ...inventory[data.section][index], ...data };
            }
        }
        loadInventoryTable(data.section);
        updateDepartmentStats(data.section);
        updateCategoryInventorySummary(data.section);
        updateTotalInventory();
    } else if (table === 'sales') {
        // Update sales data locally
        const section = data.section;
        salesData[section].totalSales += data.total;
        salesData[section].totalTransactions += 1;
        salesData[section].avgTransaction = salesData[section].totalSales / salesData[section].totalTransactions;
        salesData[section].dailySales += data.total;
        salesData[section].dailyTransactions += 1;
        
        userData[section].transactions += 1;
        userData[section].sales += data.total;
        
        updateReports(section);
        updateUserStats(section);
        updateDepartmentStats(section);
    } else if (table === 'sales_data') {  // FIXED: Changed from 'salesData' to 'sales_data'
        const section = id;
        if (section && salesData[section]) {
            salesData[section] = { ...salesData[section], ...data };
            updateReports(section);
            updateDepartmentStats(section);
        }
    } else if (table === 'user_data') {  // FIXED: Changed from 'userData' to 'user_data'
        const section = id;
        if (section && userData[section]) {
            userData[section] = { ...userData[section], ...data };
            updateUserStats(section);
        }
    }
    
    // If online, try to save to Supabase
    if (navigator.onLine) {
        try {
            let result;
            if (id && !id.startsWith('offline_')) {
                // Update existing record
                const { data, error } = await supabase
                    .from(table)
                    .update(data)
                    .eq('id', id)
                    .select();
                
                if (error) throw error;
                result = data[0];
            } else {
                // Insert new record
                const { data, error } = await supabase
                    .from(table)
                    .insert(data)
                    .select();
                
                if (error) throw error;
                result = data[0];
                
                // Update the local data with the real ID
                if (table === 'inventory') {
                    const index = inventory[data.section].findIndex(item => item.id === id);
                    if (index !== -1) {
                        inventory[data.section][index].id = result.id;
                        inventory[data.section][index].isOffline = false;
                        localStorage.removeItem(localKey);
                    }
                }
            }
            return result;
        } catch (error) {
            console.error('Error saving to Supabase:', error);
            // Store for later sync
            const pendingChanges = loadFromLocalStorage('pendingChanges', {});
            if (!pendingChanges[table]) pendingChanges[table] = {};
            
            if (id && !id.startsWith('offline_')) {
                pendingChanges[table][id] = data;
            } else {
                if (!pendingChanges[table].new) pendingChanges[table].new = [];
                pendingChanges[table].new.push(data);
            }
            
            saveToLocalStorage('pendingChanges', pendingChanges);
            return { id };
        }
    } else {
        // Store for later sync
        const pendingChanges = loadFromLocalStorage('pendingChanges', {});
        if (!pendingChanges[table]) pendingChanges[table] = {};
        
        if (id && !id.startsWith('offline_')) {
            pendingChanges[table][id] = data;
        } else {
            if (!pendingChanges[table].new) pendingChanges[table].new = [];
            pendingChanges[table].new.push(data);
        }
        
        saveToLocalStorage('pendingChanges', pendingChanges);
        return { id };
    }
}

// Listen for authentication state changes
supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        updateUserInfo(session.user);
        loadDataFromSupabase();
        window.addEventListener('online', handleOnlineStatus);
        window.addEventListener('offline', handleOfflineStatus);
        initializeApp();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

// Update user info in the UI
function updateUserInfo(user) {
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin User';
    const email = user.email || '';
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
    document.getElementById('userName').textContent = displayName;
    document.getElementById('userAvatar').textContent = initials;
    sections.forEach(section => {
        document.getElementById(`${section}-profile-name`).textContent = displayName;
        document.getElementById(`${section}-profile-avatar`).textContent = initials;
        document.getElementById(`${section}-email`).value = email;
    });
}

// Handle online/offline status
function handleOnlineStatus() {
    document.getElementById('offlineIndicator').classList.remove('show');
    showNotification('Connection restored. Syncing data...', 'info');
    syncPendingChanges();
}
function handleOfflineStatus() {
    document.getElementById('offlineIndicator').classList.add('show');
    showNotification('You\'re now offline. Changes will be saved locally.', 'warning');
}

// FIXED: Complete implementation of syncPendingChanges function
async function syncPendingChanges() {
    document.getElementById('syncStatus').classList.add('show');
    const pendingChanges = loadFromLocalStorage('pendingChanges', {});
    
    if (Object.keys(pendingChanges).length > 0) {
        const promises = [];
        
        // Process each table with pending changes
        Object.keys(pendingChanges).forEach(table => {
            // Process new documents
            if (pendingChanges[table].new && pendingChanges[table].new.length > 0) {
                pendingChanges[table].new.forEach(data => {
                    promises.push(
                        supabase
                            .from(table)
                            .insert(data)
                            .select()
                            .then(({ data: result, error }) => {
                                if (error) throw error;
                                
                                // Update local data with real ID
                                if (table === 'inventory') {
                                    const index = inventory[data.section].findIndex(item => item.id === data.id);
                                    if (index !== -1) {
                                        inventory[data.section][index].id = result[0].id;
                                        inventory[data.section][index].isOffline = false;
                                    }
                                }
                                return result[0];
                            })
                    );
                });
            }
            
            // Process existing documents
            Object.keys(pendingChanges[table]).forEach(id => {
                if (id !== 'new' && pendingChanges[table][id]) {
                    const data = pendingChanges[table][id];
                    promises.push(
                        supabase
                            .from(table)
                            .update(data)
                            .eq('id', id)
                            .select()
                            .then(({ data: result, error }) => {
                                if (error) throw error;
                                return result[0];
                            })
                    );
                }
            });
        });
        
        try {
            await Promise.all(promises);
            localStorage.removeItem('pendingChanges');
            document.getElementById('syncStatus').classList.remove('show');
            showNotification('All changes synced successfully', 'success');
            // Reload data to ensure UI is updated
            loadDataFromSupabase();
        } catch (error) {
            console.error('Error syncing changes:', error);
            document.getElementById('syncStatus').classList.remove('show');
            showNotification('Error syncing changes. Please try again later.', 'error');
        }
    } else {
        document.getElementById('syncStatus').classList.remove('show');
    }
}

// Load data from Supabase and local storage
async function loadDataFromSupabase() {
    // First load from local storage for immediate access
    sections.forEach(section => {
        const localInventory = loadFromLocalStorage(`inventory_${section}`, []);
        if (localInventory.length > 0) {
            inventory[section] = localInventory;
            loadInventoryTable(section);
            updateDepartmentStats(section);
            updateCategoryInventorySummary(section);
        }
        
        const localSalesData = loadFromLocalStorage(`salesData_${section}`);
        if (localSalesData) {
            salesData[section] = localSalesData;
            updateReports(section);
            updateDepartmentStats(section);
        }
        
        const localUserData = loadFromLocalStorage(`userData_${section}`);
        if (localUserData) {
            userData[section] = localUserData;
            updateUserStats(section);
        }
    });
    
    // Then try to load from Supabase if online
    if (navigator.onLine) {
        try {
            // Load inventory
            sections.forEach(section => {
                supabase
                    .from('inventory')
                    .select('*')
                    .eq('section', section)
                    .then(({ data, error }) => {
                        if (error) {
                            console.error(`Error loading ${section} inventory:`, error);
                            showNotification(`Error loading ${section} inventory. Using cached data.`, 'warning');
                            return;
                        }
                        
                        inventory[section] = data || [];
                        saveToLocalStorage(`inventory_${section}`, inventory[section]);
                        loadInventoryTable(section);
                        updateDepartmentStats(section);
                        updateCategoryInventorySummary(section);
                        updateTotalInventory();
                    });
            });
            
            // Load sales data - FIXED: Changed from 'salesData' to 'sales_data'
            sections.forEach(section => {
                supabase
                    .from('sales_data')  // FIXED: Changed table name
                    .select('*')
                    .eq('id', section)
                    .single()
                    .then(({ data, error }) => {
                        if (error && error.code !== 'PGRST116') { // Not found error
                            console.error(`Error loading ${section} sales data:`, error);
                            showNotification(`Error loading ${section} sales data. Using cached data.`, 'warning');
                            return;
                        }
                        
                        if (data) {
                            salesData[section] = data;
                            saveToLocalStorage(`salesData_${section}`, salesData[section]);
                            updateReports(section);
                            updateDepartmentStats(section);
                        }
                    });
            });
            
            // Load user data - FIXED: Changed from 'userData' to 'user_data'
            sections.forEach(section => {
                supabase
                    .from('user_data')  // FIXED: Changed table name
                    .select('*')
                    .eq('id', section)
                    .single()
                    .then(({ data, error }) => {
                        if (error && error.code !== 'PGRST116') { // Not found error
                            console.error(`Error loading ${section} user data:`, error);
                            showNotification(`Error loading ${section} user data. Using cached data.`, 'warning');
                            return;
                        }
                        
                        if (data) {
                            userData[section] = data;
                            saveToLocalStorage(`userData_${section}`, userData[section]);
                            updateUserStats(section);
                        }
                    });
            });
        } catch (error) {
            console.error('Error loading data from Supabase:', error);
            showNotification('Error loading data from server. Using cached data.', 'warning');
        }
    }
    
    // Update total inventory after loading all sections
    updateTotalInventory();
}

// --- EVENT LISTENERS (REFACTORED) ---
document.addEventListener('DOMContentLoaded', function() {
    // Login form
    document.getElementById('emailLoginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorElement = document.getElementById('email-login-error');
        document.getElementById('emailLoginBtn').disabled = true;
        document.getElementById('emailLoginBtn').textContent = 'Signing In...';
        
        supabase.auth.signInWithPassword({ email, password })
            .then(({ data, error }) => {
                if (error) {
                    errorElement.textContent = error.message;
                    document.getElementById('emailLoginBtn').disabled = false;
                    document.getElementById('emailLoginBtn').textContent = 'Sign In';
                }
            })
            .catch(error => {
                errorElement.textContent = error.message;
                document.getElementById('emailLoginBtn').disabled = false;
                document.getElementById('emailLoginBtn').textContent = 'Sign In';
            });
    });

    // Forgot password
    document.getElementById('forgotPasswordLink').addEventListener('click', function(e) {
        e.preventDefault();
        document.getElementById('forgotPasswordModal').classList.add('active');
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        supabase.auth.signOut();
    });

    // Modal close buttons
    document.querySelectorAll('.js-modal-close').forEach(button => {
        button.addEventListener('click', () => {
            const targetModal = button.getAttribute('data-target');
            closeModal(targetModal);
        });
    });

    // Add item button
    document.querySelectorAll('.js-add-item-btn').forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            showAddItemModal(section);
        });
    });

    // Add inventory button
    document.querySelectorAll('.js-add-inventory-btn').forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            showAddInventoryModal(section);
        });
    });

    // Checkout button
    document.querySelectorAll('.js-checkout-btn').forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            processCheckout(section);
        });
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(button => {
        button.addEventListener('click', () => {
            const section = button.getAttribute('data-section');
            const filter = button.getAttribute('data-filter');
            
            // Handle total inventory filter buttons (no section attribute)
            if (!section) {
                document.querySelectorAll('.filter-btn:not([data-section])').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                currentFilter = filter;
                loadTotalInventoryTable();
                return;
            }
            
            document.querySelectorAll(`[data-section="${section}"].filter-btn`).forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            currentFilter = filter;
            loadInventoryTable(section);
        });
    });

    // Total inventory search
    document.getElementById('total-inventory-search').addEventListener('input', function() {
        filterTotalInventory(this.value);
    });

    // Modal confirm buttons
    document.querySelector('.js-add-item-confirm-btn').addEventListener('click', addNewItem);
    document.querySelector('.js-add-inventory-confirm-btn').addEventListener('click', addNewInventory);
    document.querySelector('.js-update-inventory-btn').addEventListener('click', updateInventoryItem);
    document.querySelector('.js-complete-checkout-btn').addEventListener('click', completeCheckout);
    document.querySelector('.js-reset-password-btn').addEventListener('click', resetPassword);

    // Event Delegation for dynamic content
    setupEventDelegation();
});

function setupEventDelegation() {
    // Main nav tabs
    document.querySelector('.nav-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.nav-tab');
        if (tab) {
            const section = tab.getAttribute('data-section');
            
            // Handle total inventory tab
            if (section === 'total-inventory') {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.section-container').forEach(s => s.classList.remove('active'));
                document.getElementById('total-inventory-section').classList.add('active');
                currentSection = 'total-inventory';
                updateTotalInventory();
                return;
            }
            
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.section-container').forEach(s => s.classList.remove('active'));
            document.getElementById(`${section}-section`).classList.add('active');
            currentSection = section;
            resetToPOSView(section);
        }
    });

    // Sub nav tabs
    document.querySelectorAll('.sub-nav').forEach(nav => {
        nav.addEventListener('click', (e) => {
            const item = e.target.closest('.sub-nav-item');
            if (item) {
                const view = item.getAttribute('data-view');
                const section = nav.closest('.section-container').id.replace('-section', '');
                document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                document.querySelectorAll(`#${section}-section .view-content`).forEach(v => v.classList.remove('active'));
                document.getElementById(`${section}-${view}-view`).classList.add('active');
                currentView = view;
                if (view === 'inventory') {
                    loadInventoryTable(section);
                    updateCategoryInventorySummary(section);
                } else if (view === 'reports') updateReports(section);
                else if (view === 'account') updateUserStats(section);
            }
        });
    });

    // POS Search Results (Add to cart)
    document.querySelectorAll('.js-pos-search-results').forEach(container => {
        container.addEventListener('click', (e) => {
            const resultItem = e.target.closest('.pos-search-result-item');
            if (resultItem) {
                const section = container.getAttribute('data-section');
                const itemId = resultItem.getAttribute('data-id');
                const item = inventory[section].find(invItem => invItem.id == itemId);
                if (item) {
                    addToCart(section, item);
                    const searchInput = document.querySelector(`.js-pos-search[data-section="${section}"]`);
                    searchInput.value = '';
                    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-search"></i></div><h3 class="empty-state-title">Search for Products</h3><p class="empty-state-description">Type in the search box above to find products from your inventory.</p></div>`;
                }
            }
        });
    });

    // Cart Actions (Increment, Decrement, Remove)
    document.querySelectorAll('.js-pos-cart').forEach(cart => {
        cart.addEventListener('click', (e) => {
            const section = cart.getAttribute('data-section');
            if (e.target.closest('.quantity-btn')) {
                const btn = e.target.closest('.quantity-btn');
                const cartItem = btn.closest('.cart-item');
                const itemId = cartItem.getAttribute('data-item-id');
                if (btn.textContent === '+') incrementQuantity(section, itemId);
                else if (btn.textContent === '-') decrementQuantity(section, itemId);
            } else if (e.target.closest('.action-btn.delete')) {
                const btn = e.target.closest('.action-btn.delete');
                const cartItem = btn.closest('.cart-item');
                const itemId = cartItem.getAttribute('data-item-id');
                removeFromCart(section, itemId);
            }
        });
    });

    // Inventory Table Actions (Edit, Delete)
    document.querySelectorAll('.js-inventory-container').forEach(container => {
        container.addEventListener('click', (e) => {
            const section = container.getAttribute('data-section');
            if (e.target.closest('.action-btn')) {
                const btn = e.target.closest('.action-btn');
                const row = btn.closest('tr');
                const itemId = row.getAttribute('data-item-id');
                if (btn.classList.contains('delete')) {
                    deleteInventoryItem(section, itemId);
                } else {
                    editInventoryItem(section, itemId);
                }
            }
        });
    });

    // Total Inventory Table Actions (Edit, Delete)
    document.querySelector('.js-total-inventory-container').addEventListener('click', (e) => {
        if (e.target.closest('.action-btn')) {
            const btn = e.target.closest('.action-btn');
            const row = btn.closest('tr');
            const itemId = row.getAttribute('data-item-id');
            const section = row.getAttribute('data-section');
            if (btn.classList.contains('delete')) {
                deleteInventoryItem(section, itemId);
            } else {
                editInventoryItem(section, itemId);
            }
        }
    });
}

// --- FUNCTIONS (REFACTORED) ---
function initializeApp() {
    sections.forEach(section => {
        initializePOSSearch(section);
        updateCart(section);
        updateDepartmentStats(section);
        loadInventoryTable(section);
        updateReports(section);
        updateUserStats(section);
        updateCategoryInventorySummary(section);
        const form = document.getElementById(`${section}-account-form`);
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                saveAccountInfo(section);
            });
        }
        const searchInput = document.querySelector(`.js-inventory-search[data-section="${section}"]`);
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                filterInventory(section, this.value);
            });
        }
    });
    
    // Initialize total inventory
    updateTotalInventory();
}

// CORRECTED: Complete POS Search Initialization
function initializePOSSearch(section) {
    const searchInput = document.querySelector(`.js-pos-search[data-section="${section}"]`);
    const searchResults = document.querySelector(`.js-pos-search-results[data-section="${section}"]`);
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.trim().toLowerCase();
            
            if (searchTerm.length === 0) {
                searchResults.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h3 class="empty-state-title">Search for Products</h3>
                        <p class="empty-state-description">Type in the search box above to find products from your inventory.</p>
                    </div>
                `;
                return;
            }
            
            const filteredItems = inventory[section].filter(item => 
                item.name.toLowerCase().includes(searchTerm)
            );
            
            if (filteredItems.length === 0) {
                searchResults.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h3 class="empty-state-title">No Products Found</h3>
                        <p class="empty-state-description">Try a different search term or add new products to your inventory.</p>
                    </div>
                `;
            } else {
                searchResults.innerHTML = '';
                filteredItems.forEach(item => {
                    const resultItem = document.createElement('div');
                    resultItem.className = 'pos-search-result-item';
                    resultItem.setAttribute('data-id', item.id);
                    
                    resultItem.innerHTML = `
                        <div class="pos-item-info">
                            <div class="pos-item-name">${item.name}</div>
                            <div class="pos-item-stock">Stock: ${item.stock}</div>
                        </div>
                        <div class="pos-item-price">₦${item.price.toFixed(2)}</div>
                    `;
                    
                    searchResults.appendChild(resultItem);
                });
            }
        });
    }
}

function updateCart(section) {
    const cartItemsContainer = document.querySelector(`.js-cart-items[data-section="${section}"]`);
    cartItemsContainer.innerHTML = '';
    let subtotal = 0;
    if (carts[section].length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-shopping-cart"></i>
                </div>
                <h3 class="empty-state-title">Your Cart is Empty</h3>
                <p class="empty-state-description">Search for products to add to your cart.</p>
            </div>
        `;
        document.querySelector(`.js-checkout-btn[data-section="${section}"]`).disabled = true;
    } else {
        carts[section].forEach(item => {
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.setAttribute('data-item-id', item.id);
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            cartItem.innerHTML = `
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-details">₦${item.price.toFixed(2)} × ${item.quantity}</div>
                </div>
                <div class="cart-item-actions">
                    <button class="quantity-btn">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn">+</button>
                    <button class="action-btn delete"><i class="fas fa-trash"></i></button>
                </div>
            `;
            cartItemsContainer.appendChild(cartItem);
        });
        document.querySelector(`.js-checkout-btn[data-section="${section}"]`).disabled = false;
    }
    document.querySelector(`.js-subtotal[data-section="${section}"]`).textContent = `₦${subtotal.toFixed(2)}`;
    document.querySelector(`.js-total[data-section="${section}"]`).textContent = `₦${subtotal.toFixed(2)}`;
}

// CORRECTED: Complete loadInventoryTable function
function loadInventoryTable(section) {
    const inventoryContainer = document.querySelector(`.js-inventory-container[data-section="${section}"]`);
    inventoryContainer.innerHTML = '';
    
    const searchInput = document.querySelector(`.js-inventory-search[data-section="${section}"]`);
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    let filteredItems = inventory[section];
    if (currentFilter !== 'all') {
        filteredItems = inventory[section].filter(item => {
            const status = getProductStatus(item);
            return status === currentFilter;
        });
    }
    
    if (searchTerm) {
        filteredItems = filteredItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredItems.length === 0) {
        inventoryContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-warehouse"></i>
                </div>
                <h3 class="empty-state-title">${searchTerm ? 'No Products Found' : 'No Products in Inventory'}</h3>
                <p class="empty-state-description">${searchTerm ? 'Try a different search term or add new products.' : 'Start by adding products to your inventory. You can add details like name, price, stock quantity, and expiry date.'}</p>
                <button class="btn btn-primary js-add-inventory-btn" data-section="${section}">
                    <i class="fas fa-plus"></i> Add Your First Product
                </button>
            </div>
        `;
        return;
    }
    
    const inventoryTable = document.createElement('table');
    inventoryTable.className = 'inventory-table';
    
    const tableHeader = document.createElement('thead');
    tableHeader.innerHTML = `
        <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Expiry Date</th>
            <th>Status</th>
            <th>Actions</th>
        </tr>
    `;
    inventoryTable.appendChild(tableHeader);
    
    const tableBody = document.createElement('tbody');
    
    filteredItems.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute('data-item-id', item.id);
        
        const status = getProductStatus(item);
        let statusClass = '';
        let statusText = '';
        
        if (status === 'in-stock') {
            statusClass = 'status-in-stock';
            statusText = 'In Stock';
        } else if (status === 'low-stock') {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
        } else if (status === 'out-of-stock') {
            statusClass = 'status-out-of-stock';
            statusText = 'Out of Stock';
        } else if (status === 'expired') {
            statusClass = 'status-expired';
            statusText = 'Expired';
        } else if (status === 'expiring-soon') {
            statusClass = 'status-expiring-soon';
            statusText = 'Expiring Soon';
        }
        
        row.innerHTML = `
            <td>${item.name} ${item.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
            <td>₦${item.price.toFixed(2)}</td>
            <td>${item.stock}</td>
            <td>${formatDate(item.expiry_date)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    inventoryTable.appendChild(tableBody);
    inventoryContainer.appendChild(inventoryTable);
}

// Update total inventory view
function updateTotalInventory() {
    let totalProducts = 0;
    let totalValue = 0;
    let totalExpired = 0;
    let totalExpiringSoon = 0;
    
    sections.forEach(section => {
        inventory[section].forEach(item => {
            totalProducts++;
            totalValue += item.price * item.stock;
            
            if (isExpired(item.expiry_date)) {
                totalExpired++;
            } else if (isExpiringSoon(item.expiry_date)) {
                totalExpiringSoon++;
            }
        });
    });
    
    document.getElementById('total-products').textContent = totalProducts;
    document.getElementById('total-value').textContent = `₦${totalValue.toFixed(2)}`;
    document.getElementById('total-expired').textContent = totalExpired;
    document.getElementById('total-expiring-soon').textContent = totalExpiringSoon;
    
    loadTotalInventoryTable();
}

// Load total inventory table
function loadTotalInventoryTable() {
    const inventoryContainer = document.querySelector('.js-total-inventory-container');
    inventoryContainer.innerHTML = '';
    
    const searchInput = document.getElementById('total-inventory-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    // Combine all inventory items
    let allItems = [];
    sections.forEach(section => {
        inventory[section].forEach(item => {
            allItems.push({ ...item, section });
        });
    });
    
    // Filter items
    let filteredItems = allItems;
    if (currentFilter !== 'all') {
        filteredItems = allItems.filter(item => {
            const status = getProductStatus(item);
            return status === currentFilter;
        });
    }
    
    if (searchTerm) {
        filteredItems = filteredItems.filter(item => 
            item.name.toLowerCase().includes(searchTerm)
        );
    }
    
    if (filteredItems.length === 0) {
        inventoryContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-warehouse"></i>
                </div>
                <h3 class="empty-state-title">${searchTerm ? 'No Products Found' : 'No Products in Inventory'}</h3>
                <p class="empty-state-description">${searchTerm ? 'Try a different search term.' : 'Start by adding products to your inventory.'}</p>
            </div>
        `;
        return;
    }
    
    const inventoryTable = document.createElement('table');
    inventoryTable.className = 'inventory-table';
    
    const tableHeader = document.createElement('thead');
    tableHeader.innerHTML = `
        <tr>
            <th>Product</th>
            <th>Department</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Expiry Date</th>
            <th>Status</th>
            <th>Actions</th>
        </tr>
    `;
    inventoryTable.appendChild(tableHeader);
    
    const tableBody = document.createElement('tbody');
    
    filteredItems.forEach(item => {
        const row = document.createElement('tr');
        row.setAttribute('data-item-id', item.id);
        row.setAttribute('data-section', item.section);
        
        const status = getProductStatus(item);
        let statusClass = '';
        let statusText = '';
        
        if (status === 'in-stock') {
            statusClass = 'status-in-stock';
            statusText = 'In Stock';
        } else if (status === 'low-stock') {
            statusClass = 'status-low-stock';
            statusText = 'Low Stock';
        } else if (status === 'out-of-stock') {
            statusClass = 'status-out-of-stock';
            statusText = 'Out of Stock';
        } else if (status === 'expired') {
            statusClass = 'status-expired';
            statusText = 'Expired';
        } else if (status === 'expiring-soon') {
            statusClass = 'status-expiring-soon';
            statusText = 'Expiring Soon';
        }
        
        let sectionColor = '';
        if (item.section === 'grill') sectionColor = 'var(--grill-color)';
        else if (item.section === 'wholesale') sectionColor = 'var(--wholesale-color)';
        else if (item.section === 'building') sectionColor = 'var(--building-color)';
        else if (item.section === 'food') sectionColor = 'var(--food-color)';
        
        row.innerHTML = `
            <td>${item.name} ${item.isOffline ? '<i class="fas fa-wifi" style="color: #f39c12;" title="Pending sync"></i>' : ''}</td>
            <td><span style="color: ${sectionColor}; font-weight: 600;">${sectionNames[item.section]}</span></td>
            <td>₦${item.price.toFixed(2)}</td>
            <td>${item.stock}</td>
            <td>${formatDate(item.expiry_date)}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <button class="action-btn"><i class="fas fa-edit"></i></button>
                <button class="action-btn delete"><i class="fas fa-trash"></i></button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
    
    inventoryTable.appendChild(tableBody);
    inventoryContainer.appendChild(inventoryTable);
}

// Filter total inventory
function filterTotalInventory(searchTerm) {
    loadTotalInventoryTable();
}

function resetPassword() {
    const email = document.getElementById('resetEmail').value;
    const errorElement = document.getElementById('reset-password-error');
    const successElement = document.getElementById('reset-password-success');
    
    supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    })
    .then(({ data, error }) => {
        if (error) {
            errorElement.textContent = error.message;
            successElement.textContent = '';
        } else {
            successElement.textContent = 'Password reset email sent. Check your inbox.';
            errorElement.textContent = '';
        }
    });
}

function showAddItemModal(section) {
    const modal = document.getElementById('addItemModal');
    document.getElementById('addItemForm').reset();
    modal.setAttribute('data-section', section);
    modal.classList.add('active');
}

function addNewItem() {
    const modal = document.getElementById('addItemModal');
    const section = modal.getAttribute('data-section');
    const name = document.getElementById('addItemName').value;
    const price = parseFloat(document.getElementById('addItemPrice').value);
    const stock = parseInt(document.getElementById('addItemStock').value);
    const expiryDate = document.getElementById('addItemExpiry').value;
    const newItem = { 
        section, 
        name, 
        price, 
        stock, 
        expiry_date: expiryDate,
        status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'), 
        created_by: currentUser ? currentUser.id : 'offline_user',
        created_at: new Date().toISOString()
    };
    
    saveDataToSupabase('inventory', newItem).then(() => {
        modal.classList.remove('active');
        showNotification(`${name} added successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
        console.error('Error adding item:', error);
        showNotification('Error adding item', 'error');
    });
}

function showAddInventoryModal(section) {
    const modal = document.getElementById('addInventoryModal');
    document.getElementById('addInventoryForm').reset();
    modal.setAttribute('data-section', section);
    modal.classList.add('active');
}

function addNewInventory() {
    const modal = document.getElementById('addInventoryModal');
    const section = modal.getAttribute('data-section');
    const name = document.getElementById('addInventoryName').value;
    const price = parseFloat(document.getElementById('addInventoryPrice').value);
    const stock = parseInt(document.getElementById('addInventoryStock').value);
    const expiryDate = document.getElementById('addInventoryExpiry').value;
    const description = document.getElementById('addInventoryDescription').value;
    const newItem = { 
        section, 
        name, 
        price, 
        stock, 
        expiry_date: expiryDate,
        description, 
        status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'), 
        created_by: currentUser ? currentUser.id : 'offline_user',
        created_at: new Date().toISOString()
    };
    
    saveDataToSupabase('inventory', newItem).then(() => {
        modal.classList.remove('active');
        showNotification(`${name} added successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
        console.error('Error adding item:', error);
        showNotification('Error adding item', 'error');
    });
}

function editInventoryItem(section, itemId) {
    const item = inventory[section].find(invItem => invItem.id === itemId);
    if (item) {
        document.getElementById('editInventoryName').value = item.name;
        document.getElementById('editInventoryPrice').value = item.price;
        document.getElementById('editInventoryStock').value = item.stock;
        document.getElementById('editInventoryExpiry').value = item.expiry_date || '';
        document.getElementById('editInventoryDescription').value = item.description || '';
        const editModal = document.getElementById('editInventoryModal');
        editModal.setAttribute('data-section', section);
        editModal.setAttribute('data-item-id', itemId);
        editModal.classList.add('active');
    }
}

function updateInventoryItem() {
    const editModal = document.getElementById('editInventoryModal');
    const section = editModal.getAttribute('data-section');
    const itemId = editModal.getAttribute('data-item-id');
    const name = document.getElementById('editInventoryName').value;
    const price = parseFloat(document.getElementById('editInventoryPrice').value);
    const stock = parseInt(document.getElementById('editInventoryStock').value);
    const expiryDate = document.getElementById('editInventoryExpiry').value;
    const description = document.getElementById('editInventoryDescription').value;
    const item = inventory[section].find(invItem => invItem.id === itemId);
    if (item) {
        const updatedItem = {
            ...item,
            name, 
            price, 
            stock, 
            expiry_date: expiryDate,
            description,
            status: stock > 10 ? 'in-stock' : (stock > 0 ? 'low-stock' : 'out-of-stock'),
            updated_by: currentUser ? currentUser.id : 'offline_user',
            updated_at: new Date().toISOString()
        };
        
        saveDataToSupabase('inventory', updatedItem, itemId).then(() => {
            editModal.classList.remove('active');
            showNotification(`${name} updated successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
        }).catch(error => {
            console.error('Error updating item:', error);
            showNotification('Error updating item', 'error');
        });
    }
}

function deleteInventoryItem(section, itemId) {
    if (confirm('Are you sure you want to delete this item?')) {
        const item = inventory[section].find(invItem => invItem.id === itemId);
        if (item) {
            // Mark as deleted locally
            item.deleted = true;
            item.deleted_at = new Date().toISOString();
            
            saveDataToSupabase('inventory', item, itemId).then(() => {
                inventory[section] = inventory[section].filter(invItem => invItem.id !== itemId);
                saveToLocalStorage(`inventory_${section}`, inventory[section]);
                loadInventoryTable(section);
                updateDepartmentStats(section);
                updateCategoryInventorySummary(section);
                updateTotalInventory();
                showNotification('Item deleted successfully', 'success');
            }).catch(error => {
                console.error('Error deleting item:', error);
                showNotification('Error deleting item', 'error');
            });
        }
    }
}

function addToCart(section, item) {
    if (item.stock <= 0) { showNotification(`${item.name} is out of stock`, 'error'); return; }
    const existingItem = carts[section].find(cartItem => cartItem.id === item.id);
    if (existingItem) {
        if (existingItem.quantity >= item.stock) { showNotification(`Cannot add more ${item.name}. Only ${item.stock} in stock.`, 'warning'); return; }
        existingItem.quantity += 1;
    } else {
        carts[section].push({ id: item.id, name: item.name, price: item.price, quantity: 1 });
    }
    updateCart(section); 
    showNotification(`${item.name} added to cart`, 'success');
}

function incrementQuantity(section, itemId) {
    const item = carts[section].find(cartItem => cartItem.id === itemId);
    const inventoryItem = inventory[section].find(invItem => invItem.id === itemId);
    if (item && inventoryItem && item.quantity < inventoryItem.stock) { 
        item.quantity += 1; 
        updateCart(section); 
    }
    else if (item && inventoryItem) { 
        showNotification(`Cannot add more ${item.name}. Only ${inventoryItem.stock} in stock.`, 'warning'); 
    }
}

function decrementQuantity(section, itemId) {
    const item = carts[section].find(cartItem => cartItem.id === itemId);
    if (item && item.quantity > 1) { 
        item.quantity -= 1; 
        updateCart(section); 
    }
}

function removeFromCart(section, itemId) {
    carts[section] = carts[section].filter(cartItem => cartItem.id !== itemId);
    updateCart(section);
}

function processCheckout(section) {
    if (carts[section].length === 0) { 
        showNotification('Your cart is empty', 'error'); 
        return; 
    }
    const checkoutModal = document.getElementById('checkoutModal');
    const checkoutSummary = document.getElementById('checkout-summary');
    let subtotal = 0; 
    let summaryHTML = '<table class="inventory-table">';
    carts[section].forEach(item => {
        const itemTotal = item.price * item.quantity; 
        subtotal += itemTotal;
        summaryHTML += `<tr><td>${item.name}</td><td>₦${item.price.toFixed(2)}</td><td>${item.quantity}</td><td>₦${itemTotal.toFixed(2)}</td></tr>`;
    });
    summaryHTML += `<tr><td colspan="3" class="total-label">Total</td><td>₦${subtotal.toFixed(2)}</td></tr></table>`;
    checkoutSummary.innerHTML = summaryHTML;
    checkoutModal.setAttribute('data-section', section);
    checkoutModal.classList.add('active');
}

function completeCheckout() {
    const checkoutModal = document.getElementById('checkoutModal');
    const section = checkoutModal.getAttribute('data-section');
    let subtotal = 0; 
    const saleItems = [];
    carts[section].forEach(item => {
        const itemTotal = item.price * item.quantity; 
        subtotal += itemTotal;
        saleItems.push({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, total: itemTotal });
        const inventoryItem = inventory[section].find(invItem => invItem.id === item.id);
        if (inventoryItem) {
            inventoryItem.stock -= item.quantity;
            inventoryItem.status = getProductStatus(inventoryItem);
            saveDataToSupabase('inventory', inventoryItem, inventoryItem.id).catch(error => console.error('Error updating inventory:', error));
        }
    });
    const saleRecord = {
        user_id: currentUser ? currentUser.id : 'offline_user', 
        user_email: currentUser ? currentUser.email : 'offline@example.com', 
        section, 
        items: saleItems, 
        subtotal, 
        total: subtotal,
        payment_method: document.getElementById('paymentMethod').value,
        customer_name: document.getElementById('customerName').value,
        customer_phone: document.getElementById('customerPhone').value,
        timestamp: new Date().toISOString()
    };
    
    saveDataToSupabase('sales', saleRecord).then(() => {
        // Update sales data
        salesData[section].totalSales += subtotal; 
        salesData[section].totalTransactions += 1;
        salesData[section].avgTransaction = salesData[section].totalSales / salesData[section].totalTransactions;
        salesData[section].dailySales += subtotal; 
        salesData[section].dailyTransactions += 1;
        userData[section].transactions += 1; 
        userData[section].sales += subtotal;
        
        // Save updated stats - FIXED: Changed table names
        saveDataToSupabase('sales_data', salesData[section], section);  // FIXED: Changed from 'salesData' to 'sales_data'
        saveDataToSupabase('user_data', userData[section], section);    // FIXED: Changed from 'userData' to 'user_data'
        
        carts[section] = [];
        updateCart(section); 
        loadInventoryTable(section); 
        updateReports(section);
        updateUserStats(section); 
        updateDepartmentStats(section);
        updateCategoryInventorySummary(section);
        updateTotalInventory();
        checkoutModal.classList.remove('active');
        showNotification(`Sale completed successfully${navigator.onLine ? '' : ' (will sync when online)'}`, 'success');
    }).catch(error => {
        console.error('Error saving sale:', error); 
        showNotification('Error saving sale. Please try again.', 'error');
    });
}

function filterInventory(section, searchTerm) { 
    loadInventoryTable(section); 
}

function updateReports(section) {
    document.getElementById(`${section}-total-sales`).textContent = `₦${salesData[section].totalSales.toFixed(2)}`;
    document.getElementById(`${section}-total-transactions`).textContent = salesData[section].totalTransactions;
    document.getElementById(`${section}-avg-transaction`).textContent = `₦${salesData[section].avgTransaction.toFixed(2)}`;
    document.getElementById(`${section}-top-item`).textContent = salesData[section].topItem;
}

function updateUserStats(section) {
    document.getElementById(`${section}-user-transactions`).textContent = userData[section].transactions;
    document.getElementById(`${section}-user-sales`).textContent = `₦${userData[section].sales.toFixed(2)}`;
}

function saveAccountInfo(section) {
    const fullName = document.getElementById(`${section}-fullname`).value;
    const email = document.getElementById(`${section}-email`).value;
    const phone = document.getElementById(`${section}-phone`).value;
    
    if (currentUser && navigator.onLine) {
        supabase.auth.updateUser({
            data: { full_name: fullName }
        }).then(({ data, error }) => {
            if (error) {
                console.error('Error updating profile:', error); 
                showNotification('Error updating profile', 'error');
                return;
            }
            
            updateUserInfo(data.user);
            const userData = { uid: data.user.id, displayName: fullName, email, phone, section };
            saveDataToSupabase('users', userData, data.user.id).then(() => {
                showNotification('Account information saved successfully', 'success');
            }).catch(error => {
                console.error('Error saving user data:', error); 
                showNotification('Error saving account information', 'error');
            });
        });
    } else {
        // Save locally for offline use
        const userData = { displayName: fullName, email, phone, section };
        saveToLocalStorage(`userProfile_${section}`, userData);
        showNotification('Account information saved locally (will sync when online)', 'info');
    }
}

function updateDepartmentStats(section) {
    const lowStockItems = inventory[section].filter(item => {
        const status = getProductStatus(item);
        return status === 'low-stock';
    }).length;
    document.getElementById(`${section}-daily-sales`).textContent = `₦${salesData[section].dailySales.toFixed(2)}`;
    document.getElementById(`${section}-daily-transactions`).textContent = salesData[section].dailyTransactions;
    document.getElementById(`${section}-low-stock`).textContent = lowStockItems;
}

function resetToPOSView(section) {
    document.querySelectorAll(`#${section}-section .sub-nav-item`).forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === 'pos') item.classList.add('active');
    });
    document.querySelectorAll(`#${section}-section .view-content`).forEach(view => view.classList.remove('active'));
    document.getElementById(`${section}-pos-view`).classList.add('active');
    currentView = 'pos';
}

function closeModal(modalId) { 
    document.getElementById(modalId).classList.remove('active'); 
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message; 
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    setTimeout(() => { 
        notification.classList.remove('show'); 
    }, 3000);
}

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(function(err) {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}