(function() {
  'use strict';

  // ---------- ДАННЫЕ ----------
  const QUESTIONS = {
    buyer: [
      { id: 'property_type', label: 'Тип недвижимости', options: ['Квартира', 'Дом', 'Коммерция'] },
      { id: 'mortgage', label: 'Будете брать ипотеку?', options: ['Да', 'Нет'] },
      { id: 'ownership', label: 'Проверка истории', options: ['Хочу полную проверку', 'Только основные документы'] }
    ],
    seller: [
      { id: 'property_type', label: 'Тип недвижимости', options: ['Квартира', 'Дом', 'Коммерция'] },
      { id: 'mortgage', label: 'Есть обременение (ипотека/арест)?', options: ['Да', 'Нет'] },
      { id: 'urgency', label: 'Срочность продажи', options: ['Обычная', 'Срочная (до 1 месяца)'] }
    ]
  };

  const CHECKLISTS = {
    buyer_default: [
      'Проверить выписку ЕГРН на обременения',
      'Заказать справку о составе семьи (для прописки)',
      'Проверить задолженности по ЖКХ',
      'Согласовать задаток и подписать предварительный договор',
      'Заказать оценку для ипотеки (если нужно)',
      'Проверить историю перепродаж (не фиктивные сделки)'
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
    mortgage_seller: 'Запросить у банка график платежей для снятия обременения',
    urgent_seller: 'Подготовить нотариальную доверенность на сделку (ускоренно)'
  };

  // ---------- СОСТОЯНИЕ ----------
  let state = {
    role: null,
    answers: {},
    checklist: [],
    timerInterval: null,
    deadlineDate: null
  };

  // DOM-элементы
  const $ = id => document.getElementById(id);
  const stepRole = $('step-role');
  const stepQuestions = $('step-questions');
  const stepResult = $('step-result');
  const questionsContainer = $('questions-container');
  const btnGenerate = $('btn-generate');
  const checklistContainer = $('checklist-container');
  const deadlineTimer = $('deadline-timer');
  const btnReset = $('btn-reset');

  // ---------- ОТРИСОВКА ВОПРОСОВ ----------
  function renderQuestions(role) {
    const qs = QUESTIONS[role] || [];
    if (!qs.length) return;

    let html = '';
    qs.forEach(q => {
      html += `<div class="question">
        <label>${q.label}</label>
        <select id="q_${q.id}" data-id="${q.id}">
          ${q.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
        </select>
      </div>`;
    });
    questionsContainer.innerHTML = html;

    document.querySelectorAll('#questions-container select').forEach(sel => {
      sel.addEventListener('change', validateAndEnable);
    });
    validateAndEnable();
  }

  function validateAndEnable() {
    const selects = document.querySelectorAll('#questions-container select');
    let allFilled = true;
    selects.forEach(sel => {
      if (!sel.value) allFilled = false;
    });
    btnGenerate.disabled = !allFilled;
  }

  function getAnswers() {
    const selects = document.querySelectorAll('#questions-container select');
    const ans = {};
    selects.forEach(sel => {
      const id = sel.dataset.id;
      ans[id] = sel.value;
    });
    return ans;
  }

  // ---------- ГЕНЕРАЦИЯ ЧЕК-ЛИСТА ----------
  function generateChecklist(role, answers) {
    let base = role === 'buyer' ? CHECKLISTS.buyer_default : CHECKLISTS.seller_default;
    let extra = [];
    if (role === 'buyer' && answers.mortgage === 'Да') {
      extra.push(EXTRA_TASKS.mortgage_buyer);
    }
    if (role === 'seller' && answers.mortgage === 'Да') {
      extra.push(EXTRA_TASKS.mortgage_seller);
    }
    if (role === 'seller' && answers.urgency === 'Срочная (до 1 месяца)') {
      extra.push(EXTRA_TASKS.urgent_seller);
    }
    return [...base, ...extra];
  }

  // ---------- ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА С ПРОГРЕССОМ ----------
  function renderChecklist(tasks) {
    if (!tasks || !tasks.length) {
      checklistContainer.innerHTML = '<p>Нет задач для вашего случая.</p>';
      return;
    }

    let html = '<div class="checklist-group">';
    tasks.forEach((task, index) => {
      html += `
        <div class="checklist-item" data-index="${index}">
          <input type="checkbox" id="task_${index}">
          <label for="task_${index}">${task}</label>
        </div>
      `;
    });
    html += '</div>';
    checklistContainer.innerHTML = html;

    // Прогресс-бар
    const progressBar = document.getElementById('progress-bar');
    progressBar.style.display = 'block';
    updateProgress();

    // Обработчики чекбоксов
    document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', function() {
        updateProgress();
        saveProgress(state.checklist);
        // Отмечаем пункт как выполненный (визуально)
        const item = this.closest('.checklist-item');
        if (this.checked) item.classList.add('done');
        else item.classList.remove('done');
      });
    });

    // Восстанавливаем сохранённое состояние (если есть)
    loadProgress();

    // Сохраняем текущий список в state для сохранения
    state.checklist = tasks;
  }

  // Функция обновления прогресса
  function updateProgress() {
    const total = document.querySelectorAll('.checklist-item').length;
    const done = document.querySelectorAll('.checklist-item input:checked').length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    document.getElementById('progress-fill').style.width = percent + '%';
    document.getElementById('progress-text').textContent = percent + '% выполнено';
  }

  // ---------- ТАЙМЕР ----------
  function startDeadline() {
    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 30);
    state.deadlineDate = deadline;

    function updateTimer() {
      const diff = deadline - new Date();
      if (diff <= 0) {
        deadlineTimer.textContent = '⏰ Дедлайн прошёл! Срочно действуйте.';
        clearInterval(state.timerInterval);
        return;
      }
      const days = Math.floor(diff / (1000*60*60*24));
      const hours = Math.floor((diff / (1000*60*60)) % 24);
      const mins = Math.floor((diff / (1000*60)) % 60);
      deadlineTimer.textContent = `⏳ Осталось: ${days} дн. ${hours} ч. ${mins} мин.`;
      deadlineTimer.classList.add('show');
    }

    updateTimer();
    state.timerInterval = setInterval(updateTimer, 60000);
  }

  // ---------- СОХРАНЕНИЕ / ВОССТАНОВЛЕНИЕ ----------
  function saveProgress(tasks) {
    const data = {
      tasks: tasks,
      checked: []
    };
    document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
      if (cb.checked) data.checked.push(cb.id);
    });
    localStorage.setItem('realty_checklist', JSON.stringify(data));
  }

  function loadProgress() {
    const raw = localStorage.getItem('realty_checklist');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
        if (data.checked.includes(cb.id)) {
          cb.checked = true;
          cb.closest('.checklist-item').classList.add('done');
        }
        cb.addEventListener('change', function() {
          const item = this.closest('.checklist-item');
          if (this.checked) item.classList.add('done');
          else item.classList.remove('done');
          saveProgress(state.checklist);
          updateProgress();
        });
      });
    } catch (e) {}
  }

  // ---------- ПЕРЕКЛЮЧЕНИЕ ШАГОВ ----------
  function showStep(stepId) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(stepId);
    if (target) target.classList.add('active');
  }

  // ---------- СБРОС ----------
  function resetAll() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    localStorage.removeItem('realty_checklist');
    state = { role: null, answers: {}, checklist: [], timerInterval: null, deadlineDate: null };
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    questionsContainer.innerHTML = '';
    checklistContainer.innerHTML = '';
    deadlineTimer.classList.remove('show');
    deadlineTimer.textContent = '';
    document.getElementById('progress-bar').style.display = 'none';
    btnGenerate.disabled = true;
    showStep('step-role');
  }

  // ---------- ИНИЦИАЛИЗАЦИЯ ----------
  function init() {
    // 1. Выбор роли
    document.querySelectorAll('.role-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
        this.classList.add('selected');
        state.role = this.dataset.role;
        renderQuestions(state.role);
        showStep('step-questions');
      });
    });

    // 2. Кнопка "Показать чек-лист"
    btnGenerate.addEventListener('click', function() {
      const answers = getAnswers();
      state.answers = answers;
      const tasks = generateChecklist(state.role, answers);
      state.checklist = tasks;
      renderChecklist(tasks);
      startDeadline();
      showStep('step-result');
    });

    // 3. Кнопка "Начать заново"
    btnReset.addEventListener('click', resetAll);

    // 4. Кнопка PDF
    document.getElementById('btn-pdf').addEventListener('click', function() {
      const element = document.getElementById('checklist-container');
      const timerText = document.getElementById('deadline-timer').textContent;
      const wrapper = document.createElement('div');
      wrapper.style.padding = '20px';
      wrapper.style.fontFamily = 'Arial, sans-serif';
      wrapper.innerHTML = `
        <h1 style="color: #2b6cb0;">📋 Чек-лист сделки</h1>
        <p style="font-size: 14px; color: #4a5568;">${timerText}</p>
        <hr>
        ${element.innerHTML}
        <p style="margin-top: 20px; font-size: 12px; color: #a0aec0;">Сгенерировано ${new Date().toLocaleDateString()}</p>
      `;
      document.body.appendChild(wrapper);
      html2pdf().from(wrapper).save('checklist.pdf').then(() => {
        document.body.removeChild(wrapper);
      });
    });

    // 5. Отправка на email (заглушка)
    document.getElementById('btn-send-email').addEventListener('click', function() {
      const email = document.getElementById('email-input').value;
      if (!email || !email.includes('@')) {
        alert('Введите корректный email');
        return;
      }
      const tasks = document.querySelectorAll('.checklist-item label');
      let listText = '';
      tasks.forEach((label, i) => {
        const checked = document.querySelector(`#task_${i}`).checked ? '✅' : '⬜';
        listText += `${checked} ${label.textContent}\n`;
      });
      alert(`Письмо будет отправлено на ${email} со следующим текстом:\n\n${listText}\nДедлайн: ${document.getElementById('deadline-timer').textContent}`);
      // Здесь можно подключить EmailJS – см. инструкцию в описании
    });

    // 6. Подписка на Telegram (заглушка)
    document.getElementById('btn-subscribe-tg').addEventListener('click', function() {
      const tg = document.getElementById('tg-input').value.trim();
      if (!tg) return alert('Введите контакт');
      localStorage.setItem('tg_subscription', tg);
      alert('Вы подписаны на напоминания! (в демо-режиме)');
    });

    // Начальный шаг
    showStep('step-role');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
