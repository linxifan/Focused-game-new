/**
 * DISCIPLINE FARM APP
 * Logic split into: Config, State, Timer, Farm, Shop, UI
 */

const CONFIG = {
    plots: 6,
    timerDuration: 25 * 60, // 25 mins
    timerReward: 50,
    items: {
        wheat: { type: 'seed', name: 'Wheat', cost: 10, sell: 15, growTime: 10, icon: '🌾' },
        carrot: { type: 'seed', name: 'Carrot', cost: 25, sell: 40, growTime: 20, icon: '🥕' },
        chicken: { type: 'animal', name: 'Chicken', cost: 100, product: 'Egg', productPrice: 15, produceTime: 60, icon: '🐔', productIcon: '🥚' },
        cow: { type: 'animal', name: 'Cow', cost: 300, product: 'Milk', productPrice: 40, produceTime: 120, icon: '🐮', productIcon: '🥛' }
    }
};

class App {
    constructor(initialData = null) {
        this.timerInterval = null;
        this.gameLoopInterval = null;
        this.selectedPlotIndex = null;
        this.currentTaskId = null;

        this.ui = new UI(this);
        this.timer = new Timer(this);
        this.farm = new Farm(this);
        this.shop = new Shop(this);

        this.init(initialData);
    }

    getInitialState() {
        return {
            coins: 0,
            totalSeconds: 0,
            inventory: { wheat: 0, carrot: 0, egg: 0, milk: 0 },
            plots: Array(CONFIG.plots).fill(null).map(() => ({ crop: null, plantedAt: 0, progress: 0, ready: false })),
            animals: [],
            stats: { planted: 0, harvested: 0, sessions: 0, tasksCompleted: 0 },
            tasks: [],
            currentTaskId: null,
            avatar: '👤',
            logs: []
        };
    }

    async init(initialData) {
        this.state = initialData || await this.loadState();
        // Ensure tasks array exists
        if (!this.state.tasks) this.state.tasks = [];
        if (!this.state.stats.tasksCompleted) this.state.stats.tasksCompleted = 0;
        if (!this.state.avatar) this.state.avatar = '👤';
        // Load current task ID from state
        this.currentTaskId = this.state.currentTaskId || null;
        // Set timer duration based on current task or default
        if (this.currentTaskId) {
            const task = this.state.tasks.find(t => t.id === this.currentTaskId);
            if (task && !task.completed) {
                this.timer.setDuration(task.duration * 60);
            } else {
                this.timer.setDuration(CONFIG.timerDuration);
                this.currentTaskId = null;
            }
        } else {
            this.timer.setDuration(CONFIG.timerDuration);
        }
        await this.ui.loadWeather();
        this.ui.renderAll();
        this.startGameLoop();
        this.log("System initialized. Welcome to Discipline Farm.");
    }

    setAvatar(avatar) {
        this.state.avatar = avatar;
        this.ui.renderAvatar();
        this.saveState();
        this.log(`Avatar changed to ${avatar}`);
    }

    startGameLoop() {
        this.gameLoopInterval = setInterval(() => {
            this.farm.update();
            this.ui.renderLiveUpdates();
        }, 1000);
    }

    async loadState() {
        try {
            const response = await fetch('/api/load');
            const data = await response.json();
            return data.success ? data.data : this.getInitialState();
        } catch (e) {
            console.error('Failed to load state:', e);
            return this.getInitialState();
        }
    }

