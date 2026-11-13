import { RemoteClient } from '../client';
import { explainNotice, hintPrompt, hintText, loadSkills, matchSkills, needsText, readSkillMenu, skillNotice, slashQuery } from '../skills';
import { FakeDesktop, desktopAddress } from './fake-desktop';

function pairedClient(desktop: FakeDesktop) {
  desktop.paired.add('ab'.repeat(32));
  return new RemoteClient(desktop.transport(), desktopAddress);
}

function openMenu(desktop: FakeDesktop) {
  desktop.element('s1', '/files. Choose local files to read and discuss in this chat. ', 'Button', 555);
  desktop.element('s2', '/web-search. Use when current information or sourced web research is needed. <question>', 'Button', 593);
  const hidden = desktop.element('s3', '/table. Use when comparing structured records in a native table. <what to present>', 'Button', 1923);
  hidden.visible = false;
}

describe('Sovra’s / skills on the phone', () => {
  it('reads every skill in the menu, including rows scrolled out of view', () => {
    const desktop = new FakeDesktop();
    openMenu(desktop);
    desktop.element('nav', 'Skills', 'Button', 152);
    const skills = readSkillMenu(desktop.snapshot());
    expect(skills).toEqual([
      { name: 'files', title: 'Files', description: 'Choose local files to read and discuss in this chat.', hint: '' },
      { name: 'web-search', title: 'Web search', description: 'Use when current information or sourced web research is needed.', hint: '<question>' },
      { name: 'table', title: 'Table', description: 'Use when comparing structured records in a native table.', hint: '<what to present>' },
    ]);
    expect(needsText(skills[0])).toBe(false);
    expect(needsText(skills[2])).toBe(true);
    expect(hintText(skills[2])).toBe('what to present');
    expect(hintPrompt(skills[2])).toBe('What to present…');
    expect(hintPrompt(skills[1])).toBe('Your question…');
    expect(hintPrompt(skills[0])).toBe('Add details, or just tap Send');
  });

  it('keeps the part of a specialist’s description people need', () => {
    const desktop = new FakeDesktop();
    desktop.element('s', '/coding. Consult this specialist when you need help with: Builds websites and small apps. <task>', 'Button', 0);
    expect(readSkillMenu(desktop.snapshot())[0].description).toBe('Builds websites and small apps.');
  });

  it('ranks matches like the desktop menu', () => {
    const desktop = new FakeDesktop();
    openMenu(desktop);
    const skills = readSkillMenu(desktop.snapshot());
    expect(matchSkills(skills, 'ta').map((skill) => skill.name)).toEqual(['table']);
    expect(matchSkills(skills, '/search').map((skill) => skill.name)).toEqual(['web-search']);
    expect(matchSkills(skills, 'compar').map((skill) => skill.name)).toEqual(['table']);
    expect(matchSkills(skills, '')).toHaveLength(3);
  });

  it('only treats a leading command still being typed as a / query', () => {
    expect(slashQuery('/')).toBe('');
    expect(slashQuery('/web')).toBe('web');
    expect(slashQuery('/web what')).toBeNull();
    expect(slashQuery('and/or')).toBeNull();
  });

  it('explains Sovra’s skill notices in plain words', () => {
    const desktop = new FakeDesktop();
    desktop.element('n', 'Usage: /table <what to present>', 'Alert', 640);
    const notice = skillNotice(desktop.snapshot());
    expect(notice).toBe('Usage: /table <what to present>');
    expect(explainNotice(notice!)).toBe('Table needs a little more: tell it what to present.');
    expect(explainNotice('Unknown skill /tabel. Type / to see available skills.')).toContain('Unknown skill');
  });

  it('opens the menu on the computer, reads it, and leaves the chat box empty', async () => {
    const desktop = new FakeDesktop();
    desktop.element('composer', 'Message Sovra', 'MultilineTextInput', 700);
    desktop.onDeliver = (input) => {
      if (input.action === 'type' && input.text === '/') openMenu(desktop);
    };
    const result = await loadSkills(pairedClient(desktop));
    expect(result.ok && result.value.map((skill) => skill.name)).toEqual(['files', 'web-search', 'table']);
    expect(desktop.delivered).toEqual([
      { action: 'click', target: 'composer' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
      { action: 'type', text: '/' },
      { action: 'key', key: 'secondary-a' },
      { action: 'key', key: 'backspace' },
    ]);
  });
});
