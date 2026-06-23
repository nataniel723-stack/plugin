/**
 * Emby Local Server Plugin for Lampa
 * Версия 5.0 - Совместимый формат с Lampa Web
 */

(function() {
    'use strict';

    console.log('[Emby Plugin] Initializing...');

    // Имя плагина для Lampa
    var plugin_name = 'Emby Server';
    var plugin_version = '5.0.0';
    var plugin_key = 'emby_local_settings';

    // Настройки по умолчанию
    var defaults = {
        server_url: '',
        api_key: '',
        user_id: ''
    };

    // Загрузка настроек через Lampa.Storage
    function loadSettings() {
        try {
            var saved = Lampa.Storage.get(plugin_key);
            if (saved) {
                return Object.assign({}, defaults, saved);
            }
        } catch (e) {
            console.error('[Emby] Load settings error:', e);
        }
        return Object.assign({}, defaults);
    }

    // Сохранение настроек
    function saveSettings(data) {
        try {
            Lampa.Storage.set(plugin_key, data);
            return true;
        } catch (e) {
            console.error('[Emby] Save settings error:', e);
            return false;
        }
    }

    // Поиск контента в Emby
    async function searchInEmby(title, year, type) {
        var settings = loadSettings();
        
        if (!settings.server_url || !settings.api_key) {
            return [];
        }

        var baseUrl = settings.server_url.replace(/\/$/, '');
        var searchUrl = baseUrl + '/Items?';
        searchUrl += 'IncludeItemTypes=' + (type === 'movie' ? 'Movie' : 'Series');
        searchUrl += '&Recursive=true';
        searchUrl += '&SearchTerm=' + encodeURIComponent(title);
        searchUrl += '&api_key=' + settings.api_key;
        searchUrl += '&Limit=20';
        searchUrl += '&SortBy=SearchScore';
        searchUrl += '&SortOrder=Descending';
        
        if (year) searchUrl += '&Years=' + year;
        if (settings.user_id) searchUrl += '&UserId=' + settings.user_id;

        console.log('[Emby] Search URL:', searchUrl);

        try {
            var response = await fetch(searchUrl);
            var data = await response.json();
            
            if (data.Items && data.Items.length > 0) {
                console.log('[Emby] Found items:', data.Items.length);
                
                return data.Items.map(function(item) {
                    return {
                        id: item.Id,
                        title: item.Name,
                        year: item.ProductionYear,
                        type: item.Type === 'Movie' ? 'movie' : 'series',
                        overview: item.Overview || '',
                        stream: baseUrl + '/Videos/' + item.Id + '/stream?Static=true&api_key=' + settings.api_key,
                        poster: item.ImageTags && item.ImageTags.Primary ? 
                            baseUrl + '/Items/' + item.Id + '/Images/Primary?api_key=' + settings.api_key + '&maxHeight=300' : 
                            null
                    };
                });
            }
            return [];
        } catch (e) {
            console.error('[Emby] Search error:', e);
            return [];
        }
    }

    // Тест подключения к Emby
    async function testConnection(url, key) {
        try {
            var response = await fetch(url.replace(/\/$/, '') + '/System/Info?api_key=' + key);
            if (response.ok) {
                var data = await response.json();
                return {
                    success: true,
                    name: data.ServerName || 'Emby',
                    version: data.Version || 'Unknown'
                };
            }
            return { success: false, error: 'HTTP ' + response.status };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // Показать окно выбора контента
    function showSelectionModal(items) {
        var modal = document.createElement('div');
        modal.className = 'emby-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;';
        
        var itemsHTML = '';
        items.forEach(function(item, i) {
            itemsHTML += '<div class="emby-item" data-index="' + i + '" style="display:flex;padding:12px;margin:8px 0;background:#2c2c2e;border-radius:12px;cursor:pointer;align-items:center;transition:background 0.2s;">';
            itemsHTML += '<div style="flex-shrink:0;width:45px;height:68px;margin-right:15px;border-radius:8px;overflow:hidden;background:#1c1c1e;display:flex;align-items:center;justify-content:center;font-size:24px;">';
            if (item.poster) {
                itemsHTML += '<img src="' + item.poster + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">';
            } else {
                itemsHTML += item.type === 'movie' ? '🎬' : '📺';
            }
            itemsHTML += '</div>';
            itemsHTML += '<div style="flex:1;min-width:0;">';
            itemsHTML += '<div style="color:#fff;font-weight:500;">' + item.title + '</div>';
            itemsHTML += '<div style="color:#999;font-size:13px;">' + (item.year || '') + ' • ' + (item.type === 'movie' ? 'Фильм' : 'Сериал') + '</div>';
            itemsHTML += '</div>';
            itemsHTML += '</div>';
        });

        modal.innerHTML = '<div style="background:#1c1c1e;border-radius:16px;width:90%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;">' +
            '<div style="padding:20px;border-bottom:1px solid #333;">' +
            '<h3 style="margin:0;color:#fff;">🎬 Найдено в Emby</h3>' +
            '</div>' +
            '<div style="overflow-y:auto;padding:10px;">' + itemsHTML + '</div>' +
            '<div style="padding:15px;border-top:1px solid #333;">' +
            '<button class="emby-close-btn" style="width:100%;padding:12px;background:#f44336;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">Закрыть</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(modal);

        // Закрытие
        var closeBtn = modal.querySelector('.emby-close-btn');
        closeBtn.addEventListener('click', function() {
            modal.remove();
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });

        // Выбор элемента
        var items = modal.querySelectorAll('.emby-item');
        items.forEach(function(el) {
            el.addEventListener('click', function() {
                var index = parseInt(this.dataset.index);
                var item = items[index];
                modal.remove();
                playFromEmbyItem(item);
            });
            el.addEventListener('mouseenter', function() {
                this.style.background = '#3a3a3c';
            });
            el.addEventListener('mouseleave', function() {
                this.style.background = '#2c2c2e';
            });
        });
    }

    // Воспроизведение контента из Emby
    function playFromEmbyItem(item) {
        console.log('[Emby] Playing:', item.title);
        Lampa.Noty.show('▶️ ' + item.title);

        if (Lampa.Player) {
            Lampa.Player.play({
                title: item.title,
                url: item.stream,
                poster: item.poster,
                movie: item.type === 'movie',
                serial: item.type === 'series'
            });
        } else {
            window.open(item.stream, '_blank');
        }
    }

    // Основная функция запуска
    async function playFromEmby() {
        var settings = loadSettings();
        
        if (!settings.server_url || !settings.api_key) {
            Lampa.Noty.show('⚙️ Настройте Emby сервер в расширениях');
            return;
        }

        // Получаем данные о текущем контенте
        var title = '';
        var year = null;
        var type = 'movie';

        // Определяем тип по URL
        if (window.location.href.indexOf('/serial/') > -1) {
            type = 'series';
        }

        // Пробуем получить название из различных элементов
        var titleElements = document.querySelectorAll('.head__title, [data-name], h1, .movie-title, .serial-title, .entity__title');
        for (var i = 0; i < titleElements.length; i++) {
            var text = titleElements[i].textContent.trim();
            if (text && text.length > 0) {
                title = text;
                break;
            }
        }

        // Пробуем получить год
        var yearElements = document.querySelectorAll('.year, .movie-year, .release-year, [data-year]');
        for (var i = 0; i < yearElements.length; i++) {
            var yearText = yearElements[i].textContent.trim();
            var match = yearText.match(/\d{4}/);
            if (match) {
                year = parseInt(match[0]);
                break;
            }
        }

        if (!title) {
            Lampa.Noty.show('❌ Не удалось определить название контента');
            return;
        }

        Lampa.Noty.show('🔍 Поиск: ' + title);

        var items = await searchInEmby(title, year, type);

        if (items.length === 0) {
            Lampa.Noty.show('😔 Контент не найден в Emby');
            return;
        }

        if (items.length === 1) {
            playFromEmbyItem(items[0]);
        } else {
            showSelectionModal(items);
        }
    }

    // Создание интерфейса настроек
    function createSettingsUI() {
        var settings = loadSettings();
        
        var container = document.createElement('div');
        container.className = 'settings-emby';
        container.style.cssText = 'padding:20px;color:#fff;';
        
        container.innerHTML = 
            '<h3 style="margin-bottom:20px;">Настройки Emby Server</h3>' +
            
            '<div style="margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;">URL сервера</label>' +
            '<input type="text" id="emby_server_url" value="' + settings.server_url + '" ' +
            'placeholder="http://192.168.1.100:8096" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;">API ключ</label>' +
            '<input type="text" id="emby_api_key" value="' + settings.api_key + '" ' +
            'placeholder="API ключ из настроек Emby" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="margin-bottom:20px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;">User ID (опционально)</label>' +
            '<input type="text" id="emby_user_id" value="' + settings.user_id + '" ' +
            'placeholder="ID пользователя Emby" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="display:flex;gap:10px;margin-bottom:15px;">' +
            '<button id="emby_test_btn" style="flex:1;padding:12px;background:#2196F3;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🔌 Проверить</button>' +
            '<button id="emby_save_btn" style="flex:1;padding:12px;background:#4CAF50;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">💾 Сохранить</button>' +
            '</div>' +
            
            '<div id="emby_status" style="padding:10px;border-radius:8px;display:none;font-size:13px;"></div>' +
            
            '<div style="margin-top:20px;padding:15px;background:#2c2c2e;border-radius:8px;">' +
            '<p style="margin:0;color:#999;font-size:12px;line-height:1.6;">' +
            '📝 <b>Как получить API ключ:</b><br>' +
            '1. Откройте Emby в браузере<br>' +
            '2. Перейдите в Настройки → API Keys<br>' +
            '3. Создайте новый ключ и скопируйте его' +
            '</p>' +
            '</div>';

        // Добавляем обработчики после вставки в DOM
        setTimeout(function() {
            var statusDiv = document.getElementById('emby_status');
            
            // Кнопка сохранения
            var saveBtn = document.getElementById('emby_save_btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    var data = {
                        server_url: document.getElementById('emby_server_url').value.trim(),
                        api_key: document.getElementById('emby_api_key').value.trim(),
                        user_id: document.getElementById('emby_user_id').value.trim()
                    };
                    
                    if (saveSettings(data)) {
                        statusDiv.style.display = 'block';
                        statusDiv.style.background = 'rgba(76,175,80,0.2)';
                        statusDiv.style.color = '#4CAF50';
                        statusDiv.textContent = '✅ Настройки сохранены';
                        
                        setTimeout(function() {
                            statusDiv.style.display = 'none';
                        }, 2000);
                    }
                });
            }

            // Кнопка теста
            var testBtn = document.getElementById('emby_test_btn');
            if (testBtn) {
                testBtn.addEventListener('click', async function() {
                    var url = document.getElementById('emby_server_url').value.trim();
                    var key = document.getElementById('emby_api_key').value.trim();
                    
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
                    statusDiv.textContent = '⏳ Проверка подключения...';

                    var result = await testConnection(url, key);
                    
                    statusDiv.style.display = 'block';
                    if (result.success) {
                        statusDiv.style.background = 'rgba(76,175,80,0.2)';
                        statusDiv.style.color = '#4CAF50';
                        statusDiv.textContent = '✅ Подключено! ' + result.name + ' (v' + result.version + ')';
                    } else {
                        statusDiv.style.background = 'rgba(244,67,54,0.2)';
                        statusDiv.style.color = '#f44336';
                        statusDiv.textContent = '❌ Ошибка: ' + result.error;
                    }
                });
            }
        }, 100);

        return container;
    }

    // Добавление кнопки "Смотреть с Emby"
    function addPlayButton() {
        // Наблюдаем за DOM
        var observer = new MutationObserver(function() {
            // Ищем контейнеры для кнопок
            var containers = document.querySelectorAll('.view__buttons, .movie__buttons, .serial__buttons, .entity__buttons, .actions__list');
            
            containers.forEach(function(container) {
                // Проверяем, что мы на странице контента
                var isContentPage = window.location.href.indexOf('/movie/') > -1 || 
                                   window.location.href.indexOf('/serial/') > -1;
                
                if (isContentPage && !container.querySelector('.emby-play-button')) {
                    var btn = document.createElement('div');
                    btn.className = 'emby-play-button';
                    btn.textContent = '🎬 Смотреть с Emby';
                    btn.style.cssText = 
                        'padding:12px 20px;margin:5px 0;' +
                        'background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);' +
                        'color:white;border-radius:8px;cursor:pointer;' +
                        'text-align:center;font-size:14px;font-weight:500;' +
                        'transition:transform 0.2s,opacity 0.2s;' +
                        'user-select:none;';
                    
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        playFromEmby();
                    });
                    
                    btn.addEventListener('mouseenter', function() {
                        this.style.transform = 'scale(1.02)';
                        this.style.opacity = '0.9';
                    });
                    
                    btn.addEventListener('mouseleave', function() {
                        this.style.transform = 'scale(1)';
                        this.style.opacity = '1';
                    });
                    
                    container.appendChild(btn);
                    console.log('[Emby] Play button added');
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('[Emby] Observer started');
    }

    // Регистрация плагина в Lampa
    function register() {
        console.log('[Emby] Registering...');

        // Проверяем наличие Lampa и её методов
        if (typeof Lampa !== 'undefined') {
            // Пробуем разные способы добавления
            try {
                // Метод 1: через Lampa.Plugins.add (как в Filmix)
                if (Lampa.Plugins && typeof Lampa.Plugins.add === 'function') {
                    Lampa.Plugins.add({
                        name: plugin_name,
                        version: plugin_version,
                        description: 'Подключение к локальному Emby серверу',
                        settings: function() {
                            return createSettingsUI();
                        }
                    });
                    console.log('[Emby] Registered via Plugins.add');
                }
                // Метод 2: через Lampa.Plugin
                else if (Lampa.Plugin && typeof Lampa.Plugin.register === 'function') {
                    Lampa.Plugin.register({
                        name: plugin_name,
                        version: plugin_version,
                        component: createSettingsUI
                    });
                    console.log('[Emby] Registered via Plugin.register');
                }
                // Метод 3: через массив plugins
                else if (Lampa.plugins && Array.isArray(Lampa.plugins)) {
                    Lampa.plugins.push({
                        name: plugin_name,
                        version: plugin_version,
                        component: createSettingsUI
                    });
                    console.log('[Emby] Registered via plugins array');
                }
            } catch (e) {
                console.error('[Emby] Registration error:', e);
            }
        }

        // Запускаем добавление кнопок
        setTimeout(addPlayButton, 2000);

        // Показываем уведомление
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('✅ Emby Plugin ' + plugin_version + ' загружен');
        }
    }

    // Ожидание загрузки Lampa
    function waitForLampa() {
        if (typeof Lampa !== 'undefined') {
            console.log('[Emby] Lampa found');
            register();
        } else {
            console.log('[Emby] Waiting for Lampa...');
            setTimeout(waitForLampa, 1000);
        }
    }

    // Запуск
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        waitForLampa();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            waitForLampa();
        });
    }

})();
