// API anahtarı `config.txt` dosyasından yüklenecek
let API_KEY = null; // yüklenecek

async function loadApiKeyFromConfig() {
  try {
    const res = await fetch('config.txt', { cache: 'no-store' });
    if (!res.ok) throw new Error('config.txt yüklenemiyor');
    const text = await res.text();
    const trimmed = text.trim();
    let key = trimmed;
    if (trimmed.includes('=')) {
      const lines = trimmed.split(/\r?\n/);
      for (const line of lines) {
        const idx = line.indexOf('=');
        if (idx > -1) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k.toUpperCase() === 'API_KEY') { key = v; break; }
        }
      }
    }
    API_KEY = key;
    console.info('API anahtarı config.txt\'ten yüklendi.');
  } catch (err) {
    console.warn('API anahtarı yüklenemedi:', err);
  }
}

const $searchInput = document.getElementById("search-input");
const $searchBtn = document.getElementById("search-btn");
const $results = document.getElementById("results");
const $message = document.getElementById("message");
const $typeFilter = document.getElementById("type-filter");
const $yearFilter = document.getElementById("year-filter");
const $sortFilter = document.getElementById("sort-filter");
const $lastSearch = document.getElementById("last-search");
const $lastSearchBtn = document.getElementById("last-search-btn");


$searchBtn.disabled = true;
loadApiKeyFromConfig().then(() => {
  $searchBtn.disabled = false;
}).catch((e) => {
  $searchBtn.disabled = false;
  try { showMessage("API anahtarı yüklenemedi. config.txt dosyasını kontrol edin.", "error"); } catch (err) { console.warn(err); }
});


const searchCache = new Map();
const detailCache = new Map(); 

const CLICK_DISABLE_MS = 800;

const LAST_SEARCH_KEY = "omdb_last_search";


$searchBtn.addEventListener("click", onSearch);
$searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") onSearch(); });
$typeFilter.addEventListener("change", applyFiltersAndRender);
$yearFilter.addEventListener("input", applyFiltersAndRender);
$sortFilter.addEventListener("change", applyFiltersAndRender);
$lastSearchBtn.addEventListener("click", () => {
  const raw = localStorage.getItem(LAST_SEARCH_KEY);
  if (!raw) return;
  const obj = JSON.parse(raw);
  performSearch(obj.query, obj.type, obj.year);
});

renderLastSearch();



async function onSearch() {
  const query = $searchInput.value.trim();
  if (!query) {
    showMessage("Lütfen aramak için bir film adı girin.", "info");
    return;
  }
  if (!API_KEY) {
    showMessage("API anahtarı henüz yüklenmedi, lütfen bekleyin.", "info");
    return;
  }
  const type = $typeFilter.value;
  const year = $yearFilter.value.trim();

  disableSearchButtonTemporarily();

  const cacheKey = makeCacheKey(query, type, year);
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    renderResults(cached);
    saveLastSearch(query, type, year);
    return;
  }

  await performSearch(query, type, year);
}

function makeCacheKey(query, type, year) {
  return `${query.toLowerCase()}|${type||"all"}|${year||""}`;
}


async function performSearch(query, type="", year="") {
  clearMessage();
  showMessage("Aranıyor...", "info");

  try {
    const key = makeCacheKey(query, type, year);

    if (recentlyExecutedSameSearch(key)) {
      showMessage("Aynı arama kısa süre önce gerçekleştirildi, cache kullanılıyor.", "info");
      if (searchCache.has(key)) {
        renderResults(searchCache.get(key));
        saveLastSearch(query, type, year);
        return;
      }
    }

    const searchResults = await fetchSearch(query, type, year);
    if (!searchResults || searchResults.length === 0) {
      showMessage(`"${query}" için sonuç bulunamadı.`, "error");
      $results.innerHTML = "";
      return;
    }

    const details = await fetchDetailsForList(searchResults);

    searchCache.set(key, details);

    renderResults(details);
    saveLastSearch(query, type, year);
    clearMessage();
  } catch (err) {
    showMessage(err.message || "Bilinmeyen bir hata oluştu.", "error");
  }
}

const lastExecutedSearch = { key: null, time: 0 };
function recentlyExecutedSameSearch(key) {
  const now = Date.now();
  if (lastExecutedSearch.key === key && now - lastExecutedSearch.time < 2000) {
    return true;
  }
  lastExecutedSearch.key = key;
  lastExecutedSearch.time = now;
  return false;
}


async function fetchSearch(query, type="", year="") {
  const params = new URLSearchParams({
    apikey: API_KEY,
    s: query,
    page: "1"
  });
  if (type) params.set("type", type);
  if (year) params.set("y", year);

  const url = `https://www.omdbapi.com/?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Sunucu yanıt vermiyor.");
    const data = await res.json();
    if (data.Response === "False") {
      
      throw new Error(data.Error || "Arama başarısız.");
    }
    return data.Search || [];
  } catch (err) {
    throw new Error(`Arama başarısız: ${err.message}`);
  }
}

async function fetchDetailsForList(list) {
  const promises = list.map(item => fetchMovieDetails(item.imdbID));
  return Promise.all(promises);
}

async function fetchMovieDetails(imdbID) {
  if (detailCache.has(imdbID)) return detailCache.get(imdbID);

  const params = new URLSearchParams({
    apikey: API_KEY,
    i: imdbID,
    plot: "short"
  });
  const url = `https://www.omdbapi.com/?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Sunucu yanıt vermiyor.");
    const data = await res.json();
    if (data.Response === "False") {
      throw new Error(data.Error || "Detay alınamadı.");
    }
   
    detailCache.set(imdbID, data);
    return data;
  } catch (err) {
    return {
      Title: "Bilinmiyor",
      Year: "—",
      imdbID,
      Genre: "—",
      Director: "—",
      Poster: "",
      Runtime: "—",
      imdbRating: "—",
      _error: err.message
    };
  }
}



