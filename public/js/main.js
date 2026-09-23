// Progressive enhancement only — every form works without JS.
(function () {
  // Mobile nav
  var toggle = document.querySelector('[data-nav-toggle]');
  var nav = document.querySelector('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
  }

  // Confirm destructive actions
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Quiz stepper: one question at a time, auto-advance on answer.
  var quiz = document.querySelector('[data-quiz]');
  if (quiz) {
    var steps = Array.prototype.slice.call(quiz.querySelectorAll('[data-step]'));
    var bar = document.querySelector('[data-quiz-bar]');
    var back = quiz.querySelector('[data-quiz-back]');
    var next = quiz.querySelector('[data-quiz-next]');
    var i = 0;
    var answered = function (step) {
      var radios = step.querySelectorAll('input[type=radio]');
      if (!radios.length) return true;
      return Array.prototype.some.call(radios, function (r) { return r.checked; });
    };
    var show = function (n) {
      i = Math.max(0, Math.min(steps.length - 1, n));
      steps.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      bar.style.width = Math.round((i / (steps.length - 1)) * 100) + '%';
      back.style.visibility = i === 0 ? 'hidden' : 'visible';
      var last = i === steps.length - 1;
      next.style.display = last ? 'none' : '';
      next.disabled = !answered(steps[i]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    quiz.addEventListener('change', function (e) {
      if (e.target.type !== 'radio') return;
      next.disabled = false;
      setTimeout(function () { show(i + 1); }, 250);
    });
    back.addEventListener('click', function () { show(i - 1); });
    next.addEventListener('click', function () { show(i + 1); });
    show(0);
  }

  // Slot picker: show one day's times at a time.
  document.querySelectorAll('[data-slot-picker]').forEach(function (picker) {
    var btns = picker.querySelectorAll('[data-day]');
    var panels = picker.querySelectorAll('[data-day-panel]');
    var first = Array.prototype.find.call(btns, function (b) { return !b.disabled; });
    var select = function (day) {
      btns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-day') === day); });
      panels.forEach(function (p) {
        if (p.getAttribute('data-day-panel') === day) p.removeAttribute('data-hidden');
        else p.setAttribute('data-hidden', '');
      });
    };
    btns.forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-day')); }); });
    if (first) select(first.getAttribute('data-day'));
  });

  // Copy ad tracking links (admin → marketing)
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () { btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this link:', text); });
      else window.prompt('Copy this link:', text);
    });
  });

  // Daily habit checkboxes remembered for today (per device).
  var habits = document.querySelector('[data-habits]');
  if (habits) {
    var key = 'ss_habits_' + new Date().toISOString().slice(0, 10);
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) {}
    habits.querySelectorAll('input').forEach(function (box, k) {
      box.checked = !!saved[k];
      box.addEventListener('change', function () {
        saved[k] = box.checked;
        try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) {}
      });
    });
  }
})();