    async saveState() {
        try {
            await fetch('/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.state)
            });
            this.ui.updateHeader();
        } catch (e) {
            console.error('Failed to save state:', e);
            this.ui.toast('Save failed!', 'red');
        }
    }

    addCoins(amt) {
        // Validate amount to prevent bugs
        if (typeof amt !== 'number' || isNaN(amt) || amt < 0) {
            console.error('Invalid coin amount:', amt);
            return;
        }
        // Prevent extremely large values (sanity check)
        if (amt > 10000) {
            console.error('Suspiciously large coin amount:', amt);
            return;
        }
        this.state.coins += amt;
        this.ui.toast(`+${amt} Coins`);
        this.saveState();
    }

    spendCoins(amt) {
        if (this.state.coins >= amt) {
            this.state.coins -= amt;
            this.saveState();
            return true;
        }
        this.ui.toast("Not enough coins!", "red");
        return false;
    }

    log(msg) {
        const time = new Date().toLocaleTimeString();
        this.state.logs.unshift({ time, msg });
        if (this.state.logs.length > 50) this.state.logs.pop();
        this.ui.renderLogs();
        this.saveState();
    }

    clearLogs() { this.state.logs = []; this.ui.renderLogs(); this.saveState(); }

    addTask(name, date, duration) {
        if (!name || !date || !duration || duration < 20) {
            this.ui.toast("Please fill all fields. Duration must be at least 20 minutes.", "red");
            return;
        }
        const task = {
            id: Date.now(),
            name: name.trim(),
            date: date,
            duration: parseInt(duration),
            completed: false,
            createdAt: Date.now()
        };
        this.state.tasks.push(task);
        this.log(`Added task: ${task.name} (${task.duration} min)`);
        this.ui.renderTasks();
        this.saveState();
    }

    selectTask(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (task.completed) {
            this.ui.toast("This task is already completed!", "orange");
            return;
        }
        
        // Check if task date has passed
        if (this.isTaskDatePassed(task)) {
            this.ui.toast("Cannot select task: The task date has passed!", "red");
            return;
        }
        
        // If already selected and timer is not running, unselect it
        if (this.currentTaskId === taskId && !this.timer.running) {
            this.currentTaskId = null;
            this.state.currentTaskId = null;
            this.timer.setDuration(CONFIG.timerDuration);
            this.ui.toast(`Unselected task: ${task.name}`, "blue");
            this.ui.updateTaskDisplay();
            this.ui.updateTimerControls();
            this.ui.renderTasks();
            this.saveState();
            return;
        }
        
        this.currentTaskId = taskId;
        this.state.currentTaskId = taskId;
        this.timer.setDuration(task.duration * 60); // Convert minutes to seconds
        this.ui.toast(`Selected task: ${task.name}`, "blue");
        this.ui.updateTaskDisplay();
        this.ui.updateTimerControls();
        this.ui.renderTasks();
        this.saveState();
    }

    isTaskDatePassed(task) {
        if (!task.date) return false;
        const taskDate = new Date(task.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate < today;
    }

    deleteTask(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (this.currentTaskId === taskId && this.timer.running) {
            this.ui.toast("Cannot delete task while timer is running!", "red");
            return;
        }
        
        if (confirm(`Are you sure you want to delete "${task.name}"?`)) {
            this.state.tasks = this.state.tasks.filter(t => t.id !== taskId);
            if (this.currentTaskId === taskId) {
                this.currentTaskId = null;
                this.state.currentTaskId = null;
                this.timer.setDuration(CONFIG.timerDuration);
            }
            this.log(`Deleted task: ${task.name}`);
            this.ui.updateTaskDisplay();
            this.ui.updateTimerControls();
            this.ui.renderTasks();
            this.saveState();
        }
    }

    modifyTask(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (this.timer.running && this.currentTaskId === taskId) {
            this.ui.toast("Cannot modify task while timer is running!", "red");
            return;
        }
        
        this.ui.openEditTaskModal(task);
    }

    saveTaskChanges(taskId, newName, newDuration) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (!newName || !newName.trim()) {
            this.ui.toast("Task name cannot be empty!", "red");
            return;
        }
        
        const duration = parseInt(newDuration);
        if (isNaN(duration) || duration < 20) {
            this.ui.toast("Invalid duration. Must be at least 20 minutes.", "red");
            return;
        }
        
        const oldName = task.name;
        const oldDuration = task.duration;
        
        task.name = newName.trim();
        task.duration = duration;
        
        if (this.currentTaskId === taskId) {
            this.timer.setDuration(duration * 60);
        }
        
        this.log(`Modified task: "${oldName}" → "${task.name}" (${oldDuration} min → ${duration} min)`);
        this.ui.closeEditTaskModal();
        this.ui.updateTaskDisplay();
        this.ui.renderTasks();
        this.saveState();
    }

    completeTask(taskId) {
        const task = this.state.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (task.completed) {
            return; // Already completed
        }
        
        task.completed = true;
        this.state.stats.tasksCompleted++;
        this.log(`Task completed: ${task.name}`);
        this.ui.renderTasks();
        this.ui.renderStats();
        this.saveState();
    }

    sellAll() {
        // Calculate total before modifying inventory
        let total = 0;
        const wheatCount = this.state.inventory.wheat || 0;
        const carrotCount = this.state.inventory.carrot || 0;
        const eggCount = this.state.inventory.egg || 0;
        const milkCount = this.state.inventory.milk || 0;
        
        if (wheatCount > 0) { 
            total += wheatCount * CONFIG.items.wheat.sell; 
        }
        if (carrotCount > 0) { 
            total += carrotCount * CONFIG.items.carrot.sell; 
        }
        if (eggCount > 0) { 
            total += eggCount * CONFIG.items.chicken.productPrice; 
        }
        if (milkCount > 0) { 
            total += milkCount * CONFIG.items.cow.productPrice; 
        }

        if (total > 0) {
            // Clear inventory after calculation
            this.state.inventory.wheat = 0;
            this.state.inventory.carrot = 0;
            this.state.inventory.egg = 0;
            this.state.inventory.milk = 0;
            
            this.addCoins(total);
            this.log(`Sold all resources for ${total} coins.`);
            this.ui.renderInventory();
        } else {
            this.ui.toast("Nothing to sell!", "orange");
        }
    }

    exportData() {
        const dataStr = JSON.stringify(this.state, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'discipline-farm-save.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        this.ui.toast('Data exported!');
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedState = JSON.parse(e.target.result);
                this.state = { ...this.getInitialState(), ...importedState };
                this.saveState();
                this.ui.renderAll();
                this.ui.toast('Data imported!');
            } catch (err) {
                console.error('Import failed:', err);
                this.ui.toast('Import failed!', 'red');
            }
        };
        reader.readAsText(file);
    }
}

class Timer {
    constructor(app) {
        this.app = app;
        this.left = CONFIG.timerDuration;
        this.originalDuration = CONFIG.timerDuration;
        this.running = false;
        this.finished = false; // Prevent multiple finish calls
    }
    
