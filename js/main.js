window.addEventListener('load', () => {
  initDT(); // Initialize the DataTable and window.columnNames variables

  addDarkmodeWidget();

  Options.loadAndShow();

  Progress().hide();

  const repo = getRepoFromUrl();

  try {
    const token = localStorage.getItem('token');
    if (token)
      document.getElementById('token').value = token;
    else {
    const authToken = getQueryVariableFromUrl("authToken");
    if (authToken) {
      document.getElementById('token').value = authToken;
      }
    }
  } catch {}

  if (repo) {
    document.getElementById('q').value = repo;
    fetchData();
  }
});

document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();
  fetchData();
});

let running = false;

function addDarkmodeWidget() {
  new Darkmode({ label: '🌓' }).showWidget();
}

function fetchData() {
  if (running) {
    running = false;
    return;
  }
  Runner.start();

  const repo = document.getElementById('q').value.replaceAll(' ', '');
  const re = /[-_\w]+\/[-_.\w]+/;

  const urlRepo = getRepoFromUrl();

  if (!urlRepo || urlRepo !== repo) {
    window.history.pushState('', '', `#${repo}`);
  }

  if (re.test(repo)) {
    (async function () {
      await fetchAndShow(repo);

      Runner.stop();
    })();
  } else {
    Runner.stop();
    showMsg(
      'Invalid GitHub repository! Format is &lt;username&gt;/&lt;repo&gt;',
      'danger'
    );
  }
}

function updateDT(data) {
  // Remove any alerts
  $('.alert').remove();

  // Process and validate forks data
  const processedForks = processForkData(data);
  
  if (processedForks.length === 0) {
    showMsg('No valid repository data found', 'danger');
    return;
  }

  // Update the table with processed data
  window.forkTable
    .clear()
    .rows.add(processedForks)
    .draw();
}

function processForkData(data) {
  return data.reduce((acc, fork) => {
    // Skip invalid forks
    if (!isValidFork(fork)) {
      return acc;
    }

    try {
      const processedFork = createForkObject(fork);
      if (processedFork) {
        acc.push(processedFork);
      }
    } catch (err) {
      console.error('Error processing fork:', err, fork);
    }
    return acc;
  }, []);
}

function isValidFork(fork) {
  return fork && 
         fork.status !== 404 && 
         fork.owner &&
         fork.full_name &&
         !fork.message?.includes('Not Found') &&
         !fork.message?.includes('No common ancestor');
}

function createForkObject(fork) {
  return {
    repoLink: fork.full_name ? `<a href="https://github.com/${fork.full_name}">Link</a>` : '',
    ownerName: fork.owner?.login || '',
    name: fork.name || '',
    default_branch: fork.default_branch || '',
    stargazers_count: fork.stargazers_count || 0,
    forks: fork.forks || 0,
    open_issues_count: fork.open_issues_count || 0,
    size: fork.size || 0,
    pushed_at: fork.pushed_at || null,
    diff_from_original: fork.diff_from_original || '',
    diff_to_original: fork.diff_to_original || ''
  };
}

function updateTableData(forks) {
  const dataSet = forks.map(fork => 
    window.columnNamesMap.map(([_, key]) => {
      const value = fork[key];
      return value !== undefined ? value : '';
    })
  );

  window.forkTable
    .clear()
    .rows.add(dataSet)
    .draw();
}



function initDT() {
  // Column definitions with proper data handling
  window.columnNamesMap = [
    ['Link', 'repoLink'],
    ['Owner', 'ownerName'],
    ['Name', 'name'],
    ['Branch', 'default_branch'],
    ['Stars', 'stargazers_count'],
    ['Forks', 'forks'],
    ['Open Issues', 'open_issues_count'],
    ['Size', 'size'],
    ['Last Push', 'pushed_at'],
    ['Diff Behind', 'diff_from_original'],
    ['Diff Ahead', 'diff_to_original']
  ];

  // Initialize DataTable with improved configuration
  window.forkTable = new DataTable('#forkTable', {
    columns: window.columnNamesMap.map(([title, key]) => ({
      title: title,
      data: key,
      defaultContent: '',
      render: (data, type, row) => {
        if (data === null || data === undefined) {
          return '';
        }

        switch (key) {
          case 'pushed_at':
            return type === 'display' && data
              ? moment(data).format('YYYY-MM-DD')
              : data;

          case 'diff_from_original':
          case 'diff_to_original':
            if (!data) return '';
            return type === 'display' 
              ? data
              : data.substr(4, 4);

          case 'stargazers_count':
          case 'forks':
          case 'open_issues_count':
          case 'size':
            return type === 'display'
              ? data.toLocaleString()
              : data;

          default:
            return data;
        }
      }
    })),
    columnDefs: [
      { className: 'dt-right', targets: [4, 5, 6, 7, 9, 10] },
      { width: '120px', targets: 8 }
    ],
    order: [[4, 'desc']], // Sort by stars by default
    createdRow: (row, data, index) => {
      // Enable popovers for the row
      $('[data-toggle=popover]', row).popover();
      // Highlight original repo
      if (index === 0) {
        $(row).addClass('original-repo');
      }
    },
    language: {
      emptyTable: 'No repository data available',
      zeroRecords: 'No matching repositories found'
    },
    deferRender: true,
    processing: true
  });
}

