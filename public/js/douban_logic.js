console.log('douban_logic.js loaded');

// Fisher-Yates (aka Knuth) Shuffle
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Helper function for caching Douban API data
async function fetchAndCacheDoubanData(cacheKey, fetchFn, ...fetchArgs) {
    try {
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
            console.log("豆瓣首页：从缓存加载", cacheKey);
            // Ensure the loading overlay/message for the specific section is cleared if data is from cache
            // This might need to be handled where renderCategoryGridCards is called or before it.
            return JSON.parse(cachedData);
        }
    } catch (e) {
        console.error("豆瓣首页：读取缓存失败", cacheKey, e);
        sessionStorage.removeItem(cacheKey); // Remove corrupted cache entry
    }

    // Show loading specific to this fetch, if not already handled by caller
    // console.log("豆瓣首页：从API获取", cacheKey);
    const data = await fetchFn(...fetchArgs); // Call the original fetch function

    if (data && data.subjects) { // Only cache successful responses with data
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
            console.log("豆瓣首页：已缓存", cacheKey);
        } catch (e) {
            console.error("豆瓣首页：写入缓存失败", cacheKey, e);
            // Consider clearing some old cache items if storage is full (e.g., LRU strategy)
            // For now, just log the error. A more robust solution might involve checking e.name === 'QuotaExceededError'
        }
    }
    return data;
}

// Global state variables related to Douban functionality
window.defaultMovieTags = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动作', '喜剧', '爱情', '科幻', '悬疑', '恐怖', '治愈'];
window.defaultTvTags = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];

window.movieTags = [];
window.tvTags = [];

const movieChartNames = {
    'Top250电影': { tag: '豆瓣高分', sort: 'rank' },
    '正在热映': { tag: '热门', sort: 'recommend' },
    '即将上映': { tag: '最新', sort: 'time' },
    '新片榜': { tag: '最新', sort: 'recommend' },
    '口碑榜': { tag: '豆瓣高分', sort: 'recommend' },
    '近期高分电影': { tag: '豆瓣高分', sort: 'time' },
    '经典动作大片': { tag: '动作', sort: 'rank' },
    '热门科幻电影': { tag: '科幻', sort: 'recommend' },
    '冷门佳片精选': { tag: '冷门佳片', sort: 'rank' },
    '最新华语电影': { tag: '华语', sort: 'time' }
};

const tvChartNames = {
    '热门剧集综合榜': { tag: '热门', sort: 'rank' },
    '高分热门美剧': { tag: '美剧', sort: 'rank' },
    '近期日剧新作': { tag: '日剧', sort: 'time' },
    '经典纪录片': { tag: '纪录片', sort: 'rank' },
    '国产剧集精选': { tag: '国产剧', sort: 'recommend' },
    '高分日本动画': { tag: '日本动画', sort: 'rank'}
};

window.doubanMovieTvCurrentSwitch = 'movie'; // This might be primarily for search page filters now
window.doubanCurrentTag = '热门'; // Represents the currently active tag for category view

// New structure for homepage top navigation tags
window.homepageTopNavTags = []; // To be populated in initDouban or a dedicated function

// For Category View
window.currentCategoryViewTag = '';
window.currentCategoryViewType = '';
window.currentCategoryPageStart = 0;
window.categoryItemsPerPage = 20; // Adjusted to 20 as per user observation for better infinite scroll
window.isLoadingCategoryItems = false;
window.noMoreCategoryItems = false;
window.currentCategorySourceConfig = null; // To store source config for category view

// For Home Page Waterfall
window.homePageActiveTags = []; 
window.homePageCurrentTagIndex = 0;
window.homePageItemsPerTag = 20; 
window.homePageTagsPerBatch = 2; 
window.isLoadingHomePageItems = false;
window.noMoreHomePageTags = false;

// --- Old Douban Search Filter Logic (for dropdowns) is now removed ---
// The new button-based filters on the search page are handled by douban_filters.js


function loadUserTags() {
    try {
        const savedMovieTags = localStorage.getItem('userMovieTags');
        window.movieTags = savedMovieTags ? JSON.parse(savedMovieTags) : [...window.defaultMovieTags];
        const savedTvTags = localStorage.getItem('userTvTags');
        window.tvTags = savedTvTags ? JSON.parse(savedTvTags) : [...window.defaultTvTags];
    } catch (e) {
        console.error('加载标签失败：', e);
        window.movieTags = [...window.defaultMovieTags]; 
        window.tvTags = [...window.defaultTvTags];
    }
}

function saveUserTags() {
    try {
        localStorage.setItem('userMovieTags', JSON.stringify(window.movieTags));
        localStorage.setItem('userTvTags', JSON.stringify(window.tvTags));
    } catch (e) { 
        console.error('保存标签失败：', e); 
        if (typeof showToast === 'function') showToast('保存标签失败', 'error'); 
    }
}