    setDuration(seconds) {
        if (this.running) {
            this.app.ui.toast("Cannot change duration while timer is running!", "red");
            return;
        }
        this.originalDuration = seconds;
        this.left = seconds;
        this.app.ui.renderTimer(this.left);
    }
    
    start() {
        if (this.running) return;
        this.running = true;
        this.finished = false; // Reset finished flag when starting
        this.app.log("Focus session started.");
        this.app.ui.updateTimerControls();
        this.interval = setInterval(() => {
            if (this.left > 0) {
                this.left--;
                this.app.ui.renderTimer(this.left);
            } else {
                this.finish();
            }
        }, 1000);
    }
    stop() {
        if (!this.running) return; // Prevent multiple stops
        this.running = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.app.log("Focus paused.");
        this.app.ui.updateTimerControls();
    }
    reset() {
        this.stop();
        this.finished = false; // Reset finished flag
        this.left = this.originalDuration;
        this.app.ui.renderTimer(this.left);
    }
    finish() {
        // Prevent multiple finish calls (race condition protection)
        if (this.finished || !this.running) return;
        
        // Clear interval FIRST to prevent race conditions
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        
        this.running = false;
        this.finished = true;
        
        // Calculate rewards: 1 coin per minute
        const minutes = Math.floor(this.originalDuration / 60);
        let coinsEarned = minutes;
        
        // Check if there's a current task and automatically complete it
        let taskCompleted = false;
        if (this.app.currentTaskId) {
            const task = this.app.state.tasks.find(t => t.id === this.app.currentTaskId);
            if (task && !task.completed) {
                // Automatically mark task as completed
                this.app.completeTask(this.app.currentTaskId);
                taskCompleted = true;
                this.app.state.stats.tasksCompleted++;
                coinsEarned += 20; // Bonus for completing task
                this.app.log(`Task completed: ${task.name}! +20 bonus coins`);
            }
        }
        
        this.app.addCoins(coinsEarned);
        this.app.state.totalSeconds += this.originalDuration;
        this.app.state.stats.sessions++;
        
        if (taskCompleted) {
            this.app.log(`Focus session complete! +${coinsEarned} Coins (${minutes} base + 20 task bonus)`);
        } else {
            this.app.log(`Focus session complete! +${coinsEarned} Coins (${minutes} minutes)`);
        }
        
        // Reset to original duration
        this.left = this.originalDuration;
        // Clear current task after completion
        if (taskCompleted) {
            this.app.currentTaskId = null;
            this.app.state.currentTaskId = null;
            // Reset to default duration
            this.originalDuration = CONFIG.timerDuration;
            this.left = CONFIG.timerDuration;
        }
        this.app.ui.updateTaskDisplay();
        this.app.ui.updateTimerControls();
        this.app.ui.renderAll();
    }
}

class Farm {
    constructor(app) { this.app = app; }

    update() {
        // Crops
        this.app.state.plots.forEach((p, i) => {
            if (p.crop && !p.ready) {
                const item = CONFIG.items[p.crop];
                const elapsed = (Date.now() - p.plantedAt) / 1000;
                const pct = Math.min((elapsed / item.growTime) * 100, 100);

                if (pct !== p.progress) {
                    p.progress = pct;
                    if (this.app.ui.currentView === 'plots') this.app.ui.updatePlotProgress(i, pct);
                    if (pct >= 100) {
                        p.ready = true;
                        if (this.app.ui.currentView === 'plots') this.app.ui.updatePlotIcon(i, item.icon);
                        this.app.log(`Crop ready: ${item.icon} at Plot ${i+1}`);
                    }
                }
            }
        });

        // Animals
        this.app.state.animals.forEach((a, i) => {
            if (!a.ready) {
                const item = CONFIG.items[a.type];
                if (Date.now() >= a.readyAt) {
                    a.ready = true;
                    if (this.app.ui.currentView === 'barn') this.app.ui.updateAnimalStatus(i, true);
                    this.app.log(`${item.icon} produced ${item.productIcon}`);
                }
            }
        });
    }

    clickPlot(i) {
        this.app.selectedPlotIndex = i;
        const p = this.app.state.plots[i];
        if (!p.crop) this.app.ui.openModal();
        else if (p.ready) this.harvest(i);
        else this.app.ui.toast("Growing...", "blue");
    }

    plant(type) {
        if (this.app.state.inventory[type] > 0) {
            this.app.state.inventory[type]--;
            this.app.state.plots[this.app.selectedPlotIndex] = {
                crop: type, plantedAt: Date.now(), progress: 0, ready: false
            };
            this.app.state.stats.planted++;
            this.app.ui.closeModal();
            this.app.ui.renderPlots();
            this.app.ui.renderInventory();
        } else {
            this.app.ui.toast("No seeds!", "red");
        }
    }

    harvest(i) {
        const p = this.app.state.plots[i];
        const type = p.crop;
        this.app.state.inventory[type]++;
        this.app.state.stats.harvested++;
        this.app.log(`Harvested ${CONFIG.items[type].icon}`);
        this.app.state.plots[i] = { crop: null, plantedAt: 0, progress: 0, ready: false };
        this.app.ui.renderPlots();
        this.app.ui.renderInventory();
    }