function renderColumnData(data, type, key) {
  if (data === null || data === undefined) {
    return '';
  }

  switch (key) {
    case 'pushed_at':
      return type === 'display' && data
        ? moment(data).format('YYYY-MM-DD')
        : data;

    case 'diff_from_original':
    case 'diff_to_original':
      return type === 'display'
        ? data || ''
        : data ? data.substr(4, 4) : '0000';


    default:
      return data;
  }
}

async function fetchAndShow(repo) {
  repo = repo.replace('https://github.com/', '');
  repo = repo.replace('http://github.com/', '');
  repo = repo.replace(/\.git$/, '');
  repo = repo.replace(/^\s+/, '');
  repo = repo.replace(/\s+$/, '');
  repo = repo.replace(/^\/+/, '');
  repo = repo.replace(/\/+$/, '');

  const token = document.getElementById('token').value.replaceAll(' ', '');
  if (token) {
    localStorage.setItem('token', token);
  } else {
    localStorage.removeItem('token');
  }

  const api = Api(token);

  const data = [];
  try {
    const maxRecords = Options.getAndSave().maxRecords;

    const singleLimiter = fork => {
      if (!fork) return null;
      return {
        full_name: fork.full_name,
        name: fork.name,
        default_branch: fork.default_branch,
        stargazers_count: fork.stargazers_count,
        forks: fork.forks,
        open_issues_count: fork.open_issues_count,
        size: fork.size,
        pushed_at: fork.pushed_at,
        owner: fork.owner ? {
          login: fork.owner.login
        } : null
      };
    };

    const multiLimiter = data => data.filter(item => item).map(singleLimiter).filter(item => item !== null);

    const originalRepo = await api.fetch(`https://api.github.com/repos/${repo}`, singleLimiter);
    if (!originalRepo) {
      throw new Error('Repository not found or access denied');
    }
    originalRepo.diff_from_original = originalRepo.diff_to_original = '0';
    const originalBranch = originalRepo.default_branch;
    data.push(originalRepo);

    let page = 1;
    while (data.length - 1 < maxRecords) {
      const url = `https://api.github.com/repos/${repo}/forks?sort=newest&per_page=${maxRecords}&page=${page}`;
      const someData = await api.fetch(url, multiLimiter, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!someData || someData.length === 0) break;
      data.push(...someData);
      ++page;
    }

    const validForks = data.slice(1).filter(fork => fork !== null);
    await updateData(repo, originalBranch, validForks, api);
  } catch (error) {
    console.error('Fetch error:', error);
    showMsg(`Error: ${error.message || 'An error occurred while fetching data'}`, 'danger');
    return;
  }

  try {
    const validData = data.filter(item => item !== null && item !== undefined);
    if (validData.length === 0) {
      showMsg('No valid repository data found', 'danger');
      return;
    }
    updateDT(validData);
  } catch (error) {
    console.error('Data processing error:', error);
    const msg = error.toString().includes('Forbidden')
      ? 'Error: API Rate Limit Exceeded'
      : `Error: ${error.message || 'An error occurred while processing data'}`;
    showMsg(msg, 'danger');
  }
}

function showMsg(msg, type) {
  let alert_type = 'alert-info';

  if (type === 'danger') {
    alert_type = 'alert-danger';
  }

  document.getElementById('footer').innerHTML = '';

  document.getElementById('data-body').innerHTML = `
        <div class="alert ${alert_type} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
            ${msg}
        </div>
    `;
}

function getRepoFromUrl() {
  const urlRepo = location.hash && location.hash.slice(1);

  return urlRepo && decodeURIComponent(urlRepo);
}

function getQueryVariableFromUrl(variable)
{
  let queryVarArray = window.location.search.substring(1).split("&");
  for (let queryVar of queryVarArray) {
    let kvp = queryVar.split("=");
    if (kvp[0] == variable)
      return kvp[1];
  }
  return null;
}

