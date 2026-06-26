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

  // Чек-листы (ключи – комбинация выбранных ответов)
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

  // Карта дополнительных пунктов для разных случаев
  const EXTRA_TASKS = {
    mortgage_buyer: 'Получить одобрение банка на ипотеку',
    mortgage_seller: 'Запросить у банка график платежей для снятия обременения',
    urgent_seller: 'Подготовить нотариальную доверенность на сделку (ускоренно)'
  };

  // ---------- СОСТОЯНИЕ ----------
  let state = {
    role: null,          // 'buyer' или 'seller'
    answers: {},         // { property_type: 'Квартира', mortgage: 'Да', ... }
    checklist: [],       // массив строк
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

    // Вешаем событие на изменение любого вопроса
    document.querySelectorAll('#questions-container select').forEach(sel => {
      sel.addEventListener('change', validateAndEnable);
    });
    validateAndEnable();
  }

  // ---------- ПРОВЕРКА ЗАПОЛНЕННОСТИ ВСЕХ ВОПРОСОВ ----------
  function validateAndEnable() {
    const selects = document.querySelectorAll('#questions-container select');
    let allFilled = true;
    selects.forEach(sel => {
      if (!sel.value) allFilled = false;
    });
    btnGenerate.disabled = !allFilled;
  }

  // ---------- СБОР ОТВЕТОВ ----------
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

    // Добавляем специфичные задачи
    if (role === 'buyer' && answers.mortgage === 'Да') {
      extra.push(EXTRA_TASKS.mortgage_buyer);
    }
    if (role === 'seller' && answers.mortgage === 'Да') {
      extra.push(EXTRA_TASKS.mortgage_seller);
    }
    if (role === 'seller' && answers.urgency === 'Срочная (до 1 месяца)') {
      extra.push(EXTRA_TASKS.urgent_seller);
    }

    // Сортировка: сначала базовые, потом дополнительные
    return [...base, ...extra];
  }

  // ---------- ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА ----------
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

    // Сохраняем в localStorage (прогресс)
    saveProgress(tasks);
  }

  // ---------- ТАЙМЕР ДЕДЛАЙНА ----------
  function startDeadline() {
    // Устанавливаем дедлайн на 30 дней от сегодня
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
    state.timerInterval = setInterval(updateTimer, 60000); // обновляем каждую минуту
  }

  // ---------- СОХРАНЕНИЕ ПРОГРЕССА (localStorage) ----------
  function saveProgress(tasks) {
    const data = {
      tasks: tasks,
      checked: []
    };
    // Сохраняем состояние чекбоксов
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
      // Восстанавливаем чекбоксы (если уже отрисованы)
      document.querySelectorAll('.checklist-item input[type="checkbox"]').forEach(cb => {
        if (data.checked.includes(cb.id)) {
          cb.checked = true;
          cb.closest('.checklist-item').classList.add('done');
        }
        cb.addEventListener('change', function() {
          const item = this.closest('.checklist-item');
          if (this.checked) item.classList.add('done');
          else item.classList.remove('done');
          saveProgress(state.checklist); // обновляем сохранение
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
    // Очищаем таймер
    if (state.timerInterval) clearInterval(state.timerInterval);
    localStorage.removeItem('realty_checklist');
    state = { role: null, answers: {}, checklist: [], timerInterval: null, deadlineDate: null };
    // Сбрасываем UI
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
    questionsContainer.innerHTML = '';
    checklistContainer.innerHTML = '';
    deadlineTimer.classList.remove('show');
    deadlineTimer.textContent = '';
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
        // Переходим к вопросам
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
      loadProgress(); // восстанавливаем сохранённые чекбоксы (если есть)
      startDeadline();
      showStep('step-result');
    });

    // 3. Кнопка "Начать заново"
    btnReset.addEventListener('click', resetAll);

    // 4. Если был сохранён прогресс – можно сразу показать результат?
    // Но мы упростим: при загрузке показываем шаг выбора роли.
    // Однако можно проверить, есть ли сохранённый прогресс, и предложить продолжить.
    // Для этого добавим небольшую проверку:
    const saved = localStorage.getItem('realty_checklist');
    if (saved) {
      // Если хотите, можно предложить восстановить, но для чистоты – просто сбросим.
      // Но по желанию можно добавить кнопку "Восстановить".
      // Я предлагаю не усложнять, пользователь сам начнёт заново.
      localStorage.removeItem('realty_checklist');
    }

    // Начальный шаг
    showStep('step-role');
  }

  // Запускаем после загрузки DOM
  document.addEventListener('DOMContentLoaded', init);
})();