    collectAnimal(i) {
        const a = this.app.state.animals[i];
        if (a.ready) {
            const item = CONFIG.items[a.type];
            const prodKey = item.product.toLowerCase();
            this.app.state.inventory[prodKey]++;
            this.app.log(`Collected ${item.productIcon}`);
            a.readyAt = Date.now() + (item.produceTime * 1000);
            a.ready = false;
            this.app.ui.updateAnimalStatus(i, false);
            this.app.ui.renderInventory();
        }
    }
}

class Shop {
    constructor(app) { this.app = app; }

    buy(itemKey) {
        const item = CONFIG.items[itemKey];
        if (this.app.spendCoins(item.cost)) {
            if (item.type === 'seed') {
                this.app.state.inventory[itemKey]++;
                this.app.log(`Bought ${item.icon} seed`);
            } else {
                this.app.state.animals.push({
                    type: itemKey,
                    readyAt: Date.now() + (item.produceTime * 1000),
                    ready: false
                });
                this.app.log(`Bought ${item.icon}`);
            }
            this.app.ui.renderAll();
        }
    }
}

class UI {
    constructor(app) {
        this.app = app;
        this.currentView = 'focus';
        this.plotElements = [];
        this.animalElements = [];
        this.taskFilter = 'active'; // 'active' or 'finished'
        this.editingTaskId = null; // Track which task is being edited
    }