async function updateData(repo, originalBranch, forks, api) {

  forks.forEach(fork => fork.diff_from_original = fork.diff_to_original = '');

  let index = 1;
  const quota = Quota(api);
  const progress = Progress(forks.length);
  progress.show();

  const options = Options.getAndSave();
  const similarChecker = SimilarChecker(options);

  try {
    for (let fork of forks) {
      progress.update(index);
      if (!running) break;

      const updated = similarChecker.apply(fork);

      if (!updated) {
        await fetchMore(repo, originalBranch, fork, api);
        similarChecker.cache(fork);
      }
      quota.update();
      ++index;
    }
  } finally {
    progress.hide();

    await api.refreshLimits();
    quota.update();
  }
}

async function fetchMore(repo, originalBranch, fork, api) {
  // Using Promise.all for parallel requests with updated API endpoints
  return Promise.all([
    fetchMoreDir(`repos/${repo}/compare/${fork.owner.login}:${fork.default_branch}...${originalBranch}`, fork, true, api),
    fetchMoreDir(`repos/${repo}/compare/${originalBranch}...${fork.owner.login}:${fork.default_branch}`, fork, false, api)
  ]);
}

async function fetchMoreDir(endpoint, fork, fromOriginal, api) {
  const baseUrl = 'https://api.github.com';
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  const limiter = data => ({
    commits: data.commits.map(c => ({
      sha: c.sha.substring(0, 7), // Updated to 7 characters for modern Git SHA display
      commit: {
        author: {
          date: c.commit.author.date
        },
        message: c.commit.message
      },
      author: {
        login: c.author?.login
      }
    }))
  });

  try {
    const data = await api.fetch(`${baseUrl}/${endpoint}`, limiter, { headers });
    if (data) {
      const diffInfo = printInfo(fromOriginal ? '-' : '+', data, fork);
      if (fromOriginal) {
        fork.diff_from_original = diffInfo;
      } else {
        fork.diff_to_original = diffInfo;
      }
    }
  } catch (error) {
    const sortPrefix = '<!--0000-->';
    const errorMessage = error.message?.includes('No common ancestor') || error.status === 404 ? 'No common history' : '0';
    if (fromOriginal) {
      fork.diff_from_original = `${sortPrefix}${errorMessage}`;
    } else {
      fork.diff_to_original = `${sortPrefix}${errorMessage}`;
    }
    console.warn(`Compare failed for ${fork.full_name}: ${error.message}`);
  }
}

function printInfo(sep, data, fork) {
  const commits = data.commits;
  if (!commits.length) return '0';

  const details = '<pre>' +
    commits
      .map(c => {
        const date = new Date(c.commit.author.date).toISOString().split('T')[0];
        const sha = c.sha;
        return {
          link: `<a href="https://github.com/${fork.owner.login}/${fork.name}/commit/${sha}">${sha}</a>`,
          date,
          author: c.author?.login ?? '-',
          message: c.commit.message.split('\n')[0].trim().substring(0, 100)
        };
      })
      .map(c => `${c.link} ${c.date} ${c.author} - ${c.message}`)
      .join('\n')
      .replace(/[<>&"']/g, char => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
      }[char])) +
    '</pre>';

  const commitCount = commits.length;
  const sortPrefix = `<!--${commitCount.toString().padStart(4, '0')}-->`;
  
  return `${sortPrefix}<a tabindex="0" class="btn btn-sm btn-outline-secondary" 
    data-toggle="popover" 
    data-trigger="focus" 
    data-html="true" 
    data-placement="bottom" 
    title="Commits" 
    data-content="${details}">${sep}${commitCount}</a>`;
}

function Progress(max) {
  const $progress = $('.progress');
  const $bar = $('.progress-bar');

  function show() { $progress.show(); }

  function hide() { $progress.hide(); }

  function update(count) {
    const val = Math.round((count / max) * 100) + '%';
    $bar.width(val);
    $bar.text(`${count} / ${max}`);
  }

  return { show, hide, update };
}

function Quota(api) {
  const $quota = $('.quota');

  function update() {
    const rate = api.getLimits();
    const reset = moment(rate.reset).fromNow();
    $quota.html(`Quota: left ${rate.remaining} / ${rate.limit}<br/>Reset ${reset}`);
  }

  return { update };
}