async function loadNextBatchOfHomePageTags() {
    const homePage = document.getElementById('page-home');
    if (!homePage || homePage.classList.contains('hidden')) {
        window.isLoadingHomePageItems = false; 
        return;
    }
    if (window.isLoadingHomePageItems || window.noMoreHomePageTags) return;

    window.isLoadingHomePageItems = true;
    const recommendationsContainer = document.getElementById('douban-recommendations-container');
    if (!recommendationsContainer) {
        window.isLoadingHomePageItems = false; 
        return;
    }

    let bottomSpinner = document.getElementById('home-page-bottom-spinner');
    if (window.homePageCurrentTagIndex > 0 && !window.noMoreHomePageTags) {
        if (!bottomSpinner) {
            bottomSpinner = document.createElement('div');
            bottomSpinner.id = 'home-page-bottom-spinner';
            bottomSpinner.className = 'col-span-full text-center py-4';
            recommendationsContainer.appendChild(bottomSpinner);
        }
        bottomSpinner.innerHTML = '<p class="text-gray-400">正在加载更多推荐...</p>';
        bottomSpinner.style.display = 'block';
    }

    for (let i = 0; i < window.homePageTagsPerBatch; i++) {
        if (window.homePageCurrentTagIndex >= window.homePageActiveTags.length) {
            window.noMoreHomePageTags = true;
            break;
        }

        const tagConfig = window.homePageActiveTags[window.homePageCurrentTagIndex];
        window.homePageCurrentTagIndex++;

        const section = document.createElement('div');
        section.className = 'home-tag-section py-4';
        const titleContainer = document.createElement('div');
        titleContainer.className = 'flex justify-between items-center px-1 mb-3';
        const titleElement = document.createElement('h2');
        titleElement.className = 'text-xl font-semibold text-white';
        titleElement.textContent = tagConfig.title;
        titleContainer.appendChild(titleElement);
        
        // "更多" button logic - only show if not a chart or if chart has a category view equivalent
        if (!tagConfig.isChart || (tagConfig.isChart && tagConfig.typeForCatView)) {
            const moreButton = document.createElement('button');
            moreButton.className = 'text-sm text-pink-400 hover:text-pink-300 transition-colors';
            moreButton.innerHTML = '更多 &rarr;';
            moreButton.onclick = () => {
                // For charts, typeForCatView should be the genre name like "剧情"
                // For other tags, tagConfig.type is usually '电影' or '电视剧' or a specific content type like '动画'
                const categoryTypeForView = tagConfig.isChart ? tagConfig.typeForCatView : (tagConfig.typeForCatView || tagConfig.type);
                navigateToCategoryView(tagConfig.title, categoryTypeForView, tagConfig);
            };
            titleContainer.appendChild(moreButton);
        }

        section.appendChild(titleContainer);

        const carouselContainer = document.createElement('div');
        carouselContainer.className = 'carousel-container overflow-x-auto pb-2';
        const carouselTrack = document.createElement('div');
        carouselTrack.className = 'carousel-track flex space-x-3';
        carouselContainer.appendChild(carouselTrack);
        section.appendChild(carouselContainer);
        
        if (bottomSpinner && recommendationsContainer.contains(bottomSpinner)) {
            recommendationsContainer.insertBefore(section, bottomSpinner);
        } else {
            recommendationsContainer.appendChild(section);
        }
        carouselTrack.innerHTML = `<div class="text-gray-400 p-4">正在加载 ${tagConfig.title}...</div>`;

        let data;
        // let fetchPromise; // fetchPromise will be assigned directly by fetchAndCacheDoubanData
        const useOnlyOldApi = localStorage.getItem('doubanApiMode') !== 'true'; // Default to old API
        let cacheKeyPrefix = `doubanCache_home_${tagConfig.title.replace(/[^a-zA-Z0-9]/g, '')}_`;

        if (tagConfig.isChart) {
            console.log(`[Home Page Waterfall] Preparing chart for "${tagConfig.title}" (Genre: ${tagConfig.chartGenreName})`);
            const chartCacheKey = `${cacheKeyPrefix}chart_${tagConfig.chartGenreName}_${window.homePageItemsPerTag}`;
            data = await fetchAndCacheDoubanData(chartCacheKey, fetchDoubanChartTopList, tagConfig.chartGenreName, { limit: window.homePageItemsPerTag });
        } else if (!useOnlyOldApi && tagConfig.useNewApi && tagConfig.apiParams) {
            const paramsForFetch = { ...tagConfig.apiParams, start: '0' };
            // Sanitize cache key from paramsForFetch object
            const paramsString = JSON.stringify(paramsForFetch, Object.keys(paramsForFetch).sort());
            const newApiCacheKey = `${cacheKeyPrefix}new_${paramsString.replace(/[^a-zA-Z0-9]/g, '')}`;
            console.log(`[Home Page Waterfall] Preparing New API fetch for "${tagConfig.title}"`);
            data = await fetchAndCacheDoubanData(newApiCacheKey, fetchNewDoubanSearch, paramsForFetch);
        } else {
            const doubanApiBase = 'https://movie.douban.com';
            let oldApiType = tagConfig.type;
            let oldApiTag = tagConfig.apiTag;
            let oldApiSort = tagConfig.apiSort;

            if (useOnlyOldApi && tagConfig.useNewApi && tagConfig.apiParams) {
                let determinedType = 'movie';
                const typeHint = tagConfig.typeForCatView || (tagConfig.apiParams ? tagConfig.apiParams.tags : '');
                if (typeHint === '电影') determinedType = 'movie';
                else if (typeHint === '电视剧') determinedType = 'tv';
                else if (typeHint === '动画') determinedType = 'movie';
                else if (typeHint === '综艺') determinedType = 'tv';
                else if (typeHint === '纪录片') determinedType = 'movie';
                else if (typeHint === '短片') determinedType = 'movie';
                oldApiType = determinedType;
                if (tagConfig.apiParams.genres) oldApiTag = tagConfig.apiParams.genres;
                else if (tagConfig.apiParams.countries) oldApiTag = tagConfig.apiParams.countries;
                else if (tagConfig.apiParams.tags) oldApiTag = tagConfig.apiParams.tags;
                else oldApiTag = tagConfig.title;
                const sortMap = { 'T': 'recommend', 'R': 'time', 'S': 'rank' };
                const newApiSortParam = tagConfig.apiParams.sort || tagConfig.apiSort;
                oldApiSort = sortMap[newApiSortParam] || (['recommend', 'time', 'rank'].includes(newApiSortParam) ? newApiSortParam : 'recommend');
            }

            const targetUrl = `${doubanApiBase}/j/search_subjects?type=${oldApiType}&tag=${encodeURIComponent(oldApiTag)}&sort=${oldApiSort}&page_limit=${window.homePageItemsPerTag}&page_start=0`;
            const oldApiCacheKey = `${cacheKeyPrefix}old_${encodeURIComponent(targetUrl)}`;
            console.log(`[Home Page Waterfall] (${useOnlyOldApi ? 'Old API Mode Fallback' : 'Old API Config'}) Preparing Old API fetch for section "${tagConfig.title}" (tag: ${oldApiTag}, type: ${oldApiType}, sort: ${oldApiSort})`);
            data = await fetchAndCacheDoubanData(oldApiCacheKey, fetchDoubanData, targetUrl);
        }
        
        try {
            // data is already awaited from fetchAndCacheDoubanData
            if (data && data.subjects && data.subjects.length > 0) {
                if (typeof renderDoubanCardsAsCarousel === 'function') {
                    renderDoubanCardsAsCarousel(data, carouselTrack, tagConfig.type, tagConfig.apiTag);
                } else {
                    console.error('renderDoubanCardsAsCarousel function not found');
                    carouselTrack.innerHTML = `<div class="text-red-400 p-4">UI Error</div>`;
                }
            } else {
                carouselTrack.innerHTML = `<div class="text-gray-400 p-4">${tagConfig.title}: 暂无内容</div>`;
            }
        } catch (error) {
            console.error(`处理豆瓣首页数据失败 (Title: ${tagConfig.title}):`, error);
            carouselTrack.innerHTML = `<div class="text-red-400 p-4">❌ 加载 ${tagConfig.title} 失败</div>`;
        }
    } // End for loop
    
    if (bottomSpinner) { 
        if (window.noMoreHomePageTags) {
            bottomSpinner.innerHTML = '<p class="text-gray-500">已加载全部推荐内容</p>';
        } else {
            bottomSpinner.style.display = 'none';
        }
    }
    if (window.noMoreHomePageTags && !bottomSpinner && recommendationsContainer.querySelector('.home-tag-section')) {
        if (!recommendationsContainer.querySelector('.all-loaded-message')) {
            const endMsg = document.createElement('p');
            endMsg.className = 'text-center text-gray-500 py-8 col-span-full all-loaded-message';
            endMsg.textContent = '已加载全部推荐内容';
            recommendationsContainer.appendChild(endMsg);
        }
    }
    window.isLoadingHomePageItems = false;

    // Check if content is scrollable after loading. If not, and more tags exist, load more.
    // This fixes the issue on large screens where initial content doesn't fill the viewport.
    // Use a timeout to allow the DOM to update before checking the height.
    setTimeout(() => {
        const isScrollable = document.documentElement.scrollHeight > document.documentElement.clientHeight;
        if (!isScrollable && !window.noMoreHomePageTags && !window.isLoadingHomePageItems) {
            console.log("Content is not scrollable, loading next batch of home page tags...");
            loadNextBatchOfHomePageTags();
        }
    }, 100); // 100ms delay should be enough for rendering
}

