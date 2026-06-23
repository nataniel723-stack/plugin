/**
 * Emby Local Server Plugin for Lampa Web
 * Версия 3.0 - Для bylampa.online / lampa.mx
 * Загрузка через GitHub
 */

(function() {
    'use strict';

    console.log('[Emby Plugin] Starting initialization...');

    // Настройки по умолчанию
    const PLUGIN_KEY = 'emby_local_settings';
    const PLUGIN_VERSION = '3.0.0';
    
    const defaults = {
        server_url: '',
        api_key: '',
        user_id: ''
    };

    // Загрузка/сохранение настроек
    const storage = {
        get() {
            try {
                const data = Lampa.Storage.get(PLUGIN_KEY);
                console.log('[Emby Plugin] Loaded settings:', data);
                return data ? {...defaults, ...data} : {...defaults};
            } catch (e) {
                console.error('[Emby Plugin] Storage get error:', e);
                return {...defaults};
            }
        },
        set(data) {
            try {
                Lampa.Storage.set(PLUGIN_KEY, data);
                console.log('[Emby Plugin] Settings saved');
                return true;
            } catch (e) {
                console.error('[Emby Plugin] Storage set error:', e);
                return false;
            }
        }
    };

    // Функция для поиска в Emby
    async function searchEmby(title, year, type) {
        const settings = storage.get();
        
        if (!settings.server_url || !settings.api_key) {
            console.log('[Emby Plugin] Not configured');
            return [];
        }

        const baseUrl = settings.server_url.replace(/\/$/, '');
        let url = `${baseUrl}/Items?IncludeItemTypes=${type === 'movie' ? 'Movie' : 'Series'}`;
        url += `&Recursive=true&SearchTerm=${encodeURIComponent(title)}`;
        url += `&api_key=${settings.api_key}`;
        url += `&Limit=20&SortBy=SearchScore&SortOrder=Descending`;
        
        if (year) url += `&Years=${year}`;
        if (settings.user_id) url += `&UserId=${settings.user_id}`;

        console.log('[Emby Plugin] Search URL:', url);

        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.Items && data.Items.length > 0) {
                console.log('[Emby Plugin] Found items:', data.Items.length);
                
                return data.Items.map(item => ({
                    id: item.Id,
                    title: item.Name,
                    year: item.ProductionYear,
                    type: item.Type === 'Movie' ? 'movie' : 'series',
                    overview: item.Overview,
                    stream: `${baseUrl}/Videos/${item.Id}/stream?Static=true&api_key=${settings.api_key}`,
                    poster: item.ImageTags?.Primary ? 
                        `${baseUrl}/Items/${item.Id}/Images/Primary?api_key=${settings.api_key}&maxHeight=300` : 
                        null
                }));
            }
            console.log('[Emby Plugin] Nothing found');
            return [];
        } catch (e) {
            console.error('[Emby Plugin] Search error:', e);
            return [];
        }
    }

    // Тест подключения
    async function testConnection(server_url, api_key) {
        try {
            const baseUrl = server_url.replace(/\/$/, '');
            const response = await fetch(`${baseUrl}/System/Info?api_key=${api_key}`);
            const data = await response.json();
            return {
                success: true,
                name: data.ServerName || 'Emby Server',
                version: data.Version || 'Unknown'
            };
        } catch (e) {
            return {
                success: false,
                error: e.message
            };
        }
    }

    // Показать модальное окно с выбором
    function showSelectionModal(items) {
        const html = `
            <div class="emby-modal-wrapper" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;">
                <div class="emby-modal" style="background:#1c1c1e;border-radius:16px;width:90%;max-width:500px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
                    <div style="padding:20px;border-bottom:1px solid #333;">
                        <h3 style="margin:0;color:#fff;font-size:18px;">Найдено в Emby</h3>
                    </div>
                    <div style="overflow-y:auto;flex:1;padding:10px;" id="emby-items-list">
                        ${items.map((item, i) => `
                            <div class="emby-item" data-index="${i}" style="display:flex;padding:12px;margin:8px 0;background:#2c2c2e;border-radius:12px;cursor:pointer;transition:all 0.2s;align-items:center;">
                                ${item.poster ? `
                                    <div style="flex-shrink:0;width:50px;height:75px;margin-right:15px;border-radius:8px;overflow:hidden;background:#1c1c1e;">
                                        <img src="${item.poster}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">
                                    </div>
                                ` : `
                                    <div style="flex-shrink:0;width:50px;height:75px;margin-right:15px;border-radius:8px;background:#1c1c1e;display:flex;align-items:center;justify-content:center;font-size:24px;">
                                        ${item.type === 'movie' ? '🎬' : '📺'}
                                    </div>
                                `}
                                <div style="flex:1;min-width:0;">
                                    <div style="color:#fff;font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${item.title}</div>
                                    <div style="color:#999;font-size:13px;margin-top:4px;">
                                        ${item.year ? item.year + ' • ' : ''}${item.type === 'movie' ? 'Фильм' : 'Сериал'}
                                    </div>
                                </div>
                                <div style="flex-shrink:0;margin-left:10px;color:#667eea;font-size:20px;">▶️</div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="padding:15px;border-top:1px solid #333;">
                        <button class="emby-close-btn" style="width:100%;padding:12px;background:#f44336;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">Закрыть</button>
                    </div>
                </div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        // Обработчики
        const closeBtn = wrapper.querySelector('.emby-close-btn');
        const modalWrapper = wrapper.querySelector('.emby-modal-wrapper');
        
        closeBtn.addEventListener('click', () => wrapper.remove());
        modalWrapper.addEventListener('click', (e) => {
            if (e.target === modalWrapper) wrapper.remove();
        });

        // Выбор элемента
        wrapper.querySelectorAll('.emby-item').forEach(el => {
            el.addEventListener('click', () => {
                const index = parseInt(el.dataset.index);
                const item = items[index];
                wrapper.remove();
                playStream(item);
            });

            // Hover эффект
            el.addEventListener('mouseenter', () => {
                el.style.background = '#3a3a3c';
                el.style.transform = 'scale(1.02)';
            });
            el.addEventListener('mouseleave', () => {
                el.style.background = '#2c2c2e';
                el.style.transform = 'scale(1)';
            });
        });
    }

    // Воспроизведение
    function playStream(item) {
        console.log('[Emby Plugin] Playing:', item.title);
        
        Lampa.Noty.show(`🎬 Запускаем: ${item.title}`);
        
        // Используем встроенный плеер Lampa
        if (Lampa.Player) {
            Lampa.Player.play({
                title: item.title,
                url: item.stream,
                poster: item.poster,
                movie: item.type === 'movie',
                serial: item.type === 'series'
            });
        } else {
            // Fallback для старых версий
            window.location.href = item.stream;
        }
    }

    // Основная функция поиска и воспроизведения
    async function playFromEmby() {
        const settings = storage.get();
        
        if (!settings.server_url || !settings.api_key) {
            Lampa.Noty.show('⚙️ Настройте Emby сервер в расширениях', {time: 5000});
            return;
        }

        // Получаем данные о текущем контенте
        let title = '';
        let year = null;
        let type = 'movie';

        // Lampa хранит данные в разных местах
        if (Lampa.Activity && Lampa.Activity.active) {
            const active = Lampa.Activity.active();
            if (active) {
                if (active.movie) {
                    title = active.movie.title || active.movie.name || '';
                    year = active.movie.year || active.movie.release_date?.split('-')[0] || null;
                    type = 'movie';
                } else if (active.serial || active.season || active.episode) {
                    title = active.serial?.title || active.serial?.name || '';
                    year = active.serial?.year || active.serial?.first_air_date?.split('-')[0] || null;
                    type = 'series';
                }
            }
        }

        // Альтернативные способы получить название
        if (!title) {
            const titleElement = document.querySelector('.head__title, [data-title], .movie-title, .serial-title');
            if (titleElement) {
                title = titleElement.textContent.trim();
                if (titleElement.dataset.title) title = titleElement.dataset.title;
            }
        }

        // Определяем тип по URL или элементам на странице
        if (window.location.href.includes('/serial/') || 
            document.querySelector('.seasons-selector, .episodes-list, .serial-poster')) {
            type = 'series';
        }

        console.log('[Emby Plugin] Searching for:', {title, year, type});

        if (!title) {
            Lampa.Noty.show('❌ Не удалось определить название');
            return;
        }

        Lampa.Noty.show(`🔍 Ищем "${title}" в Emby...`);

        const items = await searchEmby(title, year, type);

        if (items.length === 0) {
            Lampa.Noty.show('😔 Не найдено в Emby библиотеке');
            return;
        }

        if (items.length === 1) {
            playStream(items[0]);
        } else {
            showSelectionModal(items);
        }
    }

    // Компонент настроек
    function createSettingsComponent() {
        const settings = storage.get();

        return {
            title: 'Emby Server',
            subtitle: 'Локальный медиа-сервер',
            icon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M21,3H3C1.9,3 1,3.9 1,5V19C1,20.1 1.9,21 3,21H21C22.1,21 23,20.1 23,19V5C23,3.9 22.1,3 21,3M21,19H3V5H21V19M5,7H11V13H9V9H7V13H5V7M13,7H19V9H15V11H19V13H15V15H19V17H13V7Z"/></svg>',
            onSelect: function() {
                const container = Lampa.Settings.getContainer();
                
                container.innerHTML = '';
                
                const form = document.createElement('div');
                form.style.cssText = 'padding: 20px; color: #fff;';
                
                form.innerHTML = `
                    <div style="margin-bottom: 25px;">
                        <h3 style="margin: 0 0 5px 0; font-size: 18px;">Emby Server</h3>
                        <p style="margin: 0; color: #999; font-size: 13px;">Настройка подключения к локальному серверу</p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #ccc;">URL сервера</label>
                        <input type="text" 
                               id="emby_server_url" 
                               value="${settings.server_url}" 
                               placeholder="http://192.168.1.100:8096"
                               style="width: 100%; padding: 12px; background: #2c2c2e; color: #fff; border: 1px solid #444; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #888;">Пример: http://192.168.1.100:8096</p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #ccc;">API ключ</label>
                        <input type="text" 
                               id="emby_api_key" 
                               value="${settings.api_key}" 
                               placeholder="Введите API ключ"
                               style="width: 100%; padding: 12px; background: #2c2c2e; color: #fff; border: 1px solid #444; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                        <p style="margin: 5px 0 0 0; font-size: 11px; color: #888;">Находится в настройках Emby → API Keys</p>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; color: #ccc;">User ID</label>
                        <input type="text" 
                               id="emby_user_id" 
                               value="${settings.user_id}" 
                               placeholder="Опционально"
                               style="width: 100%; padding: 12px; background: #2c2c2e; color: #fff; border: 1px solid #444; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <button id="emby_test_btn" 
                                style="flex: 1; padding: 12px; background: #2196F3; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                            🔌 Проверить подключение
                        </button>
                        <button id="emby_save_btn" 
                                style="flex: 1; padding: 12px; background: #4CAF50; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                            💾 Сохранить
                        </button>
                    </div>

                    <div id="emby_status" style="padding: 12px; border-radius: 8px; display: none; font-size: 13px;"></div>

                    <div style="margin-top: 30px; padding: 15px; background: #2c2c2e; border-radius: 8px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 14px;">📝 Как получить API ключ?</h4>
                        <ol style="margin: 0; padding-left: 20px; color: #999; font-size: 12px; line-height: 1.8;">
                            <li>Откройте Emby в браузере</li>
                            <li>Настройки → API Keys</li>
                            <li>Нажмите "New Api Key"</li>
                            <li>Скопируйте ключ</li>
                        </ol>
                    </div>
                `;

                container.appendChild(form);

                // Функция для показа статуса
                function showStatus(message, type) {
                    const statusEl = document.getElementById('emby_status');
                    statusEl.textContent = message;
                    statusEl.style.display = 'block';
                    
                    switch(type) {
                        case 'success':
                            statusEl.style.background = 'rgba(76, 175, 80, 0.2)';
                            statusEl.style.color = '#4CAF50';
                            break;
                        case 'error':
                            statusEl.style.background = 'rgba(244, 67, 54, 0.2)';
                            statusEl.style.color = '#f44336';
                            break;
                        case 'info':
                            statusEl.style.background = 'rgba(33, 150, 243, 0.2)';
                            statusEl.style.color = '#2196F3';
                            break;
                    }
                }

                // Обработчик теста подключения
                document.getElementById('emby_test_btn').addEventListener('click', async function() {
                    const url = document.getElementById('emby_server_url').value.trim();
                    const key = document.getElementById('emby_api_key').value.trim();

                    if (!url || !key) {
                        showStatus('❌ Заполните URL и API ключ', 'error');
                        return;
                    }

                    showStatus('⏳ Проверяем подключение...', 'info');

                    const result = await testConnection(url, key);
                    
                    if (result.success) {
                        showStatus(`✅ Подключено! Сервер: ${result.name} (${result.version})`, 'success');
                    } else {
                        showStatus(`❌ Ошибка: ${result.error}`, 'error');
                    }
                });

                // Обработчик сохранения
                document.getElementById('emby_save_btn').addEventListener('click', function() {
                    const data = {
                        server_url: document.getElementById('emby_server_url').value.trim(),
                        api_key: document.getElementById('emby_api_key').value.trim(),
                        user_id: document.getElementById('emby_user_id').value.trim()
                    };

                    if (storage.set(data)) {
                        showStatus('✅ Настройки сохранены!', 'success');
                    } else {
                        showStatus('❌ Ошибка сохранения', 'error');
                    }
                });
            }
        };
    }

    // Создание кнопки "Смотреть с Emby"
    function createEmbyButton() {
        // Наблюдаем появление карточки фильма/сериала
        const observer = new MutationObserver(() => {
            // Ищем различные контейнеры кнопок в Lampa
            const possibleContainers = [
                '.view__actions',
                '.movie__actions', 
                '.serial__actions',
                '.entity__actions',
                '.actions__list'
            ];

            possibleContainers.forEach(selector => {
                const containers = document.querySelectorAll(selector);
                
                containers.forEach(container => {
                    // Проверяем, не добавлена ли уже кнопка
                    if (container.querySelector('.emby-play-btn')) return;

                    // Проверяем, что мы на странице контента
                    const isMoviePage = window.location.href.includes('/movie/') || 
                                      document.querySelector('.movie-page');
                    const isSerialPage = window.location.href.includes('/serial/') || 
                                       document.querySelector('.serial-page');

                    if (isMoviePage || isSerialPage) {
                        const button = document.createElement('div');
                        button.className = 'emby-play-btn';
                        button.innerHTML = '🎬 Смотреть с Emby';
                        button.style.cssText = `
                            padding: 12px 20px;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border-radius: 8px;
                            cursor: pointer;
                            text-align: center;
                            font-size: 14px;
                            font-weight: 500;
                            margin: 5px 0;
                            transition: transform 0.2s, box-shadow 0.2s;
                            user-select: none;
                        `;

                        button.addEventListener('mouseenter', () => {
                            button.style.transform = 'scale(1.02)';
                            button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
                        });
                        
                        button.addEventListener('mouseleave', () => {
                            button.style.transform = 'scale(1)';
                            button.style.boxShadow = 'none';
                        });

                        button.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            playFromEmby();
                        });

                        container.appendChild(button);
                        console.log('[Emby Plugin] Button added to', selector);
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[Emby Plugin] Button observer started');
    }

    // Регистрация плагина
    function register() {
        console.log('[Emby Plugin] Registering...');
        
        // Добавляем пункт в меню расширений
        if (Lampa.Settings) {
            Lampa.Settings.add(createSettingsComponent());
            console.log('[Emby Plugin] Settings registered');
        }

        // Запускаем создание кнопок
        createEmbyButton();

        // Показываем уведомление о загрузке
        setTimeout(() => {
            Lampa.Noty.show('✅ Emby Plugin v' + PLUGIN_VERSION + ' загружен');
        }, 1000);
    }

    // Ожидание Lampa
    function waitForLampa() {
        if (typeof Lampa !== 'undefined') {
            console.log('[Emby Plugin] Lampa found, registering...');
            register();
        } else {
            console.log('[Emby Plugin] Waiting for Lampa...');
            setTimeout(waitForLampa, 1000);
        }
    }

    // Запуск
    waitForLampa();

})();