function Api(token) {
  const config = token
    ? {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Token ' + token,
      },
      mode: 'cors'
    }
    // : undefined;
    // Work with no token provided. (Limits data availability.)
    : {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      mode: 'cors'
    };

  const rate = {
    remaining: '?',
    limit: '?',
    reset: new Date()
  };

  const cache = ApiCache();

  async function get(url, fnResponseLimiter) {
    try {
      const { cached, newConfig } = cache.get(url, config);

      // 202211 skip fething if cached
      if ( cached ) {
        return cached.data
      } 
      
      const response = await fetch(url, newConfig);
      if (response.status === 304)
        return cached.data;
      if (response.status === 404)
        return null;
      if (!response.ok)
        throw Error(response.statusText);

      updateRate(response);

      const data = await response.json();
      const limitedData = fnResponseLimiter(data);

      cache.add(url, limitedData, response);

      return limitedData;

    } catch (error) {
      const msg =
        error.toString().indexOf('Forbidden') >= 0
          ? 'Error: API Rate Limit Exceeded'
          : error;
      showMsg(`${msg}. Additional info in console`, 'danger');

      throw error;
    }
  }

  function getLimits() { return rate; }

  async function refreshLimits() {
    const url = 'https://api.github.com/rate_limit';
    const response = await fetch(url, config);
    if (response.ok)
      updateRate(response);
  }

  function updateRate(response) {
    rate.limit = response.headers.get('x-ratelimit-limit');
    rate.remaining = response.headers.get('x-ratelimit-remaining');
    rate.reset = new Date(1000 * parseInt(response.headers.get('x-ratelimit-reset')));
  }

  return { fetch: get, getLimits, refreshLimits };
}

function ApiCache() {

  const map = new Map();
  const STORAGE = sessionStorage;

  function get(url, config) {
    const key = url.toLowerCase();
    const newConfig = JSON.parse(JSON.stringify(config));

    let cachedString = map.get(key);
    try {
      if (!cachedString) {
        cachedString = STORAGE.getItem(key);
        if (cachedString)
          map.set(key, cachedString);
      }
    } catch { }

    const cached = JSON.parse(cachedString);
    if (cached) {
      newConfig.headers['if-none-match'] = cached.etag;
      cached.date = new Date();
    }

    return { cached, newConfig };
  }

  function add(url, limitedData, response) {
    const key = url.toLowerCase();
    const val = JSON.stringify({
      etag: response.headers.get('etag'),
      date: new Date(),
      data: limitedData
    });

    map.set(key, val);
    try {
      STORAGE.setItem(key, val);
    } catch (err) {
    }
  }

  return { get, add };
}

const Runner = {
  start: function () {
    running = true;
    $('#find .find-label').text('Stop');
    $('#find #spinner').addClass('d-inline-block');
  },
  stop: function () {
    running = false;
    $('#find .find-label').text('Find');
    $('#find #spinner').removeClass('d-inline-block');
  }
};

const Options = {

  loadAndShow: function () {
    $('#options')
      .on('show.bs.collapse', () => $('.options-button').addClass('options-button--expanded'))
      .on('hide.bs.collapse', () => $('.options-button').removeClass('options-button--expanded'));

    try {
      const savedString = localStorage.getItem('options');
      const saved = JSON.parse(savedString)
        || { sameSize: true, samePushDate: true, maxRecords: 100 };

      $('#sameSize').attr('checked', saved.sameSize);
      $('#samePushDate').attr('checked', saved.samePushDate);
      $('#maxRecords').val(saved.maxRecords);
    } catch { }
  },

  getAndSave: function () {
    const sameSize = $('#sameSize').is(':checked');
    const samePushDate = $('#samePushDate').is(':checked');
    const maxRecords = $('#maxRecords').val();

    const val = { sameSize, samePushDate, maxRecords };
    try {
      localStorage.setItem('options', JSON.stringify(val));
    } catch { }
    return val;
  }
};

function SimilarChecker(options) {
  const similarForks = new Map();

  function getKey(fork) {
    let key = '';
    if (options.sameSize) key += fork.size + '_';
    if (options.samePushDate) key += fork.pushed_at + '_';
    return key;
  }

  function apply(fork) {
    const key = getKey(fork);
    if (key.length > 0) {
      const similarFork = similarForks.get(key);
      if (similarFork) {
        fork.diff_from_original = similarFork.diff_from_original;
        fork.diff_to_original = similarFork.diff_to_original;
        return true;
      }
    }

    return false;
  }

  function cache(fork) {
    const key = getKey(fork);
    if (key.length > 0) {
      similarForks.set(key, {
        diff_from_original: fork.diff_from_original,
        diff_to_original: fork.diff_to_original
      });
    }
  }

  return { apply, cache };
}