function initHomePageDoubanContent() {
    const recommendationsContainer = document.getElementById('douban-recommendations-container');
    if (!recommendationsContainer) return;
    recommendationsContainer.innerHTML = ''; 

    if (localStorage.getItem('doubanEnabled') !== 'true') {
        recommendationsContainer.innerHTML = '<p class="text-center text-gray-500 py-8">豆瓣推荐已关闭。请在设置中开启。</p>';
        return;
    }

    window.homePageActiveTags = [];
    const currentMovieOrTvType = window.doubanMovieTvCurrentSwitch === 'movie' ? '电影' : '电视剧';
    const newApiSortMap = { '热度': 'T', '时间': 'R', '评分': 'S' };

    // Chart sections that used top_list API are removed from here.
    // const chartSectionsToAdd = [
    //     { title: '剧情片排行榜', chartGenreName: '剧情', typeForCatView: '剧情' },
    //     { title: '喜剧片排行榜', chartGenreName: '喜剧', typeForCatView: '喜剧' },
    //     { title: '科幻片排行榜', chartGenreName: '科幻', typeForCatView: '科幻' },
    // ];
    // chartSectionsToAdd.forEach(chart => {
    //     window.homePageActiveTags.push({
    //         title: chart.title,
    //         isChart: true,
    //         chartGenreName: chart.chartGenreName,
    //         typeForCatView: chart.typeForCatView
    //     });
    // });

    const extraContentTypes = [
        // For New API: 'tags' can be '综艺', '动画', '纪录片', '短片'.
        // For Old API fallback: typeForCatView helps determine 'movie' or 'tv'.
        // '综艺' is typically TV.
        { title: '热门综艺', typeForCatView: '综艺', apiParams: { tags: '综艺', sort: newApiSortMap['热度'] } },
        
        // '动画' can be movie or TV series.
        { title: '热门动画电影', typeForCatView: '动画', apiParams: { tags: '动画', genres: '动画', /*could add &movie_type=feature if new API supports*/ sort: newApiSortMap['热度'] } }, // Assuming '动画' tag implies movies for New API, or typeForCatView maps to movie for old.
        { title: '热门动画剧集', typeForCatView: '电视剧', apiParams: { tags: '动画', /* genres: '动画', */ sort: newApiSortMap['热度'] } }, // Changed: Use tags: '动画' primarily. If new API returns mixed, client-side filtering might be needed if type field exists in items. Old API fallback uses '日本动画' for TV.

        // '纪录片' can be movie or TV series.
        { title: '高分纪录片电影', typeForCatView: '纪录片', apiParams: { tags: '纪录片', genres: '纪录片', sort: newApiSortMap['评分'] } },
        { title: '高分纪录片剧集', typeForCatView: '电视剧', apiParams: { tags: '电视剧', genres: '纪录片', sort: newApiSortMap['评分'] } },

        // '短片' is typically movie.
        { title: '精选短片', typeForCatView: '短片', apiParams: { tags: '短片', sort: newApiSortMap['评分'] } },
    ];
    extraContentTypes.forEach(ct => {
        let oldApiFallbackTag = ct.apiParams.genres || ct.apiParams.tags || ct.title;
        // For "热门动画剧集", if falling back to old API, "日本动画" might be a better tag than just "动画" for type=tv.
        if (ct.title === '热门动画剧集') {
            oldApiFallbackTag = '日本动画'; 
        }
        homePageActiveTags.push({
            title: ct.title,
            apiParams: { ...ct.apiParams, range: `0,${window.homePageItemsPerTag}`, start: '0' },
            useNewApi: (ct.title === '热门动画剧集' ? false : true), // Force Old API for "热门动画剧集" on homepage
            type: ct.typeForCatView, 
            apiTag: oldApiFallbackTag, // This apiTag is used for the old API fallback
            apiSort: ct.apiParams.sort 
        });
    });

    const genreSections = [
        { title: `科幻${currentMovieOrTvType}`, typeForCatView: currentMovieOrTvType, apiParams: { tags: currentMovieOrTvType, genres: '科幻', sort: newApiSortMap['评分'] } },
        { title: `喜剧${currentMovieOrTvType}`, typeForCatView: currentMovieOrTvType, apiParams: { tags: currentMovieOrTvType, genres: '喜剧', sort: newApiSortMap['评分'] } },
        { title: `动作${currentMovieOrTvType}`, typeForCatView: currentMovieOrTvType, apiParams: { tags: currentMovieOrTvType, genres: '动作', sort: newApiSortMap['热度'] } },
        { title: '美国科幻电影', typeForCatView: '电影', apiParams: { tags: '电影', genres: '科幻', countries: '美国', sort: newApiSortMap['评分'] } },
    ];
    genreSections.forEach(gs => {
        homePageActiveTags.push({
            title: gs.title,
            apiParams: { ...gs.apiParams, range: `0,${window.homePageItemsPerTag}`, start: '0' }, // New API uses range
            useNewApi: true,
            type: gs.typeForCatView,
            apiTag: gs.apiParams.genres || gs.apiParams.countries || gs.title, 
            apiSort: gs.apiParams.sort
        });
    });
    
    // Old API sections (movieChartNames, tvChartNames)
    // These are already designed for the old API, so they don't need `useNewApi: true` or `apiParams`
    const charts = window.doubanMovieTvCurrentSwitch === 'movie' ? movieChartNames : tvChartNames;
    Object.keys(charts).forEach(chartName => {
        if (!window.homePageActiveTags.some(tag => tag.title === chartName)) { 
            window.homePageActiveTags.push({
                title: chartName,
                apiTag: charts[chartName].tag, // Used by old API path
                apiSort: charts[chartName].sort, // Used by old API path
                type: window.doubanMovieTvCurrentSwitch, // Used by old API path
                useNewApi: false // Explicitly use old API structure
            });
        }
    });

    const currentBaseTags = window.doubanMovieTvCurrentSwitch === 'movie' ? window.movieTags : window.tvTags;
    currentBaseTags.forEach(tag => {
        if (!window.homePageActiveTags.some(t => t.title === tag || (t.apiTag === tag && t.type === window.doubanMovieTvCurrentSwitch && !t.useNewApi))) {
            window.homePageActiveTags.push({
                title: tag,
                apiTag: tag,
                apiSort: 'recommend', 
                type: window.doubanMovieTvCurrentSwitch,
                useNewApi: false
            });
        }
    });
    
    window.homePageActiveTags.push({ title: '热门推荐', apiTag: '热门', apiSort: 'recommend', type: window.doubanMovieTvCurrentSwitch, useNewApi: false });
    window.homePageActiveTags.push({ title: '热门推荐', apiTag: '热门', apiSort: 'recommend', type: window.doubanMovieTvCurrentSwitch, useNewApi: false });
    window.homePageActiveTags.push({ title: '最新上线', apiTag: '最新', apiSort: 'time', type: window.doubanMovieTvCurrentSwitch, useNewApi: false });
    
    // Helper function to generate a unique key for a tag's data source
    function getTagSourceKey(tagInfo) {
        if (tagInfo.isChart && tagInfo.chartGenreName) {
            return `chart_${tagInfo.chartGenreName}`;
        } else if (tagInfo.useNewApi && tagInfo.apiParams) {
            // Sort apiParams keys for consistent stringification
            const sortedParams = {};
            Object.keys(tagInfo.apiParams).sort().forEach(key => {
                // Exclude 'range' and 'start' from the key as they are for pagination, not source identity
                if (key !== 'range' && key !== 'start') {
                    sortedParams[key] = tagInfo.apiParams[key];
                }
            });
            return `new_${JSON.stringify(sortedParams)}`;
        } else if (!tagInfo.useNewApi && tagInfo.apiTag && tagInfo.apiSort && tagInfo.type) {
            return `old_${tagInfo.type}_${tagInfo.apiTag}_${tagInfo.apiSort}`;
        }
        // Fallback key based on title if other properties are missing, though this is less ideal for source uniqueness
        console.warn('[Douban Home] Tag missing key properties for source identification:', tagInfo.title, tagInfo);
        return `title_${tagInfo.title}`; 
    }

    const finalHomePageActiveTags = [];
    const seenSourceKeys = new Map(); // Stores sourceKey -> index in finalHomePageActiveTags

    for (const tagInfo of window.homePageActiveTags) {
        const sourceKey = getTagSourceKey(tagInfo);
        if (!seenSourceKeys.has(sourceKey)) {
            finalHomePageActiveTags.push(tagInfo);
            seenSourceKeys.set(sourceKey, { index: finalHomePageActiveTags.length - 1, title: tagInfo.title, useNewApi: tagInfo.useNewApi });
            console.log(`[Douban Home Dedupe] Adding: "${tagInfo.title}" (Key: ${sourceKey})`);
        } else {
            const existingEntry = seenSourceKeys.get(sourceKey);
            const existingTag = finalHomePageActiveTags[existingEntry.index];
            console.log(`[Douban Home Dedupe] Duplicate sourceKey "${sourceKey}" for new tag "${tagInfo.title}". Existing: "${existingTag.title}".`);
            // Preference logic:
            // 1. If new tag uses New API and old one doesn't, replace.
            // 2. If both use same API type, generally keep the first one unless a more specific title is preferred (e.g. "正在热映" vs "热门推荐")
            //    For now, we'll keep the existing one if API types are the same, unless the new one is explicitly preferred.
            //    The "热门推荐" vs "正在热映" case: "正在热映" is from movieChartNames, "热门推荐" is added manually. Both are old API.
            //    If '正在热映' (key: old_movie_热门_recommend) comes first, and then '热门推荐' (same key) comes, '热门推荐' will be skipped.
            if (tagInfo.useNewApi && !existingTag.useNewApi) {
                console.log(`[Douban Home Dedupe] Replacing "${existingTag.title}" with "${tagInfo.title}" (New API preferred).`);
                finalHomePageActiveTags[existingEntry.index] = tagInfo;
                seenSourceKeys.set(sourceKey, { index: existingEntry.index, title: tagInfo.title, useNewApi: tagInfo.useNewApi });
            } else if (!tagInfo.useNewApi && existingTag.useNewApi) {
                 console.log(`[Douban Home Dedupe] Keeping "${existingTag.title}" (New API preferred over "${tagInfo.title}").`);
            } else {
                // Both new or both old. Keep the one with a more specific or generally preferred title if possible.
                // This part can be tricky. For "正在热映" vs "热门推荐", they have the same old API key.
                // We want to ensure "正在热映" is kept if it's for movies.
                // The current loop order might matter. Let's log which one is kept.
                // If `movieChartNames` are processed before the manually added "热门推荐", "正在热映" would be `existingTag`.
                // If "热门推荐" (title) is less desirable than `existingTag.title` for the same key, we keep `existingTag`.
                if (tagInfo.title === '热门推荐' && existingTag.title !== '热门推荐') { // Example: if '正在热映' was already added for the same key
                    console.log(`[Douban Home Dedupe] Skipping generic "热门推荐" as "${existingTag.title}" already covers key "${sourceKey}".`);
                } else if (existingTag.title === '热门推荐' && tagInfo.title !== '热门推荐') { // Example: if "热门推荐" was first, and now "正在热映" comes for same key
                     console.log(`[Douban Home Dedupe] Replacing generic "${existingTag.title}" with more specific "${tagInfo.title}" for key "${sourceKey}".`);
                     finalHomePageActiveTags[existingEntry.index] = tagInfo;
                     seenSourceKeys.set(sourceKey, { index: existingEntry.index, title: tagInfo.title, useNewApi: tagInfo.useNewApi });
                } else {
                    console.log(`[Douban Home Dedupe] Keeping existing "${existingTag.title}" over "${tagInfo.title}" for key "${sourceKey}" (same API type, no strong preference or first one encountered).`);
                }
            }
        }
    }
    window.homePageActiveTags = finalHomePageActiveTags;
    console.log('[Douban Home] Final unique active tags count:', window.homePageActiveTags.length);
    window.homePageActiveTags.forEach(tag => console.log(`  - ${tag.title} (useNewApi: ${tag.useNewApi}, isChart: ${!!tag.isChart}, Key: ${getTagSourceKey(tag)})`));


    // Randomize home page tags order on first load of the session
    const RUSTYTV_SHUFFLED_TAG_ORDER_KEY = 'rustyTvShuffledHomePageTagOrder';
    try {
        const storedOrderJson = sessionStorage.getItem(RUSTYTV_SHUFFLED_TAG_ORDER_KEY);
        if (storedOrderJson && window.homePageActiveTags.length > 0) { // Only apply if there are tags and stored order
            const storedTitles = JSON.parse(storedOrderJson);
            const currentTagsMap = new Map(window.homePageActiveTags.map(tag => [tag.title, tag]));
            const reorderedTags = [];
            const presentTagsFromStoredOrder = new Set();

            // Add tags based on stored order
            for (const title of storedTitles) {
                if (currentTagsMap.has(title)) {
                    const tag = currentTagsMap.get(title);
                    reorderedTags.push(tag);
                    presentTagsFromStoredOrder.add(tag.title);
                }
            }

            // Add any new tags from current code that weren't in the stored order
            // These will be appended at the end, maintaining their relative order from finalHomePageActiveTags
            for (const tag of window.homePageActiveTags) {
                if (!presentTagsFromStoredOrder.has(tag.title)) {
                    reorderedTags.push(tag);
                }
            }
            
            window.homePageActiveTags = reorderedTags;
            console.log('[Douban Home] Applied stored tag order.');

        } else if (window.homePageActiveTags.length > 0) { // No stored order, or tags list was empty before
            shuffleArray(window.homePageActiveTags);
            const titlesToStore = window.homePageActiveTags.map(tag => tag.title);
            sessionStorage.setItem(RUSTYTV_SHUFFLED_TAG_ORDER_KEY, JSON.stringify(titlesToStore));
            console.log('[Douban Home] Shuffled tags and stored order for this session.');
        }
        // If window.homePageActiveTags is empty, do nothing regarding shuffle/storage.
    } catch (e) {
        console.error('[Douban Home] Error handling shuffled tag order:', e);
        // Fallback: shuffle if there was an error reading/parsing, but don't save.
        if (window.homePageActiveTags.length > 0) {
            shuffleArray(window.homePageActiveTags);
            console.warn('[Douban Home] Shuffled tags due to error in stored order processing; new order not saved for this session.');
        }
    }

    window.homePageCurrentTagIndex = 0;
    window.noMoreHomePageTags = false;
    window.isLoadingHomePageItems = false;
    
    let existingBottomSpinner = document.getElementById('home-page-bottom-spinner');
    if (existingBottomSpinner) existingBottomSpinner.remove();
    let existingAllLoadedMessage = recommendationsContainer.querySelector('.all-loaded-message');
    if (existingAllLoadedMessage) existingAllLoadedMessage.remove();


    if (window.homePageActiveTags.length === 0) {
        recommendationsContainer.innerHTML = '<p class="text-center text-gray-500 py-8">暂无可推荐的豆瓣内容分类。</p>';
        return;
    }
    loadNextBatchOfHomePageTags(); 
}


