/const CONFIG = {
    seeds: { wheat: { cost: 10, grow: 5, sell: 15, icon: '🌾' }, carrot: { cost: 20, grow: 10, sell: 35, icon: '🥕' } },
    animals: { chicken: { cost: 100, prod: 5, sell: 20, icon: '🐔', product: '🥚' }, cow: { cost: 250, prod: 15, sell: 50, icon: '🐮', product: '🥛' } },
    plots: 6
};

class Game {
    constructor() {
        // Get username from browser storage (set by login page)
        this.user = sessionStorage.getItem('username');
        if (!this.user) {
            alert("You are not logged in! Redirecting...");
            window.location.href = '/';
            return;
        }

        this.data = null; // Will be filled by API
        this.timerLeft = 1500; // 25 mins
        this.timerRunning = false;
        this.loopId = null;

        this.init();
    }

    async init() {
        await this.loadData();
        ui.init();
        this.startLoop();
    }

    // --- API CALLS ---
    async loadData() {
        const response = await fetch('/api/get_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.user })
        });
        const result = await response.json();
        
        if (result.success) {
            this.data = result.data;
            // Initialize empty plots if new
            if(this.data.plots.length === 0) {
                for(let i=0; i<CONFIG.plots; i++) this.data.plots.push({ crop: null, start: 0, ready: false });
            }
        } else {
            alert("Error loading game data");
        }
    }

    async saveData() {
        await fetch('/api/save_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.user, game_data: this.data })
        });
        ui.updateHeader();
    }

    logout() {
        sessionStorage.removeItem('username');
        window.location.href = '/';
    }

    sellAll() {
        let total = 0;
        Object.keys(CONFIG.seeds).forEach(k => {
            if(this.data.inventory[k]) {
                total += this.data.inventory[k] * CONFIG.seeds[k].sell;
                delete this.data.inventory[k];
            }
        });
        Object.keys(CONFIG.animals).forEach(k => {
            if(this.data.inventory[k + '_prod']) {
                total += this.data.inventory[k + '_prod'] * CONFIG.animals[k].sell;
                delete this.data.inventory[k + '_prod'];
            }
        });

        if(total > 0) {
            this.data.coins += total;
            this.saveData();
            alert(`Sold everything for ${total} coins!`);
            ui.renderInventory();
        }
    }
}

const game = new Game();

// --- TIMER ---
const timer = {
    start: () => {
        if(game.timerRunning) return;
        game.timerRunning = true;
        game.loopId = setInterval(() => {
            if(game.timerLeft > 0) {
                game.timerLeft--;
                ui.renderTimer();
            } else {
                timer.finish();
            }
        }, 1000);
    },
    stop: () => { game.timerRunning = false; clearInterval(game.loopId); },
    reset: () => { timer.stop(); game.timerLeft = 1500; ui.renderTimer(); },
    finish: () => {
        timer.stop();
        game.data.coins += 50;
        game.data.stats.sessions++;
        game.saveData();
        ui.renderStats();
        alert("Session Complete! +50 Coins");
        timer.reset();
    }
};

// --- GAME LOOP ---
game.startLoop = function() {
    setInterval(() => {
        if(!game.data) return; // Wait for data to load
        
        // Crops
        game.data.plots.forEach((p, i) => {
            if(p.crop && !p.ready) {
                const elapsed = (Date.now() - p.start) / 1000;
                const max = CONFIG.seeds[p.crop].grow;
                if(elapsed >= max) {
                    p.ready = true;
                    ui.renderPlots();
                }
            }
        });
        // Animals
        game.data.animals.forEach((a, i) => {
            if(!a.ready) {
                const elapsed = (Date.now() - a.start) / 1000;
                const max = CONFIG.animals[a.type].prod;
                if(elapsed >= max) {
                    a.ready = true;
                    ui.renderAnimals();
                }
            }
        });
    }, 1000);
};

