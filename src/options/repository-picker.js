// Repository picker of the options page: checkboxes grouped by project, with a text filter

const repoId = repo => `${repo.projectKey}/${repo.repoSlug}`;

/**
 * Create a picker rendering into listElement and filtered by filterInput
 * Returns { setSelected, setAvailable, getSelected }
 */
export function createRepositoryPicker(listElement, filterInput) {
  // Repositories loaded from Bitbucket (null until loaded), and the selected ones by "PROJECT/repo"
  let available = null;
  const selected = new Map();

  filterInput.addEventListener('input', applyFilter);
  render();

  /**
   * Set the selected repositories ([{ projectKey, repoSlug }])
   */
  function setSelected(repositories) {
    selected.clear();
    repositories.forEach(({ projectKey, repoSlug }) => selected.set(repoId({ projectKey, repoSlug }), { projectKey, repoSlug }));
    render();
  }

  /**
   * Set the repositories loaded from Bitbucket ([{ projectKey, projectName, repoSlug, repoName }])
   */
  function setAvailable(repositories) {
    available = repositories;
    render();
  }

  /**
   * Get the selected repositories ([{ projectKey, repoSlug }])
   */
  function getSelected() {
    return [...selected.values()];
  }

  function render() {
    // Selected repositories missing from the loaded list stay listed (and selected), so saving does not drop them
    const loaded = available || [];
    const loadedIds = new Set(loaded.map(repoId));
    const missing = getSelected()
      .filter(repo => !loadedIds.has(repoId(repo)))
      .map(repo => ({ ...repo, missing: available !== null }));

    const byProject = new Map();
    for (const repo of [...loaded, ...missing]) {
      if (!byProject.has(repo.projectKey)) {
        byProject.set(repo.projectKey, []);
      }
      byProject.get(repo.projectKey).push(repo);
    }

    if (byProject.size === 0) {
      listElement.replaceChildren(createNote(available === null
        ? 'No repositories selected. Load the repositories to choose from Bitbucket.'
        : 'No repositories found.'));
      return;
    }

    const groups = [...byProject.keys()].sort().map(projectKey => createGroup(projectKey, byProject.get(projectKey)));
    const noMatch = createNote('No repositories match the filter.');
    noMatch.classList.add('repository-no-match');
    listElement.replaceChildren(...groups, noMatch);
    applyFilter();
  }

  function createGroup(projectKey, repositories) {
    const group = document.createElement('div');
    group.className = 'repository-group';

    const title = document.createElement('div');
    title.className = 'repository-group-title';
    const projectName = repositories.find(repo => repo.projectName)?.projectName;
    title.textContent = projectName && projectName !== projectKey ? `${projectName} (${projectKey})` : projectKey;
    group.appendChild(title);

    repositories
      .sort((a, b) => a.repoSlug.localeCompare(b.repoSlug))
      .forEach(repo => group.appendChild(createItem(repo)));
    return group;
  }

  function createItem(repo) {
    const id = repoId(repo);

    const item = document.createElement('label');
    item.className = 'repository-item';
    item.dataset.search = [repo.projectKey, repo.projectName, repo.repoSlug, repo.repoName].filter(Boolean).join(' ').toLowerCase();

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = selected.has(id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selected.set(id, { projectKey: repo.projectKey, repoSlug: repo.repoSlug });
      } else {
        selected.delete(id);
      }
    });

    const name = document.createElement('span');
    name.textContent = repo.repoName || repo.repoSlug;
    item.append(checkbox, name);

    if (repo.missing) {
      const missing = document.createElement('span');
      missing.className = 'repository-missing';
      missing.textContent = 'not found';
      item.appendChild(missing);
    }

    const path = document.createElement('span');
    path.className = 'repository-path';
    path.textContent = id;
    item.appendChild(path);

    return item;
  }

  function createNote(text) {
    const note = document.createElement('div');
    note.className = 'repository-note';
    note.textContent = text;
    return note;
  }

  function applyFilter() {
    const query = filterInput.value.trim().toLowerCase();
    let visibleItems = 0;

    listElement.querySelectorAll('.repository-group').forEach(group => {
      let visibleInGroup = 0;
      group.querySelectorAll('.repository-item').forEach(item => {
        item.hidden = Boolean(query) && !item.dataset.search.includes(query);
        if (!item.hidden) {
          visibleInGroup++;
        }
      });
      group.hidden = visibleInGroup === 0;
      visibleItems += visibleInGroup;
    });

    const noMatch = listElement.querySelector('.repository-no-match');
    if (noMatch) {
      noMatch.hidden = visibleItems > 0;
    }
  }

  return { setSelected, setAvailable, getSelected };
}