function initDouban(options = {}) { 
    console.log('[DoubanInit] Initializing Douban with options:', options);
    
    const initialState = options.initialState || null;
    const isFirstLoadOrForceMain = !sessionStorage.getItem('doubanState') && !initialState || options.forceMainView;

    if (initialState && !options.forceMainView) { // 只有在有 initialState 且不是 forceMainView 时才使用它
        window.doubanMovieTvCurrentSwitch = initialState.doubanType || 'movie';
        window.doubanCurrentTag = initialState.selectedTag || '热门';
    } else {
        const storedDoubanStateStr = sessionStorage.getItem('doubanState');
        if (storedDoubanStateStr && !options.forceMainView) { // 只有在有 storedState 且不是 forceMainView 时才使用它
            try {
                const storedState = JSON.parse(storedDoubanStateStr);
                window.doubanMovieTvCurrentSwitch = storedState.doubanType || 'movie';
                window.doubanCurrentTag = storedState.selectedTag || '热门';
            } catch (e) { 
                window.doubanMovieTvCurrentSwitch = 'movie';
                window.doubanCurrentTag = isFirstLoadOrForceMain ? '__HOME__' : '热门'; // 默认或强制首页时用特殊标记
            }
        } else { // 首次加载，或强制主页，或没有有效 storedState
            window.doubanMovieTvCurrentSwitch = 'movie'; // 保持这个默认，因为 initHomePageDoubanContent 依赖它
            window.doubanCurrentTag = isFirstLoadOrForceMain ? '__HOME__' : '热门'; // 默认或强制首页时用特殊标记
        }
    }

    const doubanToggle = document.getElementById('doubanToggle');
    if (doubanToggle) {
        const isEnabled = localStorage.getItem('doubanEnabled') === 'true';
        doubanToggle.checked = isEnabled;
        const toggleBg = doubanToggle.nextElementSibling;
        const toggleDot = toggleBg ? toggleBg.nextElementSibling : null;
        if (toggleBg && toggleDot) {
            if (isEnabled) { 
                toggleBg.classList.add('bg-pink-600'); 
                toggleDot.classList.add('translate-x-6'); 
            } else {
                toggleBg.classList.remove('bg-pink-600');
                toggleDot.classList.remove('translate-x-6');
            }
            doubanToggle.addEventListener('change', function(e) {
                const isChecked = e.target.checked;
                localStorage.setItem('doubanEnabled', isChecked);
                if (isChecked) {
                    toggleBg.classList.add('bg-pink-600');
                    toggleDot.classList.add('translate-x-6');
                } else {
                    toggleBg.classList.remove('bg-pink-600');
                    toggleDot.classList.remove('translate-x-6');
                }
                sessionStorage.removeItem('homePageState');
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && key.startsWith('douban_api_cache_')) {
                        sessionStorage.removeItem(key);
                        i--; 
                    }
                }
                initHomePageDoubanContent(); 
            });
        }
    }

    loadUserTags(); 

    const newApiSortMap = { '热度': 'T', '时间': 'R', '评分': 'S' };
    const contentTypesForTags = ['电影', '电视剧', '综艺', '动画', '纪录片', '短片'];
    const commonGenres = ['喜剧', '爱情', '动作', '科幻', '悬疑', '犯罪', '惊悚', '恐怖']; 
    const commonCountries = ['中国大陆', '美国', '香港', '日本', '韩国', '英国', '法国']; 

    window.homepageTopNavTags = [];

    contentTypesForTags.forEach(ct => {
        window.homepageTopNavTags.push({ title: ct, typeForCatView: ct, useNewApi: true, apiParams: { tags: ct, sort: newApiSortMap['评分'] } });
    });

    contentTypesForTags.forEach(ct => {
        if (['综艺', '纪录片', '短片'].includes(ct)) return; 
        commonGenres.forEach(genre => {
            if (ct === '动画' && genre === '动画') return;
            window.homepageTopNavTags.push({ title: `${genre}${ct}`, typeForCatView: ct, useNewApi: true, apiParams: { tags: ct, genres: genre, sort: newApiSortMap['热度'] } });
        });
    });

    contentTypesForTags.forEach(ct => {
         if (['综艺', '纪录片', '短片'].includes(ct)) return; 
        commonCountries.forEach(country => {
            window.homepageTopNavTags.push({ title: `${country}${ct}`, typeForCatView: ct, useNewApi: true, apiParams: { tags: ct, countries: country, sort: newApiSortMap['热度'] } });
        });
    });
    
    window.homepageTopNavTags.push({ title: '豆瓣高分电影', typeForCatView: '电影', useNewApi: true, apiParams: { tags: '电影', sort: newApiSortMap['评分'] } });
    window.homepageTopNavTags.push({ title: '近期热门电影', typeForCatView: '电影', useNewApi: true, apiParams: { tags: '电影', sort: newApiSortMap['热度'] } });
    window.homepageTopNavTags.push({ title: '最新电影', typeForCatView: '电影', useNewApi: true, apiParams: { tags: '电影', sort: newApiSortMap['时间'] } });
    window.homepageTopNavTags.push({ title: '热门美剧', typeForCatView: '电视剧', useNewApi: true, apiParams: { tags: '电视剧', countries: '美国', sort: newApiSortMap['热度'] } });
    window.homepageTopNavTags.push({ title: '热门日剧', typeForCatView: '电视剧', useNewApi: true, apiParams: { tags: '电视剧', countries: '日本', sort: newApiSortMap['热度'] } });
    window.homepageTopNavTags.push({ title: '高分日本动画', typeForCatView: '动画', useNewApi: true, apiParams: { tags: '动画', countries: '日本', sort: newApiSortMap['评分'] } });

    Object.keys(movieChartNames).forEach(chartName => {
        window.homepageTopNavTags.push({
            title: chartName,
            typeForCatView: 'movie', 
            useNewApi: false,
            apiTag: movieChartNames[chartName].tag,
            apiSort: movieChartNames[chartName].sort
        });
    });
    Object.keys(tvChartNames).forEach(chartName => {
        window.homepageTopNavTags.push({
            title: chartName,
            typeForCatView: 'tv', 
            useNewApi: false,
            apiTag: tvChartNames[chartName].tag,
            apiSort: tvChartNames[chartName].sort
        });
    });

    const generalMovieTags = ['经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '治愈']; 
    generalMovieTags.forEach(tag => {
        let apiParams = { tags: '电影', sort: newApiSortMap['热度'] }; 
        if (['豆瓣高分', '经典', '冷门佳片'].includes(tag)) apiParams.sort = newApiSortMap['评分'];
        
        if (['华语', '欧美', '韩国', '日本'].includes(tag)) {
             let countryName = tag;
             if (tag === '华语') countryName = '中国大陆'; 
             if (tag === '欧美') countryName = '美国'; 
             apiParams.countries = countryName;
        } else {
             apiParams.genres = tag; 
        }
        if (!['热门', '最新', ...contentTypesForTags].includes(tag)) {
             window.homepageTopNavTags.push({ title: `${tag}电影`, typeForCatView: '电影', useNewApi: true, apiParams });
        }
    });
     const generalTvTags = ['经典', '国产剧', '港剧']; 
     generalTvTags.forEach(tag => {
        let apiParams = { tags: '电视剧', sort: newApiSortMap['热度'] };
        if (tag === '经典') apiParams.sort = newApiSortMap['评分'];

        if (tag === '国产剧') apiParams.countries = '中国大陆';
        else if (tag === '港剧') apiParams.countries = '香港';
        else apiParams.genres = tag;

        if (!['热门', '最新', ...contentTypesForTags].includes(tag)) {
            window.homepageTopNavTags.push({ title: `${tag}`, typeForCatView: '电视剧', useNewApi: true, apiParams });
        }
    });

    const uniqueHomepageNavTags = [];
    const seenNavTitles = new Set();
    for (const tag of window.homepageTopNavTags) {
        if (!seenNavTitles.has(tag.title)) {
            uniqueHomepageNavTags.push(tag);
            seenNavTitles.add(tag.title);
        }
    }
    window.homepageTopNavTags = uniqueHomepageNavTags;


    if (typeof renderDoubanTags === 'function') {
        // 传递 isFirstLoadOrForceMain 给 renderDoubanTags
        renderDoubanTags(window.homepageTopNavTags, isFirstLoadOrForceMain); 
    } else {
        console.error('renderDoubanTags not found in initDouban');
    }
    
    if (isFirstLoadOrForceMain || document.getElementById('page-home').classList.contains('hidden') || !document.getElementById('page-category-view')?.classList.contains('hidden')) {
        initHomePageDoubanContent(); 
    }
    
    let tagToSave = isFirstLoadOrForceMain ? '__HOME__' : window.doubanCurrentTag;
    sessionStorage.setItem('doubanState', JSON.stringify({ doubanType: window.doubanMovieTvCurrentSwitch, selectedTag: tagToSave }));
}

