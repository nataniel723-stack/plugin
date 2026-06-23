/**
 * Emby Local Server Plugin for Lampa
 * Version 6.0 - Fixed registration
 */

(function() {
    'use strict';

    // Проверяем, не загружен ли уже плагин
    if (window.embyPluginLoaded) {
        console.log('[Emby] Plugin already loaded, skipping');
        return;
    }
    window.embyPluginLoaded = true;

    console.log('[Emby Plugin] Starting initialization...');

    // Конфигурация плагина
    var plugin = {
        name: 'Emby Server',
        version: '6.0.0',
        description: 'Подключение к локальному Emby серверу',
        key: 'emby_local_settings',
        type: 'plugin'
    };

    // Настройки по умолчанию
    var defaults = {
        server_url: '',
        api_key: '',
        user_id: ''
    };

    // Загрузка настроек
    function loadSettings() {
        try {
            if (typeof Lampa !== 'undefined' && Lampa.Storage) {
                var saved = Lampa.Storage.get(plugin.key);
                if (saved && typeof saved === 'object') {
                    return Object.assign({}, defaults, saved);
                }
            }
        } catch (e) {
            console.error('[Emby] Load error:', e);
        }
        return Object.assign({}, defaults);
    }

    // Сохранение настроек
    function saveSettings(data) {
        try {
            if (typeof Lampa !== 'undefined' && Lampa.Storage) {
                Lampa.Storage.set(plugin.key, data);
                return true;
            }
        } catch (e) {
            console.error('[Emby] Save error:', e);
        }
        return false;
    }

    // Поиск в Emby
    async function searchEmby(title, year, type) {
        var settings = loadSettings();
        
        if (!settings.server_url || !settings.api_key) {
            return [];
        }

        var baseUrl = settings.server_url.replace(/\/$/, '');
        var url = baseUrl + '/Items?';
        url += 'IncludeItemTypes=' + (type === 'movie' ? 'Movie' : 'Series');
        url += '&Recursive=true';
        url += '&SearchTerm=' + encodeURIComponent(title);
        url += '&api_key=' + settings.api_key;
        url += '&Limit=20';
        
        if (year) url += '&Years=' + year;
        if (settings.user_id) url += '&UserId=' + settings.user_id;

        console.log('[Emby] Search:', url);

        try {
            var response = await fetch(url);
            var data = await response.json();
            
            if (data.Items && data.Items.length > 0) {
                return data.Items.map(function(item) {
                    return {
                        id: item.Id,
                        title: item.Name,
                        year: item.ProductionYear,
                        type: item.Type === 'Movie' ? 'movie' : 'series',
                        overview: item.Overview || '',
                        stream: baseUrl + '/Videos/' + item.Id + '/stream?Static=true&api_key=' + settings.api_key,
                        poster: item.ImageTags && item.ImageTags.Primary ? 
                            baseUrl + '/Items/' + item.Id + '/Images/Primary?api_key=' + settings.api_key + '&maxHeight=300' : null
                    };
                });
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

    // Показать модальное окно выбора
    function showSelectionModal(items) {
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10001;display:flex;align-items:center;justify-content:center;';
        
        var html = '<div style="background:#1c1c1e;border-radius:16px;width:90%;max-width:500px;max-height:80vh;display:flex;flex-direction:column;">';
        html += '<div style="padding:20px;border-bottom:1px solid #333;">';
        html += '<h3 style="margin:0;color:#fff;">🎬 Найдено в Emby</h3>';
        html += '</div>';
        html += '<div style="overflow-y:auto;padding:10px;">';
        
        items.forEach(function(item, i) {
            html += '<div class="emby-item-' + i + '" style="display:flex;padding:12px;margin:8px 0;background:#2c2c2e;border-radius:12px;cursor:pointer;align-items:center;">';
            html += '<div style="flex-shrink:0;width:45px;height:68px;margin-right:15px;border-radius:8px;overflow:hidden;background:#1c1c1e;display:flex;align-items:center;justify-content:center;font-size:24px;">';
            if (item.poster) {
                html += '<img src="' + item.poster + '" style="width:100%;height:100%;object-fit:cover;">';
            } else {
                html += item.type === 'movie' ? '🎬' : '📺';
            }
            html += '</div>';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="color:#fff;font-weight:500;">' + item.title + '</div>';
            html += '<div style="color:#999;font-size:13px;">' + (item.year || '') + ' • ' + (item.type === 'movie' ? 'Фильм' : 'Сериал') + '</div>';
            html += '</div>';
            html += '</div>';
        });
        
        html += '</div>';
        html += '<div style="padding:15px;border-top:1px solid #333;">';
        html += '<button class="emby-close-modal" style="width:100%;padding:12px;background:#f44336;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">Закрыть</button>';
        html += '</div>';
        html += '</div>';
        
        modal.innerHTML = html;
        document.body.appendChild(modal);

        // Закрытие
        modal.querySelector('.emby-close-modal').addEventListener('click', function() {
            modal.remove();
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.remove();
        });

        // Выбор элемента
        items.forEach(function(item, i) {
            var el = modal.querySelector('.emby-item-' + i);
            if (el) {
                el.addEventListener('click', function() {
                    modal.remove();
                    playStream(item);
                });
                el.addEventListener('mouseenter', function() {
                    this.style.background = '#3a3a3c';
                });
                el.addEventListener('mouseleave', function() {
                    this.style.background = '#2c2c2e';
                });
            }
        });
    }

    // Воспроизведение
    function playStream(item) {
        console.log('[Emby] Playing:', item.title);
        
        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('▶️ ' + item.title);
        }

        if (typeof Lampa !== 'undefined' && Lampa.Player) {
            Lampa.Player.play({
                title: item.title,
                url: item.stream,
                poster: item.poster,
                movie: item.type === 'movie',
                serial: item.type === 'series'
            });
        }
    }

    // Основная функция
    async function playFromEmby() {
        var settings = loadSettings();
        
        if (!settings.server_url || !settings.api_key) {
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                Lampa.Noty.show('⚙️ Настройте Emby сервер в расширениях');
            }
            return;
        }

        var title = '';
        var year = null;
        var type = 'movie';

        if (window.location.href.indexOf('/serial/') > -1) {
            type = 'series';
        }

        // Получаем название
        var titleElements = document.querySelectorAll('.head__title, [data-name], h1, .movie-title, .serial-title');
        for (var i = 0; i < titleElements.length; i++) {
            var text = titleElements[i].textContent.trim();
            if (text) {
                title = text;
                break;
            }
        }

        // Получаем год
        var yearElements = document.querySelectorAll('.year, .movie-year, [data-year]');
        for (var i = 0; i < yearElements.length; i++) {
            var match = yearElements[i].textContent.match(/\d{4}/);
            if (match) {
                year = parseInt(match[0]);
                break;
            }
        }

        if (!title) {
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                Lampa.Noty.show('❌ Не удалось определить контент');
            }
            return;
        }

        if (typeof Lampa !== 'undefined' && Lampa.Noty) {
            Lampa.Noty.show('🔍 Поиск в Emby: ' + title);
        }

        var items = await searchEmby(title, year, type);

        if (items.length === 0) {
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
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
    function createSettingsComponent() {
        var settings = loadSettings();
        
        var container = document.createElement('div');
        container.className = 'emby-settings';
        container.style.cssText = 'padding:20px;color:#fff;';
        
        container.innerHTML = 
            '<h3 style="margin-bottom:20px;font-size:18px;">⚙️ Настройки Emby Server</h3>' +
            
            '<div style="margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;font-size:14px;">URL сервера</label>' +
            '<input type="text" id="emby_url" value="' + (settings.server_url || '') + '" ' +
            'placeholder="http://192.168.1.100:8096" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="margin-bottom:15px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;font-size:14px;">API ключ</label>' +
            '<input type="text" id="emby_key" value="' + (settings.api_key || '') + '" ' +
            'placeholder="API ключ из настроек Emby" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="margin-bottom:20px;">' +
            '<label style="display:block;margin-bottom:5px;color:#ccc;font-size:14px;">User ID</label>' +
            '<input type="text" id="emby_user" value="' + (settings.user_id || '') + '" ' +
            'placeholder="Необязательно" ' +
            'style="width:100%;padding:12px;background:#2c2c2e;color:#fff;border:1px solid #444;border-radius:8px;box-sizing:border-box;font-size:14px;">' +
            '</div>' +
            
            '<div style="display:flex;gap:10px;margin-bottom:15px;">' +
            '<button id="emby_test" style="flex:1;padding:12px;background:#2196F3;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">🔌 Проверить</button>' +
            '<button id="emby_save" style="flex:1;padding:12px;background:#4CAF50;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">💾 Сохранить</button>' +
            '</div>' +
            
            '<div id="emby_status" style="padding:10px;border-radius:8px;display:none;font-size:13px;"></div>';

        // Обработчики
        setTimeout(function() {
            var saveBtn = document.getElementById('emby_save');
            var testBtn = document.getElementById('emby_test');
            var statusDiv = document.getElementById('emby_status');

            if (saveBtn) {
                saveBtn.addEventListener('click', function() {
                    var data = {
                        server_url: document.getElementById('emby_url').value.trim(),
                        api_key: document.getElementById('emby_key').value.trim(),
                        user_id: document.getElementById('emby_user').value.trim()
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

            if (testBtn) {
                testBtn.addEventListener('click', async function() {
                    var url = document.getElementById('emby_url').value.trim();
                    var key = document.getElementById('emby_key').value.trim();
                    
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

    // Добавление кнопки на страницы контента
    function addPlayButton() {
        var observer = new MutationObserver(function() {
            var isContentPage = window.location.href.indexOf('/movie/') > -1 || 
                               window.location.href.indexOf('/serial/') > -1;
            
            if (!isContentPage) return;

            var containers = document.querySelectorAll('.view__buttons, .movie__buttons, .serial__buttons, .entity__buttons, .actions__list');
            
            containers.forEach(function(container) {
                if (!container.querySelector('.emby-play-btn')) {
                    var btn = document.createElement('div');
                    btn.className = 'emby-play-btn';
                    btn.textContent = '🎬 Смотреть с Emby';
                    btn.style.cssText = 
                        'padding:12px 20px;margin:5px 0;' +
                        'background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);' +
                        'color:white;border-radius:8px;cursor:pointer;' +
                        'text-align:center;font-size:14px;font-weight:500;' +
                        'transition:transform 0.2s;user-select:none;';
                    
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        playFromEmby();
                    });
                    
                    btn.addEventListener('mouseenter', function() {
                        this.style.transform = 'scale(1.02)';
                    });
                    
                    btn.addEventListener('mouseleave', function() {
                        this.style.transform = 'scale(1)';
                    });
                    
                    container.appendChild(btn);
                    console.log('[Emby] Button added');
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Регистрация плагина
    function registerPlugin() {
        if (typeof Lampa === 'undefined') {
            console.log('[Emby] Lampa not found, retrying...');
            setTimeout(registerPlugin, 1000);
            return;
        }

        console.log('[Emby] Registering plugin...');

        try {
            // Используем тот же метод, что и TMDB Proxy
            Lampa.Plugins.add({
                name: plugin.name,
                version: plugin.version,
                description: plugin.description,
                settings: function() {
                    return createSettingsComponent();
                }
            });
            
            console.log('[Emby] Plugin registered successfully');
            
            // Запускаем добавление кнопок
            addPlayButton();
            
            // Уведомление
            if (Lampa.Noty) {
                Lampa.Noty.show('✅ Emby Plugin v' + plugin.version + ' загружен');
            }
        } catch (e) {
            console.error('[Emby] Registration failed:', e);
        }
    }

    // Запуск после полной загрузки
    if (document.readyState === 'complete') {
        registerPlugin();
    } else {
        window.addEventListener('load', function() {
            setTimeout(registerPlugin, 1000);
        });
    }

})();
