(function() {
  'use strict';

  // ---------- КОНФИГУРАЦИЯ (ЗАМЕНИТЕ НА СВОИ) ----------
  const CONFIG = {
    firebase: {
      apiKey: "ВАШ_API_KEY",
      authDomain: "ВАШ_ПРОЕКТ.firebaseapp.com",
      projectId: "ВАШ_ПРОЕКТ",
      storageBucket: "ВАШ_ПРОЕКТ.appspot.com",
      messagingSenderId: "ВАШ_ID",
      appId: "ВАШ_APP_ID"
    },
    emailjs: {
      userID: "ВАШ_USER_ID",
      serviceID: "ВАШ_SERVICE_ID",
      templateID: "ВАШ_TEMPLATE_ID"
    },
    telegram: {
      botToken: "ВАШ_ТОКЕН_БОТА"
    },
    vapidPublicKey: "ВАШ_VAPID_КЛЮЧ_ИЗ_FIREBASE"
  };

  // ---------- ИНИЦИАЛИЗАЦИЯ FIREBASE ----------
  firebase.initializeApp(CONFIG.firebase);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // ---------- ДАННЫЕ ЧЕК-ЛИСТОВ ----------
  const QUESTIONS = {
    buyer: [
      { id: 'property_type', label: 'Тип недвижимости', options: ['Вторичка', 'Новостройка', 'Дом', 'Коммерция'] },
      { id: 'mortgage', label: 'Будете брать ипотеку?', options: ['Да', 'Нет'] },
      { id: 'maternity_capital', label: 'Используете маткапитал?', options: ['Да', 'Нет'] },
      { id: 'ownership', label: 'Проверка истории', options: ['Полная проверка', 'Только основные документы'] }
    ],
    seller: [
      { id: 'property_type', label: 'Тип недвижимости', options: ['Вторичка', 'Новостройка', 'Дом', 'Коммерция'] },
      { id: 'mortgage', label: 'Есть обременение?', options: ['Да', 'Нет'] },
      { id: 'urgency', label: 'Срочность продажи', options: ['Обычная', 'Срочная (до 1 месяца)'] },
      { id: 'maternity_capital', label: 'Покупали с маткапиталом?', options: ['Да', 'Нет'] }
    ]
  };

  const CHECKLISTS = {
    buyer_default: [
      'Проверить выписку ЕГРН на обременения',
      'Заказать справку о составе семьи (для прописки)',
      'Проверить задолженности по ЖКХ',
      'Согласовать задаток и подписать предварительный договор',
      'Заказать оценку для ипотеки (если нужно)',
      'Проверить историю перепродаж'
    ],
    seller_default: [
      'Собрать все правоустанавливающие документы',
      'Заказать актуальную выписку ЕГРН',
      'Получить справку об отсутствии долгов по ЖКХ',
      'Подготовить технический план (БТИ)',
      'Определить цену и условия задатка',
      'Подать объявление и организовать показы'
    ]
  };

  const EXTRA_TASKS = {
    mortgage_buyer: 'Получить одобрение банка на ипотеку',
    mortgage_seller: 'Запросить график платежей для снятия обременения',
    urgent_seller: 'Подготовить нотариальную доверенность (ускоренно)',
    newbuilding_buyer: 'Проверить застройщика и разрешение на строительство',
    newbuilding_seller: 'Получить выписку из Росреестра о регистрации права',
    maternity_buyer: 'Оформить обязательство о выделении долей детям',
    maternity_seller: 'Получить разрешение органов опеки'
  };

  // ---------- СОСТОЯНИЕ ----------
  let state = {
    role: null,
    answers: {},
    checklist: [],
    timerInterval: null,
    deadlineDate: null,
    user: null
  };

  // DOM
  const $ = id => document.getElementById(id);
  const questionsContainer = $('questions-container');
  const btnGenerate = $('btn-generate');
  const checklistContainer = $('checklist-container');
  const deadlineTimer = $('deadline-timer');
  const btnReset = $('btn-reset');
  const progressFill = $('progress-fill');
  const progressText = $('progress-text');
  const progressBar = $('progress-bar');
  const authModal = $('auth-modal');
  const authTitle = $('auth-title');
  const authEmail = $('auth-email');
  const authPassword = $('auth-password');
  const authSubmit = $('auth-submit');
  const authToggle = $('auth-toggle-mode');
  const authClose = $('auth-close');
  const authBtn = $('auth-btn');
  const userStatus = $('user-status');

  // ---------- АВТОРИЗАЦИЯ ----------
  let isLogin = true;
  function updateUserUI(user) {
    if (user) {
      userStatus.textContent = user.email;
      authBtn.textContent = '🚪';
      state.user = user;
      loadUserChecklist(user.uid);
      subscribeToPush(); // подписка на push
    } else {
      userStatus.textContent = 'Гость';
      authBtn.textContent = '👤';
      state.user = null;
      resetAll();
    }
  }

  authBtn.addEventListener('click', () => {
    if (state.user) { auth.signOut(); }
    else { authModal.style.display = 'flex'; }
  });
  authClose.addEventListener('click', () => authModal.style.display = 'none');
  authToggle.addEventListener('click', () => {
    isLogin = !isLogin;
    authTitle.textContent = isLogin ? 'Вход' : 'Регистрация';
    authSubmit.textContent = isLogin ? 'Войти' : 'Зарегистрироваться';
  });
  authSubmit.addEventListener('click', async () => {
    const email = authEmail.value, pass = authPassword.value;
    if (!email || !pass) return alert('Заполните поля');
    try {
      if (isLogin) await auth.signInWithEmailAndPassword(email, pass);
      else await auth.createUserWithEmailAndPassword(email, pass);
      authModal.style.display = 'none';
    } catch (e) { alert(e.message); }
  });
  auth.onAuthStateChanged(updateUserUI);

  // ---------- FIRESTORE ----------
  async function loadUserChecklist(uid) {
    try {
      const doc = await db.collection('checklists').doc(uid).get();
      if (doc.exists) {
        const data = doc.data();
        if (data && data.checklist) {
          state.role = data.role;
          state.answers = data.answers || {};
          state.checklist = data.checklist;
          state.deadlineDate = data.deadlineDate ? new Date(data.deadlineDate) : null;
          renderChecklist(data.checklist);
          if (state.deadlineDate) startDeadlineFromDate(state.deadlineDate);
          showStep('step-result');
        }
      }
    } catch (e) { console.warn('Ошибка загрузки', e); }
  }
  async function saveUserChecklist() {
    if (!state.user) return;
    const uid = state.user.uid;
    await db.collection('checklists').doc(uid).set({
      role: state.role,
      answers: state.answers,
      checklist: state.checklist,
      deadlineDate: state.deadlineDate ? state.deadlineDate.toISOString() : null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ---------- ВОПРОСЫ ----------
  function renderQuestions(role) {
    const qs = QUESTIONS[role] || [];
    if (!qs.length) return;
    let html = '';
    qs.forEach(q => {
      html += `<div class="question"><label>${q.label}</label><select id="q_${q.id}" data-id="${q.id}">${q.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>`;
    });
    questionsContainer.innerHTML = html;
    document.querySelectorAll('#questions-container select').forEach(s => s.addEventListener('change', validateAndEnable));
    validateAndEnable();
  }
  function validateAndEnable() {
    const selects = document.querySelectorAll('#questions-container select');
    btnGenerate.disabled = Array.from(selects).some(s => !s.value);
  }
  function getAnswers() {
    const ans = {};
    document.querySelectorAll('#questions-container select').forEach(s => ans[s.dataset.id] = s.value);
    return ans;
  }

  // ---------- ГЕНЕРАЦИЯ ЧЕК-ЛИСТА ----------
  function generateChecklist(role, answers) {
    let base = role === 'buyer' ? CHECKLISTS.buyer_default : CHECKLISTS.seller_default;
    let extra = [];
    if (role === 'buyer') {
      if (answers.mortgage === 'Да') extra.push(EXTRA_TASKS.mortgage_buyer);
      if (answers.property_type === 'Новостройка') extra.push(EXTRA_TASKS.newbuilding_buyer);
      if (answers.maternity_capital === 'Да') extra.push(EXTRA_TASKS.maternity_buyer);
    } else {
      if (answers.mortgage === 'Да') extra.push(EXTRA_TASKS.mortgage_seller);
      if (answers.urgency === 'Срочная (до 1 месяца)') extra.push(EXTRA_TASKS.urgent_seller);
      if (answers.property_type === 'Новостройка') extra.push(EXTRA_TASKS.newbuilding_seller);
      if (answers.maternity_capital === 'Да') extra.push(EXTRA_TASKS.maternity_seller);
    }
    return [...base, ...extra];
  }

  // ---------- ОТОБРАЖЕНИЕ ----------
  function renderChecklist(tasks) {
    if (!tasks || !tasks.length) { checklistContainer.innerHTML = '<p>Нет задач.</p>'; return; }
    let html = '';
    tasks.forEach((task, i) => {
      html += `<div class="checklist-item" data-index="${i}"><input type="checkbox" id="task_${i}"><label for="task_${i}">${task}</label></div>`;
    });
    checklistContainer.innerHTML = html;
    progressBar.style.display = 'block';
    updateProgress();
    document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', function() {
        this.closest('.checklist-item').classList.toggle('done', this.checked);
        updateProgress();
        saveProgressLocally();
        if (state.user) saveUserChecklist();
      });
    });
    loadLocalProgress();
    if (state.user) saveUserChecklist();
  }

  function updateProgress() {
    const total = document.querySelectorAll('.checklist-item').length;
    const done = document.querySelectorAll('.checklist-item input:checked').length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = pct + '% выполнено';
  }

  // ---------- ТАЙМЕР ----------
  function startDeadlineFromDate(deadline) {
    state.deadlineDate = deadline;
    if (state.timerInterval) clearInterval(state.timerInterval);
    function update() {
      const diff = deadline - new Date();
      if (diff <= 0) { deadlineTimer.textContent = '⏰ Дедлайн прошёл!'; deadlineTimer.classList.add('show'); clearInterval(state.timerInterval); return; }
      const d = Math.floor(diff / (1000*60*60*24)), h = Math.floor((diff / (1000*60*60)) % 24), m = Math.floor((diff / (1000*60)) % 60);
      deadlineTimer.textContent = `⏳ Осталось: ${d} дн. ${h} ч. ${m} мин.`;
      deadlineTimer.classList.add('show');
    }
    update();
    state.timerInterval = setInterval(update, 60000);
  }
  function startDeadline() {
    const d = new Date(); d.setDate(d.getDate() + 30);
    startDeadlineFromDate(d);
  }

  // ---------- ЛОКАЛЬНОЕ ХРАНЕНИЕ ----------
  function saveProgressLocally() {
    const checked = [];
    document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => { if (cb.checked) checked.push(cb.id); });
    localStorage.setItem('realty_checklist_local', JSON.stringify({ checked }));
  }
  function loadLocalProgress() {
    const raw = localStorage.getItem('realty_checklist_local');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
        if (data.checked.includes(cb.id)) { cb.checked = true; cb.closest('.checklist-item').classList.add('done'); }
      });
    } catch (e) {}
  }

  // ---------- НАВИГАЦИЯ ----------
  function showStep(id) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function resetAll() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    localStorage.removeItem('realty_checklist_local');
    state.role = null; state.answers = {}; state.checklist = []; state.deadlineDate = null;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    questionsContainer.innerHTML = '';
    checklistContainer.innerHTML = '';
    deadlineTimer.classList.remove('show');
    deadlineTimer.textContent = '';
    progressBar.style.display = 'none';
    btnGenerate.disabled = true;
    showStep('step-role');
  }

  // ---------- ОТПРАВКА EMAIL (EmailJS) ----------
  async function sendEmail(email, checklistText, deadlineText) {
    try {
      const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: CONFIG.emailjs.serviceID,
          template_id: CONFIG.emailjs.templateID,
          user_id: CONFIG.emailjs.userID,
          template_params: { to_email: email, subject: 'Ваш чек-лист', message: checklistText, deadline: deadlineText }
        })
      });
      return resp.ok;
    } catch (e) { return false; }
  }

  // ---------- ОТПРАВКА TELEGRAM ----------
  async function sendTelegram(contact, checklistText, deadlineText) {
    const token = CONFIG.telegram.botToken;
    const chatId = contact.startsWith('@') ? contact : contact;
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: `Чек-лист:\n${checklistText}\nДедлайн: ${deadlineText}` })
      });
      return resp.ok;
    } catch (e) { return false; }
  }

  // ---------- PUSH ПОДПИСКА ----------
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }
  async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!state.user) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CONFIG.vapidPublicKey)
      });
      await db.collection('users').doc(state.user.uid).set({ pushSubscription: sub }, { merge: true });
    } catch (e) { console.warn('Push не удалась', e); }
  }

  // ---------- ИНИЦИАЛИЗАЦИЯ ----------
  function init() {
    // Выбор роли
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        state.role = this.dataset.role;
        renderQuestions(state.role);
        showStep('step-questions');
      });
    });

    btnGenerate.addEventListener('click', function() {
      state.answers = getAnswers();
      state.checklist = generateChecklist(state.role, state.answers);
      renderChecklist(state.checklist);
      startDeadline();
      showStep('step-result');
      if (state.user) saveUserChecklist();
    });

    btnReset.addEventListener('click', resetAll);

    // PDF
    document.getElementById('btn-pdf').addEventListener('click', function() {
      const el = document.getElementById('checklist-container');
      const timer = document.getElementById('deadline-timer').textContent;
      const wrapper = document.createElement('div');
      wrapper.style.padding = '20px';
      wrapper.style.fontFamily = 'Arial, sans-serif';
      wrapper.style.background = '#fff';
      wrapper.innerHTML = `<h1 style="color:#2b6cb0;">📋 Чек-лист сделки</h1><p style="font-size:14px;color:#4a5568;">${timer}</p><hr>${el.innerHTML}<p style="margin-top:20px;font-size:12px;color:#a0aec0;">Сгенерировано ${new Date().toLocaleDateString()}</p>`;
      document.body.appendChild(wrapper);
      html2pdf().from(wrapper).save('checklist.pdf').then(() => document.body.removeChild(wrapper));
    });

    // CSV
    document.getElementById('btn-csv').addEventListener('click', function() {
      const tasks = document.querySelectorAll('.checklist-item label');
      let csv = 'Задача,Выполнено\n';
      tasks.forEach((label, i) => {
        const checked = document.querySelector(`#task_${i}`).checked ? 'Да' : 'Нет';
        csv += `"${label.textContent}",${checked}\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'checklist.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

    // Email
    document.getElementById('btn-send-email').addEventListener('click', async function() {
      const email = document.getElementById('email-input').value;
      if (!email || !email.includes('@')) return alert('Введите корректный email');
      const tasks = document.querySelectorAll('.checklist-item label');
      let list = '';
      tasks.forEach((label, i) => {
        const checked = document.querySelector(`#task_${i}`).checked ? '✅' : '⬜';
        list += `${checked} ${label.textContent}\n`;
      });
      const ok = await sendEmail(email, list, document.getElementById('deadline-timer').textContent);
      alert(ok ? 'Письмо отправлено!' : 'Ошибка EmailJS');
    });

    // Telegram
    document.getElementById('btn-subscribe-tg').addEventListener('click', async function() {
      const tg = document.getElementById('tg-input').value.trim();
      if (!tg) return alert('Введите контакт');
      const tasks = document.querySelectorAll('.checklist-item label');
      let list = '';
      tasks.forEach((label, i) => {
        const checked = document.querySelector(`#task_${i}`).checked ? '✅' : '⬜';
        list += `${checked} ${label.textContent}\n`;
      });
      const ok = await sendTelegram(tg, list, document.getElementById('deadline-timer').textContent);
      alert(ok ? 'Отправлено в Telegram!' : 'Ошибка (проверьте токен)');
    });

    // Тёмная тема
    document.getElementById('theme-toggle').addEventListener('click', function() {
      document.body.classList.toggle('dark');
      this.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    });

    showStep('step-role');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