function navigateToCategoryView(categoryName, type, sourceConfig = null) {
    document.querySelectorAll('.page-content').forEach(p => {
        if (p.id !== 'page-category-view') { 
            p.classList.add('hidden');
        }
    });

    const categoryViewPage = document.getElementById('page-category-view');
    if (categoryViewPage) {
        categoryViewPage.classList.remove('hidden');
    } else {
        console.error('page-category-view not found!');
        return;
    }
    
    document.querySelectorAll('#bottomNav .nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === 'home') {
            item.classList.add('active');
        }
    });
    sessionStorage.setItem('activeTab', 'home'); 
    sessionStorage.setItem('previousTab', 'home'); 

    window.currentCategoryViewTag = categoryName;
    window.currentCategoryViewType = type;
    window.currentCategorySourceConfig = sourceConfig; 

    window.currentCategoryPageStart = 0;
    window.isLoadingCategoryItems = false;
    window.noMoreCategoryItems = false;

    const titleEl = document.getElementById('category-view-title');
    if (titleEl) titleEl.textContent = categoryName.replace(/</g, '<').replace(/>/g, '>');
    
    const gridEl = document.getElementById('category-items-grid');
    if (gridEl) gridEl.innerHTML = ''; 

    loadMoreCategoryItems(true); 

    window.scrollTo(0, 0); 
}

