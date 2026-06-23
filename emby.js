/**
 * Emby Local Server Plugin for Lampa
 * Добавляет возможность просмотра контента с локального Emby сервера
 */

(function() {
    'use strict';

    // Стандартные настройки плагина
    const defaultSettings = {
        server_url: '',
        api_key: '',
        user_id: ''
    };

    // Загрузка настроек
    function loadSettings() {
        try {
            const saved = localStorage.getItem('emby_local_settings');
            return saved ? JSON.parse(saved) : defaultSettings;
        } catch (e) {
            return defaultSettings;
        }
    }

    // Сохранение настроек
    function saveSettings(settings) {
        localStorage.setItem('emby_local_settings', JSON.stringify(settings));
    }

    // Создание интерфейса настроек
    function createSettingsUI() {
        const settings = loadSettings();
        
        const container = document.createElement('div');
        container.className = 'settings-container';
        container.style.cssText = 'padding: 15px; color: #fff;';

        const title = document.createElement('h3');
        title.textContent = 'Настройки Emby сервера';
        title.style.cssText = 'margin-bottom: 20px;';
        container.appendChild(title);

        // Server URL
        const serverUrlLabel = document.createElement('label');
        serverUrlLabel.textContent = 'URL сервера:';
        serverUrlLabel.style.cssText = 'display: block; margin-bottom: 5px;';
        container.appendChild(serverUrlLabel);

        const serverUrlInput = document.createElement('input');
        serverUrlInput.type = 'text';
        serverUrlInput.value = settings.server_url;
        serverUrlInput.placeholder = 'http://192.168.1.100:8096';
        serverUrlInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 15px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px;';
        container.appendChild(serverUrlInput);

        // API Key
        const apiKeyLabel = document.createElement('label');
        apiKeyLabel.textContent = 'API ключ:';
        apiKeyLabel.style.cssText = 'display: block; margin-bottom: 5px;';
        container.appendChild(apiKeyLabel);

        const apiKeyInput = document.createElement('input');
        apiKeyInput.type = 'text';
        apiKeyInput.value = settings.api_key;
        apiKeyInput.placeholder = 'Ваш Emby API ключ';
        apiKeyInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 15px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px;';
        container.appendChild(apiKeyInput);

        // User ID
        const userIdLabel = document.createElement('label');
        userIdLabel.textContent = 'User ID:';
        userIdLabel.style.cssText = 'display: block; margin-bottom: 5px;';
        container.appendChild(userIdLabel);

        const userIdInput = document.createElement('input');
        userIdInput.type = 'text';
        userIdInput.value = settings.user_id;
        userIdInput.placeholder = 'ID пользователя (опционально)';
        userIdInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 15px; background: #1a1a1a; color: #fff; border: 1px solid #333; border-radius: 4px;';
        container.appendChild(userIdInput);

        // Кнопка сохранения
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Сохранить';
        saveButton.style.cssText = 'padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;';
        saveButton.onclick = () => {
            const newSettings = {
                server_url: serverUrlInput.value.trim(),
                api_key: apiKeyInput.value.trim(),
                user_id: userIdInput.value.trim()
            };
            saveSettings(newSettings);
            showNotification('Настройки сохранены!');
        };
        container.appendChild(saveButton);

        // Кнопка тестирования
        const testButton = document.createElement('button');
        testButton.textContent = 'Тест подключения';
        testButton.style.cssText = 'padding: 10px 20px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer;';
        testButton.onclick = async () => {
            const testSettings = {
                server_url: serverUrlInput.value.trim(),
                api_key: apiKeyInput.value.trim(),
                user_id: userIdInput.value.trim()
            };
            
            if (!testSettings.server_url || !testSettings.api_key) {
                showNotification('Заполните URL и API ключ!', 'error');
                return;
            }
            
            testConnection(testSettings);
        };
        container.appendChild(testButton);

        return container;
    }

    // Тестирование подключения
    async function testConnection(settings) {
        try {
            const baseUrl = settings.server_url.replace(/\/$/, '');
            const url = `${baseUrl}/System/Info?api_key=${settings.api_key}`;
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                showNotification(`Подключено! Сервер: ${data.ServerName || 'OK'}`, 'success');
            } else {
                showNotification('Ошибка подключения: ' + response.status, 'error');
            }
        } catch (e) {
            showNotification('Ошибка: ' + e.message, 'error');
        }
    }

    // Поиск в Emby библиотеке
    async function searchInEmby(title, year, type) {
        const settings = loadSettings();
        
        if (!settings.server_url || !settings.api_key) {
            return [];
        }

        try {
            const baseUrl = settings.server_url.replace(/\/$/, '');
            let searchUrl = `${baseUrl}/Items?api_key=${settings.api_key}&SearchTerm=${encodeURIComponent(title)}&Recursive=true&IncludeItemTypes=`;
            
            if (type === 'movie') {
                searchUrl += 'Movie';
            } else if (type === 'tv' || type === 'series') {
                searchUrl += 'Series';
            } else {
                searchUrl += 'Movie,Series';
            }
            
            if (year) {
                searchUrl += `&Years=${year}`;
            }
            
            if (settings.user_id) {
                searchUrl += `&UserId=${settings.user_id}`;
            }

            const response = await fetch(searchUrl);
            const data = await response.json();
            
            if (data.Items && data.Items.length > 0) {
                return data.Items.map(item => ({
                    id: item.Id,
                    title: item.Name,
                    year: item.ProductionYear,
                    type: item.Type === 'Movie' ? 'movie' : 'series',
                    path: `${baseUrl}/Items/${item.Id}/PlaybackInfo?api_key=${settings.api_key}`,
                    stream_url: `${baseUrl}/Videos/${item.Id}/stream?api_key=${settings.api_key}&Static=true`,
                    poster: item.ImageTags?.Primary ? 
                        `${baseUrl}/Items/${item.Id}/Images/Primary?api_key=${settings.api_key}` : null
                }));
            }
            return [];
        } catch (e) {
            console.error('Emby search error:', e);
            return [];
        }
    }

    // Добавление пункта "Смотреть с Emby" в интерфейс
    function addEmbyButton() {
        // Ждем появления кнопки "Смотреть"
        const observer = new MutationObserver((mutations, obs) => {
            const watchButton = document.querySelector('.button--play, [data-action="play"], .watch-button');
            
            if (watchButton && !document.querySelector('.emby-local-button')) {
                const embyButton = document.createElement('button');
                embyButton.className = 'emby-local-button';
                embyButton.textContent = 'Смотреть с Emby';
                embyButton.style.cssText = `
                    padding: 10px 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin: 5px 0;
                    font-size: 14px;
                    transition: transform 0.2s;
                `;
                
                embyButton.onmouseover = () => embyButton.style.transform = 'scale(1.05)';
                embyButton.onmouseout = () => embyButton.style.transform = 'scale(1)';
                
                embyButton.onclick = async () => {
                    await handleEmbyPlay();
                };
                
                // Добавляем кнопку после существующей кнопки "Смотреть"
                watchButton.parentNode.insertBefore(embyButton, watchButton.nextSibling);
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Обработчик нажатия на кнопку Emby
    async function handleEmbyPlay() {
        // Получаем информацию о текущем контенте
        const title = getCurrentTitle();
        const year = getCurrentYear();
        const type = getCurrentType();
        
        if (!title) {
            showNotification('Не удалось определить название контента', 'error');
            return;
        }
        
        showNotification('Ищем в Emby библиотеке...', 'info');
        
        const results = await searchInEmby(title, year, type);
        
        if (results.length === 0) {
            showNotification('Контент не найден в Emby библиотеке', 'error');
            return;
        }
        
        if (results.length === 1) {
            playEmbyContent(results[0]);
        } else {
            showEmbySelector(results);
        }
    }

    // Функции для получения информации о текущем контенте (зависят от источника)
    function getCurrentTitle() {
        // Пытаемся получить название из разных источников Lampa
        const titleElement = document.querySelector('.entity__title, .movie-title, .series-title, h1');
        if (titleElement) return titleElement.textContent.trim();
        
        // Если есть глобальная переменная с информацией о контенте
        if (window.currentMovie?.title) return window.currentMovie.title;
        if (window.currentSeries?.title) return window.currentSeries.title;
        
        return null;
    }

    function getCurrentYear() {
        const yearElement = document.querySelector('.entity__year, .year');
        if (yearElement) {
            const yearText = yearElement.textContent.trim();
            const yearMatch = yearText.match(/\d{4}/);
            if (yearMatch) return parseInt(yearMatch[0]);
        }
        
        if (window.currentMovie?.year) return window.currentMovie.year;
        if (window.currentSeries?.year) return window.currentSeries.year;
        
        return null;
    }

    function getCurrentType() {
        // Определяем тип контента
        if (document.querySelector('.series-season, .episodes')) return 'series';
        if (window.currentMovie) return 'movie';
        if (window.currentSeries) return 'series';
        return 'movie'; // по умолчанию
    }

    // Воспроизведение контента из Emby
    function playEmbyContent(item) {
        showNotification(`Воспроизведение: ${item.title}`, 'success');
        
        // Создаем iframe или video элемент для воспроизведения
        const playerContainer = document.querySelector('.player, .video-container') || document.body;
        
        // Используем стандартный плеер Lampa с потоком из Emby
        if (window.Lampa && window.Lampa.Player) {
            window.Lampa.Player.play({
                url: item.stream_url,
                title: item.title,
                poster: item.poster,
                subtitles: [], // можно добавить поддержку субтитров
                quality: 'auto'
            });
        } else {
            // Fallback: создаем простой видеоплеер
            const videoElement = document.createElement('video');
            videoElement.src = item.stream_url;
            videoElement.controls = true;
            videoElement.autoplay = true;
            videoElement.style.cssText = 'width: 100%; height: 100%;';
            
            playerContainer.innerHTML = '';
            playerContainer.appendChild(videoElement);
        }
    }

    // Показываем список найденного контента
    function showEmbySelector(items) {
        const modal = document.createElement('div');
        modal.className = 'emby-selector-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: #1a1a1a;
            border-radius: 8px;
            padding: 20px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'Найдено в Emby:';
        title.style.cssText = 'color: #fff; margin-bottom: 15px;';
        content.appendChild(title);
        
        items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.style.cssText = `
                padding: 10px;
                margin: 5px 0;
                background: #2a2a2a;
                border-radius: 4px;
                cursor: pointer;
                color: #fff;
                transition: background 0.2s;
            `;
            itemElement.textContent = `${item.title} (${item.year || 'N/A'})`;
            itemElement.onmouseover = () => itemElement.style.background = '#3a3a3a';
            itemElement.onmouseout = () => itemElement.style.background = '#2a2a2a';
            itemElement.onclick = () => {
                modal.remove();
                playEmbyContent(item);
            };
            content.appendChild(itemElement);
        });
        
        const closeButton = document.createElement('button');
        closeButton.textContent = 'Закрыть';
        closeButton.style.cssText = `
            margin-top: 15px;
            padding: 10px 20px;
            background: #f44336;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        `;
        closeButton.onclick = () => modal.remove();
        content.appendChild(closeButton);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
    }

    // Уведомления
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
            color: white;
            border-radius: 4px;
            z-index: 10001;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // Добавление стилей для анимаций
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(styleSheet);

    // Регистрация плагина в Lampa
    function registerPlugin() {
        // Добавляем настройки в меню Lampa
        if (window.Lampa && window.Lampa.Settings) {
            window.Lampa.Settings.add({
                component: 'emby_settings',
                title: 'Emby Server',
                icon: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M21,3H3C1.9,3 1,3.9 1,5V19C1,20.1 1.9,21 3,21H21C22.1,21 23,20.1 23,19V5C23,3.9 22.1,3 21,3M21,19H3V5H21V19M9,8H15V16H13V10H11V16H9V8Z"/></svg>',
                onSelect: () => {
                    const container = document.querySelector('.settings__content, .modal__content');
                    if (container) {
                        container.innerHTML = '';
                        container.appendChild(createSettingsUI());
                    }
                }
            });
        }
        
        // Активируем кнопку Emby на страницах с контентом
        addEmbyButton();
    }

    // Инициализация при загрузке
    function init() {
        if (window.Lampa) {
            registerPlugin();
        } else {
            // Ждем загрузки Lampa
            const checkLampa = setInterval(() => {
                if (window.Lampa) {
                    clearInterval(checkLampa);
                    registerPlugin();
                }
            }, 500);
        }
    }

    // Запуск плагина
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