function renderResults(list) {
  let filtered = applyClientFilters(list.slice());
  filtered = applySort(filtered);

  $results.innerHTML = "";
  if (!filtered.length) {
    $results.innerHTML = `<p class="small">Filtreler sonucu hiçbir içerik göstermiyor.</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const movie of filtered) {
    const card = createCard(movie);
    frag.appendChild(card);
  }
  $results.appendChild(frag);
}

function createCard(movie) {
  const div = document.createElement("article");
  div.className = "card";
  div.setAttribute("aria-label", movie.Title);

  const posterUrl = (movie.Poster && movie.Poster !== "N/A") ? movie.Poster : placeholderPoster();

  const poster = document.createElement("div");
  poster.className = "poster";
  poster.style.backgroundImage = `url("${posterUrl}")`;
  div.appendChild(poster);

  const body = document.createElement("div");
  body.className = "card-body";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = movie.Title;

  const year = document.createElement("div");
  year.className = "year";
  year.textContent = movie.Year;

  titleRow.appendChild(title);
  titleRow.appendChild(year);

  const genre = document.createElement("div");
  genre.className = "meta";
  genre.innerHTML = `<strong>Tür:</strong> ${movie.Genre || "—"}`;

  const director = document.createElement("div");
  director.className = "meta";
  director.innerHTML = `<strong>Yönetmen:</strong> ${movie.Director || "—"}`;

  const runtime = document.createElement("div");
  runtime.className = "small";
  runtime.textContent = movie.Runtime && movie.Runtime !== "N/A" ? `Süre: ${movie.Runtime}` : "";

  const rating = document.createElement("div");
  rating.className = "small";
  rating.textContent = movie.imdbRating && movie.imdbRating !== "N/A" ? `IMDB: ${movie.imdbRating}` : "";

  body.appendChild(titleRow);
  body.appendChild(genre);
  body.appendChild(director);
  if (runtime.textContent) body.appendChild(runtime);
  if (rating.textContent) body.appendChild(rating);

  if (movie._error) {
    const err = document.createElement("div");
    err.className = "small";
    err.style.color = "var(--danger)";
    err.textContent = `Detay alınamadı: ${movie._error}`;
    body.appendChild(err);
  }

  div.appendChild(body);
  return div;
}

function placeholderPoster() {
  const svg = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='600'><rect fill='#e6e9ef' width='100%' height='100%'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#9ca3af' font-family='Arial' font-size='20'>No Image</text></svg>`);
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}


function applyClientFilters(list) {
  const type = $typeFilter.value;
  const year = $yearFilter.value.trim();

  return list.filter(item => {
    if (type && item.Type && item.Type.toLowerCase() !== type.toLowerCase()) return false;
    if (year && item.Year && !item.Year.startsWith(year)) return false;
    return true;
  });
}

function applySort(list) {
  const sort = $sortFilter.value;
  if (sort === "year-desc") {
    return list.sort((a, b) => Number((b.Year || 0).toString().slice(0,4)) - Number((a.Year || 0).toString().slice(0,4)));
  } else if (sort === "year-asc") {
    return list.sort((a, b) => Number((a.Year || 0).toString().slice(0,4)) - Number((b.Year || 0).toString().slice(0,4)));
  } else if (sort === "rating-desc") {
    return list.sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
  }
  return list; 
}

function applyFiltersAndRender() {
  const raw = localStorage.getItem(LAST_SEARCH_KEY);
  if (raw) {
    const { query, type, year } = JSON.parse(raw);
    const cacheKey = makeCacheKey(query, type, year);
    if (searchCache.has(cacheKey)) {
      renderResults(searchCache.get(cacheKey));
      return;
    }
  }
}



function showMessage(text, kind="info") {
  $message.hidden = false;
  $message.textContent = text;
  if (kind === "error") {
    $message.style.background = "#fff3f3";
    $message.style.color = "var(--danger)";
    $message.style.border = "1px solid rgba(225,29,72,0.08)";
  } else {
    $message.style.background = "transparent";
    $message.style.color = "var(--muted)";
    $message.style.border = "none";
  }
}

function clearMessage() {
  $message.hidden = true;
  $message.textContent = "";
  $message.style.border = "";
}

function disableSearchButtonTemporarily() {
  $searchBtn.disabled = true;
  setTimeout(() => $searchBtn.disabled = false, CLICK_DISABLE_MS);
}

function saveLastSearch(query, type, year) {
  const data = { query, type, year, time: Date.now() };
  try {
    localStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(data));
    renderLastSearch();
  } catch (err) {
    console.warn("localStorage hata:", err);
  }
}

function renderLastSearch() {
  const raw = localStorage.getItem(LAST_SEARCH_KEY);
  if (!raw) {
    $lastSearch.hidden = true;
    return;
  }
  try {
    const { query } = JSON.parse(raw);
    $lastSearchBtn.textContent = query;
    $lastSearch.hidden = false;
  } catch (err) {
    $lastSearch.hidden = true;
  }
}