/* Optional help: keep navigation local to this dialog, never to the molecule desk. */
(() => {
  'use strict';
  const {topics} = window.AtlasHelpTopics;
  const get = id => document.getElementById(id);
  const dialog = get('help-guide'), picker = get('help-topic');
  const firstRun = topics.filter(topic => topic.firstRun);
  let steps = firstRun, index = 0;

  for (const {id,title} of topics) picker.add(new Option(title,id));
  function article() {
    const topic = topics[picker.selectedIndex];
    get('help-article').textContent = topic.title;
    get('help-since').textContent = topic.since;
    get('help-body').replaceChildren(...topic.body.map(text => {
      const p = document.createElement('p'); p.textContent = text; return p;
    }));
  }
  function wiki() {
    get('help-lesson').hidden = true;
    get('help-wiki').hidden = false;
    article(); picker.focus();
  }
  function step() {
    const topic = steps[index];
    const heading = get('help-step');
    get('help-wiki').hidden = true;
    get('help-lesson').hidden = false;
    get('help-progress').textContent = `Step ${index+1} of ${steps.length}`;
    heading.textContent = topic.title;
    get('help-instruction').textContent = topic.tour;
    get('help-version').textContent = topic.since;
    picker.value = topic.id;
    get('help-prev').disabled = index === 0;
    get('help-next').textContent = index === steps.length-1 ? 'Finish' : 'Next';
    heading.focus();
  }
  function start(sequence) { steps = sequence; index = 0; step(); }
  get('about-button').addEventListener('click', () => {
    dialog.showModal();
    // A reader can close the guide, try the step, then return to the same page.
    if (get('help-lesson').hidden && get('help-wiki').hidden) start(firstRun);
    else (get('help-wiki').hidden ? get('help-step') : picker).focus();
  });
  get('help-start').addEventListener('click', () => start(firstRun));
  get('help-index').addEventListener('click', wiki);
  picker.addEventListener('change', article);
  get('help-walk').addEventListener('click', () => start([topics[picker.selectedIndex]]));
  get('help-prev').addEventListener('click', () => { if(index > 0) { index--; step(); } });
  get('help-next').addEventListener('click', () => {
    if (index === steps.length-1) wiki();
    else { index++; step(); }
  });
  get('help-scope').addEventListener('click', () => {
    dialog.close();
    const coverage = get('coverage'); coverage.open = true;
    coverage.querySelector('summary').focus();
  });
})();