async function loadMoreCategoryItems(isInitialLoad = false) {
    const categoryViewPage = document.getElementById('page-category-view');
    const sourceTagConfig = window.currentCategorySourceConfig; 

    if (!categoryViewPage || categoryViewPage.classList.contains('hidden')) {
        window.isLoadingCategoryItems = false;
        return;
    }
    if (window.isLoadingCategoryItems || window.noMoreCategoryItems) return;

    window.isLoadingCategoryItems = true;
    const spinner = document.getElementById('category-loading-spinner');
    if (spinner) spinner.classList.remove('hidden');

    let url;
    let usingNewAPIForCategory = false;
    const useOnlyOldApiCategory = localStorage.getItem('doubanApiMode') !== 'true'; // Default to old API


    if (!useOnlyOldApiCategory && sourceTagConfig && sourceTagConfig.useNewApi && sourceTagConfig.apiParams) {
        const paramsForNewApi = { ...sourceTagConfig.apiParams }; 
        paramsForNewApi.start = window.currentCategoryPageStart.toString();
        paramsForNewApi.range = '0,10'; 
        usingNewAPIForCategory = true; 
    } else { 
        // Use Old API logic for category view
        let apiTagForOld;
        if (sourceTagConfig) {
            // If coming from a homepage section, use its defined apiTag if available, otherwise title.
            // The apiTag in sourceConfig should be the actual tag name (e.g., "综艺", "动画")
            apiTagForOld = sourceTagConfig.apiTag || sourceTagConfig.title;
        } else {
            // If navigating directly to category view (e.g. from top nav), currentCategoryViewTag is the title/tag.
            apiTagForOld = window.currentCategoryViewTag;
        }

        let apiSortForOld = 'recommend'; 
        let typeForOldApi = sourceTagConfig ? sourceTagConfig.typeForCatView : window.currentCategoryViewType;

        // Ensure typeForOldApi is 'movie' or 'tv'
        if (typeForOldApi !== 'movie' && typeForOldApi !== 'tv') {
             if (['动画', '短片', '纪录片'].includes(typeForOldApi)) typeForOldApi = 'movie';
             else if (typeForOldApi === '综艺') typeForOldApi = 'tv';
             else typeForOldApi = 'movie'; // Default for other unknown types
        }
        
        // Determine sort order for old API
        if (sourceTagConfig) {
            if (sourceTagConfig.useNewApi && sourceTagConfig.apiParams && sourceTagConfig.apiParams.sort) {
                const sortMap = { 'T': 'recommend', 'R': 'time', 'S': 'rank' };
                apiSortForOld = sortMap[sourceTagConfig.apiParams.sort] || 'recommend';
            } else if (!sourceTagConfig.useNewApi && sourceTagConfig.apiSort) {
                apiSortForOld = sourceTagConfig.apiSort;
            }
        }
        // If no sourceConfig or sort not derived, it defaults to 'recommend'
        
        const doubanApiBase = 'https://movie.douban.com';
        url = `${doubanApiBase}/j/search_subjects?type=${typeForOldApi}&tag=${encodeURIComponent(apiTagForOld)}&sort=${apiSortForOld}&page_limit=${window.categoryItemsPerPage}&page_start=${window.currentCategoryPageStart}`;
        console.log(`[CategoryView] (${useOnlyOldApiCategory ? 'Old API Mode' : 'Old API Config'}) Fetching: ${url}`);
    }
    
    try {
        let data;
        if (usingNewAPIForCategory && !useOnlyOldApiCategory) { 
            const fetchParams = { ...sourceTagConfig.apiParams }; 
            fetchParams.start = window.currentCategoryPageStart.toString();
            fetchParams.range = '0,10'; 
            console.log(`[CategoryView] (New API Preferred) Fetching with params:`, fetchParams);
            data = await fetchNewDoubanSearch(fetchParams);
        } else {
            data = await fetchDoubanData(url); 
        }
        
        if (!data || !data.subjects || !Array.isArray(data.subjects)) {
            console.error("Invalid data structure for category items:", data);
            window.noMoreCategoryItems = true;
            if (spinner) spinner.innerHTML = isInitialLoad ? '<p class="text-gray-500">此分类下暂无内容</p>' : '<p class="text-gray-500">没有更多内容了</p>';
            window.isLoadingCategoryItems = false;
            return;
        }

        if (typeof renderCategoryGridCards === 'function') { 
            renderCategoryGridCards(data, document.getElementById('category-items-grid'));
        } else {
            console.error('renderCategoryGridCards function not found');
        }

        if (data.subjects.length < window.categoryItemsPerPage) {
            window.noMoreCategoryItems = true;
            if (spinner) spinner.innerHTML = '<p class="text-gray-500">没有更多内容了</p>';
        } else if (data.subjects.length === 0 && isInitialLoad) { 
             window.noMoreCategoryItems = true;
             if (spinner) spinner.innerHTML = '<p class="text-gray-500">此分类下暂无内容</p>';
        }
        window.currentCategoryPageStart += data.subjects.length; 
    } catch (error) {
        console.error("Error loading category items:", error);
        if (spinner) spinner.innerHTML = '<p class="text-red-500">加载失败，请稍后重试</p>';
        window.noMoreCategoryItems = true; 
    } finally {
        window.isLoadingCategoryItems = false;
        if (window.noMoreCategoryItems && spinner && spinner.innerHTML.includes('加载更多')) {
            // No change needed if already showing "no more"
        } else if (!window.noMoreCategoryItems && spinner) {
             spinner.classList.add('hidden'); 
        }
    }
}

