/**
 * Emby Local Server Plugin for Lampa Web
 * Версия 4.0 - Исправленная для bylampa.online / lampa.mx
 */

(function() {
    'use strict';

    console.log('[Emby Plugin] Starting...');

    // Настройки
    const PLUGIN_KEY = 'emby_local_settings';
    const PLUGIN_NAME = 'Emby Server';
    const PLUGIN_VERSION = '4.0.0';

    const defaults = {
        server_url: '',
        api_key: '',
        user_id: ''
    };

    // Работа с хранилищем Lampa
    function getSettings() {
        try {
            if (typeof Lampa !== 'undefined' && Lampa.Storage) {
                const data = Lampa.Storage.get(PLUGIN_KEY);
                return data ? Object.assign({}, defaults, data) : Object.assign({}, defaults);
            }
            return Object.assign({}, defaults);
        } catch (e) {
            console.error('[Emby] Storage error:', e);
            return Object.assign({}, defaults);
        }
    }

    function saveSettings(data) {
        try {
            if (typeof Lampa !== 'undefined' && Lampa.Storage) {
                Lampa.Storage.set(PLUGIN_KEY, data);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[Emby] Save error:', e);
            return false;
        }
    }

    // Поиск в Emby
    async function searchEmby(title, year, type) {
        const settings = getSettings();
        
        if (!settings.server_url || !settings.api_key) return [];

        const baseUrl = settings.server_url.replace(/\/$/, '');
        let url = `${baseUrl}/Items?IncludeItemTypes=${type === 'movie' ? 'Movie' : 'Series'}`;
        url += `&Recursive=true&SearchTerm=${encodeURIComponent(title)}`;
        url += `&api_key=${settings.api_key}&Limit=20`;

        if (year) url += `&Years=${year}`;
        if (settings.user_id) url += `&UserId=${settings.user_id}`;

        console.log('[Emby] Searching:', url);

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.Items?.length > 0) {
                return data.Items.map(item => ({
                    id: item.Id,
                    title: item.Name,
                    year: item.ProductionYear,
                    type: item.Type === 'Movie' ? 'movie' : 'series',
                    stream: `${baseUrl}/Videos/${item.Id}/stream?Static=true&api_key=${settings.api_key}`,
                    poster: item.ImageTags?.Primary ? 
                        `${baseUrl}/Items/${item.Id}/Images/Primary?api_key=${settings.api_key}&maxHeight=300` : null
                }));
            }
            return [];
        } catch (e) {
            console.error('[Emby] Search error:', e);
            return [];
        }
    }

    // Тест подключения
    async function testConnection(url, key) {
        try {
            const response = await fetch(`${url.replace(/\/$/, '')}/System/Info?api_key=${key}`);
            if (response.ok) {
                const data = await response.json();
                return { success: true, name: data.ServerName || 'Emby', version: data.Version || 'Unknown' };
            }
            return { success: false, error: `HTTP ${response.status}` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // Создание окна выбора
    function showSelectionModal(items) {
        const modal = document.createElement('div');
        modal.className = 'emby-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); z-index: 10000;
            display: flex; align-items: center; justify-content: center;
        `;

        modal.innerHTML = `
            <div style="background:#1c1c1e; border-radius:16px; width:90%; max-width:500px; max-height:80vh; display:flex; flex-direction:column;">
                <div style="padding:20px; border-bottom:1px solid #333;">
                    <h3 style="margin:0; color:#fff;">🎬 Найдено в Emby</h3>
                </div>
                <div style="overflow-y:auto; padding:10px;">
                    ${items.map((item, i) => `
                        <div class="emby-item" data-index="${i}" style="
                            display:flex; padding:12px; margin:8px 0; background:#2c2c2e;
                            border-radius:12px; cursor:pointer; align-items:center;
                            transition: background 0.2s;
                        ">
                            <div style="flex-shrink:0; width:45px; height:68px; margin-right:15px; 
                                border-radius:8px; overflow:hidden; background:#1c1c1e;
                                display:flex; align-items:center; justify-content:center;
                                font-size:24px;">
                                ${item.poster ? 
                                    `<img src="${item.poster}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">` :
                                    item.type === 'movie' ? '🎬' : '📺'}
                            </div>
                            <div style="flex:1; min-width:0;">
                                <div style="color:#fff; font-weight:500;">${item.title}</div>
                                <div style="color:#999; font-size:13px;">
                                    ${item.year || ''} • ${item.type === 'movie' ? 'Фильм' : 'Сериал'}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div style="padding:15px; border-top:1px solid #333;">
                    <button class="emby-close" style="
                        width:100%; padding:12px; background:#f44336; color:#fff;
                        border:none; border-radius:8px; font-size:15px; cursor:pointer;
                    ">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.emby-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelectorAll('.emby-item').forEach(el => {
            el.addEventListener('click', () => {
                const item = items[parseInt(el.dataset.index)];
                modal.remove();
                playStream(item);
            });
            el.addEventListener('mouseenter', () => el.style.background = '#3a3a3c');
            el.addEventListener('mouseleave', () => el.style.background = '#2c2c2e');
        });
    }

    // Воспроизведение
    function playStream(item) {
        console.log('[Emby] Playing:', item.title);
        
        if (typeof Lampa !== 'undefined') {
            Lampa.Noty.show(`▶️ ${item.title}`);
        }

        // Используем плеер Lampa
        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            Lampa.Player.play({
                title: item.title,
                url: item.stream,
                poster: item.poster,
                movie: item.type === 'movie',
                serial: item.type === 'series'
            });
        } else {
            // Fallback
            window.open(item.stream, '_blank');
        }
    }

    // Основная функция
    async function playFromEmby() {
        const settings = getSettings();
        
        if (!settings.server_url || !settings.api_key) {
            if (typeof Lampa !== 'undefined') {
                Lampa.Noty.show('⚙️ Настройте Emby сервер');
            }
            return;
        }

        // Получаем информацию о контенте
        let title = '';
        let year = null;
        let type = 'movie';

        // Из URL
        const url = window.location.href;
        if (url.includes('/serial/')) type = 'series';
        else if (url.includes('/movie/')) type = 'movie';

        // Из элементов страницы
        const titleEl = document.querySelector('.head__title, [data-name], h1, .movie-title, .serial-title');
        if (titleEl) {
            title = titleEl.textContent.trim();
        }

        // Из данных Lampa
        if (!title && typeof Lampa !== 'undefined') {
            try {
                if (Lampa.Listener) {
                    const event = Lampa.Listener.follow('movie_data', (data) => {
                        if (data && data.title) {
                            title = data.title;
                            year = data.year;
                            type = 'movie';
                        }
                    });
                }
            } catch (e) {}
        }

        if (!title) {
            if (typeof Lampa !== 'undefined') {
                Lampa.Noty.show('❌ Не удалось определить контент');
            }
            return;
        }

        if (typeof Lampa !== 'undefined') {
            Lampa.Noty.show(`🔍 Поиск "${title}"...`);
        }

        const items = await searchEmby(title, year, type);

        if (items.length === 0) {
            if (typeof Lampa !== 'undefined') {
                Lampa.Noty.show('😔 Не найдено в Emby');
            }
            return;
        }

        if (items.length === 1) {
            playStream(items[0]);
        } else {
            showSelectionModal(items);
        }
    }

    // Создание UI настроек
    function createSettingsUI() {
        const settings = getSettings();
        
        const container = document.createElement('div');
        container.style.cssText = 'padding: 20px; color: #fff;';
        
        container.innerHTML = `
            <h3 style="margin-bottom:20px;">Emby Server Settings</h3>
            
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px; color:#ccc;">URL сервера</label>
                <input type="text" id="emby_url" value="${settings.server_url}" 
                    placeholder="http://192.168.1.100:8096"
                    style="width:100%; padding:10px; background:#2c2c2e; color:#fff; 
                    border:1px solid #444; border-radius:8px; box-sizing:border-box;">
            </div>
            
            <div style="margin-bottom:15px;">
                <label style="display:block; margin-bottom:5px; color:#ccc;">API ключ</label>
                <input type="text" id="emby_key" value="${settings.api_key}" 
                    placeholder="API ключ из Emby"
                    style="width:100%; padding:10px; background:#2c2c2e; color:#fff; 
                    border:1px solid #444; border-radius:8px; box-sizing:border-box;">
            </div>
            
            <div style="margin-bottom:20px;">
                <label style="display:block; margin-bottom:5px; color:#ccc;">User ID</label>
                <input type="text" id="emby_user" value="${settings.user_id}" 
                    placeholder="Опционально"
                    style="width:100%; padding:10px; background:#2c2c2e; color:#fff; 
                    border:1px solid #444; border-radius:8px; box-sizing:border-box;">
            </div>
            
            <div style="display:flex; gap:10px; margin-bottom:15px;">
                <button id="emby_test" style="
                    flex:1; padding:10px; background:#2196F3; color:#fff;
                    border:none; border-radius:8px; cursor:pointer;">🔌 Тест</button>
                <button id="emby_save" style="
                    flex:1; padding:10px; background:#4CAF50; color:#fff;
                    border:none; border-radius:8px; cursor:pointer;">💾 Сохранить</button>
            </div>
            
            <div id="emby_status" style="
                padding:10px; border-radius:8px; display:none; font-size:13px;"></div>
            
            <div style="margin-top:20px; padding:15px; background:#2c2c2e; border-radius:8px;">
                <p style="margin:0; color:#999; font-size:12px;">
                    📝 API ключ можно найти в настройках Emby → API Keys
                </p>
            </div>
        `;

        // Обработчики после добавления в DOM
        setTimeout(() => {
            const saveBtn = document.getElementById('emby_save');
            const testBtn = document.getElementById('emby_test');
            const statusDiv = document.getElementById('emby_status');

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const data = {
                        server_url: document.getElementById('emby_url')?.value?.trim() || '',
                        api_key: document.getElementById('emby_key')?.value?.trim() || '',
                        user_id: document.getElementById('emby_user')?.value?.trim() || ''
                    };
                    
                    if (saveSettings(data)) {
                        statusDiv.style.display = 'block';
                        statusDiv.style.background = 'rgba(76,175,80,0.2)';
                        statusDiv.style.color = '#4CAF50';
                        statusDiv.textContent = '✅ Настройки сохранены';
                    }
                });
            }

            if (testBtn) {
                testBtn.addEventListener('click', async () => {
                    const url = document.getElementById('emby_url')?.value?.trim();
                    const key = document.getElementById('emby_key')?.value?.trim();
                    
                    if (!url || !key) {
                        statusDiv.style.display = 'block';
                        statusDiv.style.background = 'rgba(244,67,54,0.2)';
                        statusDiv.style.color = '#f44336';
                        statusDiv.textContent = '❌ Заполните URL и API ключ';
                        return;
                    }

                    statusDiv.style.display = 'block';
                    statusDiv.style.background = 'rgba(33,150,243,0.2)';
                    statusDiv.style.color = '#2196F3';
                    statusDiv.textContent = '⏳ Проверка...';

                    const result = await testConnection(url, key);
                    
                    if (result.success) {
                        statusDiv.style.background = 'rgba(76,175,80,0.2)';
                        statusDiv.style.color = '#4CAF50';
                        statusDiv.textContent = `✅ Подключено! ${result.name} (v${result.version})`;
                    } else {
                        statusDiv.style.background = 'rgba(244,67,54,0.2)';
                        statusDiv.style.color = '#f44336';
                        statusDiv.textContent = `❌ Ошибка: ${result.error}`;
                    }
                });
            }
        }, 100);

        return container;
    }

    // Создание кнопки на страницах контента
    function addPlayButton() {
        const observer = new MutationObserver(() => {
            // Ищем контейнеры для кнопок в разных версиях Lampa
            const selectors = [
                '.view__buttons',
                '.movie__buttons',
                '.serial__buttons',
                '.entity__buttons',
                '.actions',
                '[data-view="movie"] .buttons',
                '[data-view="serial"] .buttons'
            ];

            selectors.forEach(selector => {
                const containers = document.querySelectorAll(selector);
                containers.forEach(container => {
                    if (!container.querySelector('.emby-play-btn') && 
                        (window.location.href.includes('/movie/') || 
                         window.location.href.includes('/serial/'))) {
                        
                        const btn = document.createElement('div');
                        btn.className = 'emby-play-btn';
                        btn.textContent = '🎬 Смотреть с Emby';
                        btn.style.cssText = `
                            padding: 12px 20px;
                            margin: 5px 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border-radius: 8px;
                            cursor: pointer;
                            text-align: center;
                            font-size: 14px;
                            font-weight: 500;
                            transition: transform 0.2s;
                            user-select: none;
                        `;
                        
                        btn.addEventListener('click', playFromEmby);
                        btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.02)');
                        btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
                        
                        container.appendChild(btn);
                        console.log('[Emby] Button added to', selector);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Регистрация в системе плагинов Lampa
    function registerPlugin() {
        console.log('[Emby] Registering plugin...');

        // Способ 1: Добавление в главное меню расширений
        if (typeof Lampa !== 'undefined') {
            // Создаем компонент плагина
            const pluginComponent = {
                name: PLUGIN_NAME,
                version: PLUGIN_VERSION,
                description: 'Подключение к локальному Emby серверу',
                
                // Метод для отображения настроек
                settings: function() {
                    return createSettingsUI();
                },
                
                // Метод для открытия настроек
                open: function() {
                    // Пытаемся использовать модальное окно Lampa
                    if (Lampa.Modal) {
                        Lampa.Modal.open({
                            title: PLUGIN_NAME,
                            subtitle: 'Настройки подключения',
                            html: createSettingsUI().innerHTML,
                            width: 450
                        });
                    }
                }
            };

            // Пробуем разные способы регистрации
            try {
                // Для новых версий Lampa
                if (Lampa.Plugins && Lampa.Plugins.add) {
                    Lampa.Plugins.add(pluginComponent);
                    console.log('[Emby] Registered via Plugins.add');
                }
                // Для старых версий
                else if (Lampa.Plugin && Lampa.Plugin.register) {
                    Lampa.Plugin.register({
                        name: PLUGIN_NAME,
                        version: PLUGIN_VERSION,
                        settings: createSettingsUI
                    });
                    console.log('[Emby] Registered via Plugin.register');
                }
                // Универсальный способ через Component
                else if (Lampa.Component) {
                    Lampa.Component.add('plugins', {
                        emby_server: {
                            name: PLUGIN_NAME,
                            icon: 'server',
                            component: createSettingsUI
                        }
                    });
                    console.log('[Emby] Registered via Component.add');
                }
            } catch (e) {
                console.error('[Emby] Registration error:', e);
            }
        }

        // Запускаем наблюдатель для кнопок
        addPlayButton();

        // Уведомление
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show(`✅ Emby Plugin v${PLUGIN_VERSION}`);
        }
    }

    // Запуск после загрузки Lampa
    function init() {
        if (typeof Lampa !== 'undefined') {
            registerPlugin();
        } else {
            let attempts = 0;
            const interval = setInterval(() => {
                if (typeof Lampa !== 'undefined') {
                    clearInterval(interval);
                    registerPlugin();
                } else if (attempts > 30) {
                    clearInterval(interval);
                    console.error('[Emby] Lampa not found');
                }
                attempts++;
            }, 1000);
        }
    }

    // Запускаем
    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
