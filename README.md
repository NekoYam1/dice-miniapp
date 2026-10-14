# Dice Mini App

1. Локальная проверка (ES-модули не работают через двойной клик):
   python -m http.server 8000   ->   http://localhost:8000
2. Залей все файлы в корень репозитория GitHub, включи Pages (ветка main, папка /root).
3. В BotFather: /mybots -> бот -> Bot Settings -> Configure Mini App -> URL страницы Pages.
4. После обновлений добавляй к URL ?v=2, ?v=3, чтобы Telegram не отдавал кэш.
5. Бросок сейчас клиентский (api.js, API_URL = null). Для дуэлей и наград нужен сервер.