function handleScroll() {
    // Use documentElement for better compatibility across browsers/platforms
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;

    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 300;

    if (!isNearBottom) return;

    const categoryViewPage = document.getElementById('page-category-view');
    const homePage = document.getElementById('page-home');
    const filterPage = document.getElementById('page-filter');

    if (categoryViewPage && !categoryViewPage.classList.contains('hidden')) {
        loadMoreCategoryItems(false);
    } else if (homePage && !homePage.classList.contains('hidden') && localStorage.getItem('doubanEnabled') === 'true') {
        if (!window.isLoadingHomePageItems && !window.noMoreHomePageTags) {
            const recommendationsContainer = document.getElementById('douban-recommendations-container');
            if (recommendationsContainer && recommendationsContainer.offsetParent !== null) {
                loadNextBatchOfHomePageTags();
            }
        }
    } else if (filterPage && !filterPage.classList.contains('hidden')) {
        if (typeof handleSearchPageScroll === 'function') {
            handleSearchPageScroll();
        }
    }
}

// Listen on both window and document to maximize compatibility
window.addEventListener('scroll', handleScroll, { passive: true });
document.addEventListener('scroll', handleScroll, { passive: true });

function showTagManageModal() { 
    console.warn("showTagManageModal called - UI for this needs to be ensured or created.");
}
function addTag(tag) { 
    console.warn("addTag called - UI for this needs to be ensured or created.");
}
function deleteTag(tag) { 
    console.warn("deleteTag called - UI for this needs to be ensured or created.");
}
function resetTagsToDefault() { 
    console.warn("resetTagsToDefault called - UI for this needs to be ensured or created.");
}