    initEventListeners() {
        // Timer buttons
        document.getElementById('btn-start').addEventListener('click', () => this.app.timer.start());
        document.getElementById('btn-stop').addEventListener('click', () => {
            if (this.app.currentTaskId && this.app.timer.running) {
                this.app.ui.toast("Pause is disabled while working on a task. Finish your task to enable pause.", "orange");
                return;
            }
            this.app.timer.stop();
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            if (this.app.currentTaskId && this.app.timer.running) {
                this.app.ui.toast("Reset is disabled while working on a task. Finish your task to enable reset.", "orange");
                return;
            }
            this.app.timer.reset();
        });

        // Sell button
        document.getElementById('sell-btn').addEventListener('click', () => this.app.sellAll());

        // Clear logs
        document.getElementById('clear-logs').addEventListener('click', () => this.app.clearLogs());

        // Logout (from nav bar)
        document.getElementById('nav-logout-btn').addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                await fetch('/api/logout', { method: 'POST' });
                window.location.href = '/';
            }
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());

        // Navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const viewId = btn.getAttribute('data-view');
                if (viewId) {
                    this.showView(viewId);
                }
            });
        });

        // Task management
        document.getElementById('btn-add-task').addEventListener('click', () => {
            const name = document.getElementById('task-name-input').value;
            const date = document.getElementById('task-date-input').value;
            const duration = document.getElementById('task-duration-input').value;
            this.app.addTask(name, date, duration);
            // Clear inputs
            document.getElementById('task-name-input').value = '';
            document.getElementById('task-date-input').value = '';
            document.getElementById('task-duration-input').value = '';
        });

        // Task filter tabs
        document.querySelectorAll('.task-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                this.taskFilter = filter;
                
                // Update active state
                document.querySelectorAll('.task-filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.color = '#666';
                    b.style.borderBottomColor = 'transparent';
                });
                btn.classList.add('active');
                btn.style.color = 'var(--primary-dark)';
                btn.style.borderBottomColor = 'var(--primary)';
                
                this.renderTasks();
            });
        });

        // Avatar selection
        const avatarElement = document.getElementById('profile-avatar');
        if (avatarElement) {
            avatarElement.addEventListener('click', () => this.openAvatarModal());
        }
        
        const avatarModalClose = document.getElementById('avatar-modal-close');
        if (avatarModalClose) {
            avatarModalClose.addEventListener('click', () => this.closeAvatarModal());
        }
        
        // Close avatar modal when clicking outside
        const avatarModal = document.getElementById('avatar-modal');
        if (avatarModal) {
            avatarModal.addEventListener('click', (e) => {
                if (e.target === avatarModal) {
                    this.closeAvatarModal();
                }
            });
        }

        // Edit task modal
        const editTaskCancel = document.getElementById('edit-task-cancel');
        if (editTaskCancel) {
            editTaskCancel.addEventListener('click', () => this.closeEditTaskModal());
        }

        const editTaskSave = document.getElementById('edit-task-save');
        if (editTaskSave) {
            editTaskSave.addEventListener('click', () => {
                const taskId = this.editingTaskId;
                if (!taskId) return;
                
                const newName = document.getElementById('edit-task-name').value;
                const newDuration = document.getElementById('edit-task-duration').value;
                this.app.saveTaskChanges(taskId, newName, newDuration);
            });
        }

        // Close edit task modal when clicking outside
        const editTaskModal = document.getElementById('edit-task-modal');
        if (editTaskModal) {
            editTaskModal.addEventListener('click', (e) => {
                if (e.target === editTaskModal) {
                    this.closeEditTaskModal();
                }
            });
        }
    }

    showView(viewId) {
        this.currentView = viewId;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-view="${viewId}"]`).classList.add('active');

        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`view-${viewId}`).classList.add('active');

        this.renderAll();
    }

    renderAll() {
        this.updateHeader();
        this.renderTimer(this.app.timer.left);
        this.updateTaskDisplay();
        this.updateTimerControls();
        this.renderAvatar();
        this.renderTasks();
        this.renderPlots();
        this.renderAnimals();
        this.renderShop();
        this.renderStats();
        this.renderLogs();
        this.renderInventory();
    }

    renderAvatar() {
        const avatarElement = document.getElementById('profile-avatar');
        if (avatarElement && this.app.state.avatar) {
            avatarElement.textContent = this.app.state.avatar;
        }
    }

    openAvatarModal() {
        const modal = document.getElementById('avatar-modal');
        const grid = document.getElementById('avatar-grid');
        if (!modal || !grid) return;

        // Cute cartoon avatars
        const avatars = [
            '👤', '👨', '👩', '🧑', '👨‍🦱', '👩‍🦱', '👨‍🦰', '👩‍🦰',
            '👨‍🦳', '👩‍🦳', '👨‍🦲', '👩‍🦲', '🧑‍🦱', '🧑‍🦰', '🧑‍🦳', '🧑‍🦲',
            '🐱', '🐶', '🐰', '🐻', '🐼', '🐨', '🦊', '🐸',
            '🐷', '🐮', '🐵', '🐯', '🦁', '🐹', '🐭', '🐨'
        ];

        grid.innerHTML = '';
        avatars.forEach(avatar => {
            const avatarBtn = document.createElement('button');
            avatarBtn.className = 'avatar-option';
            avatarBtn.textContent = avatar;
            avatarBtn.style.cssText = `
                font-size: 3rem;
                width: 80px;
                height: 80px;
                border: 3px solid ${this.app.state.avatar === avatar ? 'var(--primary)' : '#e0e0e0'};
                border-radius: 50%;
                background: ${this.app.state.avatar === avatar ? 'rgba(168, 200, 232, 0.2)' : 'white'};
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            avatarBtn.addEventListener('mouseenter', () => {
                if (this.app.state.avatar !== avatar) {
                    avatarBtn.style.borderColor = 'var(--primary)';
                    avatarBtn.style.transform = 'scale(1.1)';
                }
            });
            avatarBtn.addEventListener('mouseleave', () => {
                if (this.app.state.avatar !== avatar) {
                    avatarBtn.style.borderColor = '#e0e0e0';
                    avatarBtn.style.transform = 'scale(1)';
                }
            });
            avatarBtn.addEventListener('click', () => {
                this.app.setAvatar(avatar);
                this.closeAvatarModal();
            });
            grid.appendChild(avatarBtn);
        });

        modal.style.display = 'flex';
    }

    closeAvatarModal() {
        const modal = document.getElementById('avatar-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    openEditTaskModal(task) {
        const modal = document.getElementById('edit-task-modal');
        const nameInput = document.getElementById('edit-task-name');
        const durationInput = document.getElementById('edit-task-duration');
        
        if (!modal || !nameInput || !durationInput) return;
        
        this.editingTaskId = task.id;
        nameInput.value = task.name;
        durationInput.value = task.duration;
        
        modal.style.display = 'flex';
        
        // Focus on name input
        setTimeout(() => nameInput.focus(), 100);
    }

    closeEditTaskModal() {
        const modal = document.getElementById('edit-task-modal');
        if (modal) {
            modal.style.display = 'none';
            this.editingTaskId = null;
        }
    }

    updateTaskDisplay() {
        const taskDisplay = document.getElementById('current-task-display');
        const taskName = document.getElementById('current-task-name');
        const taskDuration = document.getElementById('current-task-duration');
        
        if (!taskDisplay || !taskName || !taskDuration) return;
        
        if (this.app.currentTaskId) {
            const task = this.app.state.tasks.find(t => t.id === this.app.currentTaskId);
            if (task && !task.completed) {
                taskDisplay.style.display = 'block';
                taskName.textContent = task.name;
                taskDuration.textContent = `Focus Time: ${task.duration} minutes`;
            } else {
                taskDisplay.style.display = 'none';
                this.app.currentTaskId = null;
                this.app.state.currentTaskId = null;
            }
        } else {
            taskDisplay.style.display = 'none';
        }
    }

    updateTimerControls() {
        const pauseBtn = document.getElementById('btn-stop');
        const resetBtn = document.getElementById('btn-reset');
        
        if (!pauseBtn || !resetBtn) return;
        
        // Disable pause and reset when timer is running (with or without task)
        const isRunning = this.app.timer.running;
        
        if (isRunning) {
            pauseBtn.disabled = true;
            resetBtn.disabled = true;
            pauseBtn.style.opacity = '0.5';
            pauseBtn.style.cursor = 'not-allowed';
            resetBtn.style.opacity = '0.5';
            resetBtn.style.cursor = 'not-allowed';
        } else {
            pauseBtn.disabled = false;
            resetBtn.disabled = false;
            pauseBtn.style.opacity = '1';
            pauseBtn.style.cursor = 'pointer';
            resetBtn.style.opacity = '1';
            resetBtn.style.cursor = 'pointer';
        }
    }

    renderLiveUpdates() {
        // Optimized: Only update visible elements
        if (this.currentView === 'plots') {
            // Progress updates are handled in updatePlotProgress
        }
        if (this.currentView === 'barn') {
            // Animal updates handled in updateAnimalStatus
        }
    }

    updateHeader() {
        document.getElementById('header-coins').textContent = this.app.state.coins;
    }

    renderTimer(secs) {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        document.getElementById('timer-display').textContent = `${m}:${s}`;
    }

    renderPlots() {
        const grid = document.getElementById('farm-grid');
        grid.innerHTML = '';
        this.plotElements = [];
        this.app.state.plots.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'plot';
            div.setAttribute('aria-label', `Plot ${i + 1}`);
            div.tabIndex = 0;
            div.addEventListener('click', () => this.app.farm.clickPlot(i));
            div.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.app.farm.clickPlot(i); });

            const iconDiv = document.createElement('div');
            iconDiv.style.fontSize = '3rem';
            const progressDiv = document.createElement('div');
            progressDiv.className = 'progress-bar';

            if (p.crop) {
                const item = CONFIG.items[p.crop];
                iconDiv.textContent = p.ready ? item.icon : '🌱';
                progressDiv.style.width = `${p.progress}%`;
            } else {
                iconDiv.textContent = '+';
                iconDiv.style.opacity = '0.3';
                iconDiv.style.fontSize = '2rem';
            }

            div.appendChild(iconDiv);
            div.appendChild(progressDiv);
            grid.appendChild(div);
            this.plotElements[i] = { icon: iconDiv, progress: progressDiv };
        });
    }

    updatePlotProgress(i, pct) {
        if (this.plotElements[i]) {
            this.plotElements[i].progress.style.width = `${pct}%`;
        }
    }

    updatePlotIcon(i, icon) {
        if (this.plotElements[i]) {
            this.plotElements[i].icon.textContent = icon;
        }
    }

    renderAnimals() {
        const list = document.getElementById('animal-list');
        list.innerHTML = '';
        this.animalElements = [];
        if (this.app.state.animals.length === 0) {
            list.innerHTML = '<div style="width:100%; text-align:center; color:#999">No animals yet.</div>';
            return;
        }
        this.app.state.animals.forEach((a, i) => {
            const item = CONFIG.items[a.type];
            const div = document.createElement('div');
            div.className = 'animal-card';

            const iconDiv = document.createElement('div');
            iconDiv.className = 'animal-icon';
            iconDiv.textContent = item.icon;

            const nameDiv = document.createElement('div');
            nameDiv.style.fontWeight = 'bold';
            nameDiv.textContent = item.name;

            const actionDiv = document.createElement('div');

            if (a.ready) {
                const btn = document.createElement('button');
                btn.className = 'shop-buy-btn';
                btn.textContent = `Collect ${item.productIcon}`;
                btn.addEventListener('click', () => this.app.farm.collectAnimal(i));
                actionDiv.appendChild(btn);
                div.style.borderColor = 'var(--primary)';
            } else {
                const secs = Math.max(0, Math.ceil((a.readyAt - Date.now()) / 1000));
                actionDiv.innerHTML = `<small>Wait ${secs}s</small>`;
            }

            div.appendChild(iconDiv);
            div.appendChild(nameDiv);
            div.appendChild(actionDiv);
            list.appendChild(div);
            this.animalElements[i] = { card: div, action: actionDiv };
        });
    }

    updateAnimalStatus(i, ready) {
        if (this.animalElements[i]) {
            const item = CONFIG.items[this.app.state.animals[i].type];
            if (ready) {
                this.animalElements[i].action.innerHTML = '';
                const btn = document.createElement('button');
                btn.className = 'shop-buy-btn';
                btn.textContent = `Collect ${item.productIcon}`;
                btn.addEventListener('click', () => this.app.farm.collectAnimal(i));
                this.animalElements[i].action.appendChild(btn);
                this.animalElements[i].card.style.borderColor = 'var(--primary)';
            } else {
                const secs = Math.max(0, Math.ceil((this.app.state.animals[i].readyAt - Date.now()) / 1000));
                this.animalElements[i].action.innerHTML = `<small>Wait ${secs}s</small>`;
                this.animalElements[i].card.style.borderColor = '#ffe0b2';
            }
        }
    }

    renderShop() {
        // Seed Shop
        const seedContainer = document.getElementById('seed-shop');
        seedContainer.innerHTML = '';
        ['wheat', 'carrot'].forEach(key => {
            const item = CONFIG.items[key];
            const btn = document.createElement('div');
            btn.className = 'shop-item';
            btn.setAttribute('aria-label', `Buy ${item.name} for ${item.cost} coins`);
            btn.tabIndex = 0;
            btn.addEventListener('click', () => this.app.shop.buy(key));
            btn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.app.shop.buy(key); });

            btn.innerHTML = `
                <div style="font-size:2rem">${item.icon}</div>
                <div>${item.name}</div>
                <div class="shop-price">${item.cost} Coins</div>
                <button class="shop-buy-btn" id="btn-buy-${key}">Buy</button>
            `;
            seedContainer.appendChild(btn);
            const buyBtn = btn.querySelector('.shop-buy-btn');
            buyBtn.disabled = this.app.state.coins < item.cost;
            buyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.app.shop.buy(key); });
        });

        // Animal Shop
        const animalContainer = document.getElementById('animal-shop');
        animalContainer.innerHTML = '';
        ['chicken', 'cow'].forEach(key => {
            const item = CONFIG.items[key];
            const btn = document.createElement('div');
            btn.className = 'shop-item';
            btn.setAttribute('aria-label', `Buy ${item.name} for ${item.cost} coins`);
            btn.tabIndex = 0;
            btn.addEventListener('click', () => this.app.shop.buy(key));
            btn.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.app.shop.buy(key); });

            btn.innerHTML = `
                <div style="font-size:2rem">${item.icon}</div>
                <div>${item.name}</div>
                <div class="shop-price">${item.cost} Coins</div>
                <button class="shop-buy-btn" id="btn-buy-${key}">Buy</button>
            `;
            animalContainer.appendChild(btn);
            const buyBtn = btn.querySelector('.shop-buy-btn');
            buyBtn.disabled = this.app.state.coins < item.cost;
            buyBtn.addEventListener('click', (e) => { e.stopPropagation(); this.app.shop.buy(key); });
        });
    }

    renderStats() {
        document.getElementById('stat-planted').textContent = this.app.state.stats.planted;
        document.getElementById('stat-harvested').textContent = this.app.state.stats.harvested;
        document.getElementById('stat-sessions').textContent = this.app.state.stats.sessions;
        const h = Math.floor(this.app.state.totalSeconds / 3600);
        const m = Math.floor((this.app.state.totalSeconds % 3600) / 60);
        document.getElementById('stat-time').textContent = `${h}h ${m}m`;
        document.getElementById('stat-tasks').textContent = this.app.state.stats.tasksCompleted || 0;
    }

    renderTasks() {
        const taskList = document.getElementById('task-list');
        if (!taskList) return;
        
        taskList.innerHTML = '';
        
        if (!this.app.state.tasks || this.app.state.tasks.length === 0) {
            taskList.innerHTML = '<p style="color: #999; text-align: center; padding: 1rem;">No tasks yet. Add a task to get started!</p>';
            return;
        }
        
        // Filter tasks based on selected filter
        let filteredTasks = [];
        if (this.taskFilter === 'finished') {
            // Show only completed tasks
            filteredTasks = this.app.state.tasks.filter(task => task.completed);
        } else {
            // Show active tasks (not completed AND date hasn't passed)
            filteredTasks = this.app.state.tasks.filter(task => {
                if (task.completed) return false;
                return !this.app.isTaskDatePassed(task);
            });
        }
        
        if (filteredTasks.length === 0) {
            const message = this.taskFilter === 'finished' 
                ? 'No finished tasks yet.'
                : 'No active tasks. All tasks are either completed or past their due date.';
            taskList.innerHTML = `<p style="color: #999; text-align: center; padding: 1rem;">${message}</p>`;
            return;
        }
        
        // Sort tasks by date
        const sortedTasks = [...filteredTasks].sort((a, b) => {
            return new Date(a.date) - new Date(b.date);
        });
        
        sortedTasks.forEach(task => {
            const isDatePassed = this.app.isTaskDatePassed(task);
            const isOngoing = this.app.currentTaskId === task.id && this.app.timer.running;
            const isSelected = this.app.currentTaskId === task.id && !this.app.timer.running;
            
            const taskDiv = document.createElement('div');
            taskDiv.className = 'task-item';
            taskDiv.style.cssText = `
                display: flex;
                align-items: center;
                gap: 1rem;
                padding: 1rem;
                margin-bottom: 0.5rem;
                background: ${task.completed ? '#f5f5f5' : '#fff'};
                border: 2px solid ${task.completed ? '#ccc' : (isOngoing || isSelected ? 'var(--primary)' : (isDatePassed ? '#f44336' : '#e0e0e0'))};
                border-radius: 8px;
                text-decoration: ${task.completed ? 'line-through' : 'none'};
                opacity: ${task.completed ? '0.6' : (isDatePassed ? '0.7' : '1')};
            `;
            
            const taskInfo = document.createElement('div');
            taskInfo.style.cssText = 'flex: 1; text-align: left;';
            const dateStatus = isDatePassed && !task.completed 
                ? ' <span style="color: #f44336; font-weight: bold;">[Date Passed]</span>' 
                : '';
            const statusText = isOngoing 
                ? ' <span style="color: var(--primary); font-weight: bold;">[Ongoing]</span>' 
                : (isSelected ? ' <span style="color: var(--primary); font-weight: bold;">[Selected]</span>' : '');
            
            taskInfo.innerHTML = `
                <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.3rem;">${task.name}</div>
                <div style="color: #666; font-size: 0.9rem;">
                    📅 ${new Date(task.date).toLocaleDateString()} | ⏱️ ${task.duration} min
                    ${statusText}
                    ${dateStatus}
                </div>
            `;
            
            // Action buttons container
            const actionContainer = document.createElement('div');
            actionContainer.style.cssText = 'display: flex; gap: 0.5rem; align-items: center;';
            
            // Select button
            const selectBtn = document.createElement('button');
            selectBtn.className = 'shop-buy-btn';
            if (task.completed) {
                selectBtn.textContent = '✓ Completed';
                selectBtn.disabled = true;
            } else if (isDatePassed) {
                selectBtn.textContent = 'Date Passed';
                selectBtn.disabled = true;
            } else if (isOngoing) {
                selectBtn.textContent = 'Ongoing';
                selectBtn.disabled = true;
            } else if (isSelected) {
                selectBtn.textContent = 'Unselect';
                selectBtn.disabled = false;
            } else {
                selectBtn.textContent = 'Select';
                selectBtn.disabled = this.app.timer.running;
            }
            selectBtn.style.cssText = (task.completed || isDatePassed || isOngoing || (this.app.timer.running && !isSelected)) ? 'opacity: 0.5; cursor: not-allowed;' : '';
            selectBtn.addEventListener('click', () => {
                if (!task.completed && !isDatePassed && !isOngoing) {
                    if (isSelected || !this.app.timer.running) {
                        this.app.selectTask(task.id);
                    }
                }
            });
            
            // Modify button (only for active, non-ongoing tasks)
            const modifyBtn = document.createElement('button');
            modifyBtn.textContent = '✏️';
            modifyBtn.title = 'Modify focus time';
            modifyBtn.style.cssText = `
                padding: 0.5rem;
                border: 1px solid #e0e0e0;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1rem;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            modifyBtn.disabled = task.completed || isDatePassed || isOngoing;
            if (task.completed || isDatePassed || isOngoing) {
                modifyBtn.style.opacity = '0.5';
                modifyBtn.style.cursor = 'not-allowed';
            }
            modifyBtn.addEventListener('click', () => {
                if (!task.completed && !isDatePassed && !isOngoing) {
                    this.app.modifyTask(task.id);
                }
            });
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '❌';
            deleteBtn.title = 'Delete task';
            deleteBtn.style.cssText = `
                padding: 0.5rem;
                border: 1px solid #e0e0e0;
                background: white;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1rem;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            deleteBtn.disabled = isOngoing;
            if (isOngoing) {
                deleteBtn.style.opacity = '0.5';
                deleteBtn.style.cursor = 'not-allowed';
            }
            deleteBtn.addEventListener('click', () => {
                if (!isOngoing) {
                    this.app.deleteTask(task.id);
                }
            });
            
            actionContainer.appendChild(selectBtn);
            if (!task.completed) {
                actionContainer.appendChild(modifyBtn);
            }
            actionContainer.appendChild(deleteBtn);
            
            taskDiv.appendChild(taskInfo);
            taskDiv.appendChild(actionContainer);
            taskList.appendChild(taskDiv);
        });
    }

    renderLogs() {
        const box = document.getElementById('log-box');
        box.innerHTML = this.app.state.logs.map(l =>
            `<div class="log-entry"><span class="log-time">[${l.time}]</span> ${l.msg}</div>`
        ).join('');
    }

    renderInventory() {
        const inv = document.getElementById('inventory-display');
        const map = { wheat: 'Wheat', carrot: 'Carrot', egg: 'Eggs', milk: 'Milk' };
        const icons = { wheat: '🌾', carrot: '🥕', egg: '🥚', milk: '🥛' };

        inv.innerHTML = '';
        Object.keys(this.app.state.inventory).forEach(k => {
            const count = this.app.state.inventory[k];
            if (count > 0) {
                const div = document.createElement('div');
                div.style.background = '#fff';
                div.style.border = '1px solid #eee';
                div.style.padding = '10px 20px';
                div.style.borderRadius = '8px';
                div.textContent = `${icons[k] || ''} ${map[k]}: ${count}`;
                inv.appendChild(div);
            }
        });
        if (inv.innerHTML === '') inv.innerHTML = '<span style="color:#999">Inventory Empty</span>';
    }

    openModal() {
        const list = document.getElementById('modal-seed-list');
        list.innerHTML = '';
        ['wheat', 'carrot'].forEach(k => {
            const count = this.app.state.inventory[k];
            if (count > 0) {
                const btn = document.createElement('button');
                btn.className = 'shop-buy-btn';
                btn.style.flex = '1';
                btn.textContent = `${CONFIG.items[k].icon} Plant ${CONFIG.items[k].name} (x${count})`;
                btn.addEventListener('click', () => this.app.farm.plant(k));
                list.appendChild(btn);
            }
        });
        if (list.innerHTML === '') list.innerHTML = '<p style="color:red">No seeds in inventory! Go to Seed Market.</p>';
        document.getElementById('plant-modal').style.display = 'flex';
    }

    closeModal() { document.getElementById('plant-modal').style.display = 'none'; }

    async loadWeather() {
        try {
            const response = await fetch('/api/weather');
            const data = await response.json();
            if (data.success) {
                document.body.classList.add(`weather-${data.type}`);
                const badge = document.getElementById('weather-badge');
                if (badge) {
                    const icon = document.getElementById('weather-icon');
                    const text = document.getElementById('weather-text');
                    icon.textContent = this.getWeatherIcon(data.type);
                    text.textContent = `${data.city} - ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}`;
                }
            }
        } catch (e) {
            console.error('Failed to load weather:', e);
        }
    }

    getWeatherIcon(type) {
        const icons = { sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️' };
        return icons[type] || '☀️';
    }

    toast(msg, color) {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        if (color) t.style.borderLeft = `4px solid ${color}`;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }
}