// --- UI ---
const ui = {
    init: () => {
        ui.updateHeader();
        ui.renderTimer();
        ui.renderPlots();
        ui.renderShop();
        ui.renderAnimals();
        ui.renderStats();
        ui.renderInventory();
    },
    show: (id) => {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${id}`).classList.add('active');
        document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
        document.getElementById(`btn-${id}`).classList.add('active');
    },
    updateHeader: () => { document.getElementById('coins').innerText = game.data.coins; },
    renderTimer: () => {
        const m = Math.floor(game.timerLeft/60).toString().padStart(2,'0');
        const s = (game.timerLeft%60).toString().padStart(2,'0');
        document.getElementById('timer').innerText = `${m}:${s}`;
    },
    renderPlots: () => {
        const el = document.getElementById('plots');
        el.innerHTML = '';
        game.data.plots.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'plot';
            div.onclick = () => {
                if(!p.crop) ui.plantModal(i);
                else if(p.ready) ui.harvest(i);
            };
            if(p.crop) {
                const icon = p.ready ? CONFIG.seeds[p.crop].icon : '🌱';
                div.innerText = icon;
                div.style.background = p.ready ? '#a5d6a7' : '#8d6e63';
            }
            el.appendChild(div);
        });
    },
    plantModal: (i) => {
        const seed = prompt("Enter 'wheat' (10c) or 'carrot' (20c):");
        if(seed && CONFIG.seeds[seed]) {
            if(game.data.coins >= CONFIG.seeds[seed].cost) {
                game.data.coins -= CONFIG.seeds[seed].cost;
                game.data.plots[i] = { crop: seed, start: Date.now(), ready: false };
                game.saveData();
                ui.renderPlots();
            } else alert("Not enough coins");
        }
    },
    harvest: (i) => {
        const p = game.data.plots[i];
        game.data.inventory[p.crop] = (game.data.inventory[p.crop] || 0) + 1;
        game.data.stats.harvests++;
        game.data.plots[i] = { crop: null, start: 0, ready: false };
        game.saveData();
        ui.renderPlots();
        ui.renderStats();
        ui.renderInventory();
    },
    renderShop: () => {
        const seedShop = document.getElementById('seed-shop');
        const animShop = document.getElementById('animal-shop');
        seedShop.innerHTML = ''; animShop.innerHTML = '';

        Object.keys(CONFIG.seeds).forEach(k => {
            const item = CONFIG.seeds[k];
            seedShop.innerHTML += `<div class="shop-item" onclick="ui.buySeed('${k}')">${item.icon}<br>${k}<br>${item.cost}c</div>`;
        });
        Object.keys(CONFIG.animals).forEach(k => {
            const item = CONFIG.animals[k];
            animShop.innerHTML += `<div class="shop-item" onclick="ui.buyAnimal('${k}')">${item.icon}<br>${k}<br>${item.cost}c</div>`;
        });
    },
    buySeed: (k) => {
        if(game.data.coins >= CONFIG.seeds[k].cost) {
            game.data.coins -= CONFIG.seeds[k].cost;
            alert("Click a plot to plant! (Simplified logic)");
            game.saveData();
        } else alert("Need coins");
    },
    buyAnimal: (k) => {
        if(game.data.coins >= CONFIG.animals[k].cost) {
            game.data.coins -= CONFIG.animals[k].cost;
            game.data.animals.push({ type: k, start: Date.now(), ready: false });
            game.saveData();
            ui.renderAnimals();
        } else alert("Need coins");
    },
    renderAnimals: () => {
        const el = document.getElementById('animals');
        el.innerHTML = '';
        if(game.data.animals.length === 0) el.innerHTML = 'No animals';
        game.data.animals.forEach((a, i) => {
            const div = document.createElement('div');
            div.className = 'animal';
            div.innerHTML = `${CONFIG.animals[a.type].icon}<br>`;
            if(a.ready) {
                div.innerHTML += `<button onclick="ui.collect(${i})">Collect</button>`;
                div.style.borderColor = 'green';
            } else {
                div.innerHTML += `Growing...`;
            }
            el.appendChild(div);
        });
    },
    collect: (i) => {
        const a = game.data.animals[i];
        const key = a.type + '_prod';
        game.data.inventory[key] = (game.data.inventory[key] || 0) + 1;
        a.start = Date.now(); a.ready = false;
        game.saveData();
        ui.renderAnimals();
        ui.renderInventory();
    },
    renderStats: () => {
        document.getElementById('stat-sessions').innerText = game.data.stats.sessions;
        document.getElementById('stat-harvests').innerText = game.data.stats.harvests;
    },
    renderInventory: () => {
        const el = document.getElementById('inventory-list');
        el.innerHTML = '';
        Object.keys(game.data.inventory).forEach(k => {
            el.innerHTML += `<div style="background:#eee; padding:5px; border-radius:4px; margin:2px;">${k}: ${game.data.inventory[k]}</div>`;
        });
    }
};