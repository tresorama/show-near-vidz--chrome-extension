/* eslint-disable no-inner-declarations */
// This script is launched at every pag load
// on "manifest.content_scripts.matches" allowed websites.

console.log('Hello');

//
(function () {
  'use strict';

  // ==========================================
  // generic utils
  // ==========================================

  const sleep = (timeInMs) => new Promise((res) => setTimeout(res, timeInMs));

  /** Scroll the page to a dom node
   * @type {(element:HTMLElement) => void}
   * */
  function scrollPageToElement(element) {
    const elementRect = element.getBoundingClientRect();
    const absoluteElementTop = elementRect.top + window.pageYOffset;
    const middle = absoluteElementTop - window.innerHeight / 2;
    window.scrollTo({
      left: 0,
      top: middle,
      behavior: 'smooth'
    });
  }

  /** Find an ancestor (parent, grnadparent, ...)
   * that matches a predicate funciton
   * @type {(element:HTMLElement, predicate: (node:HTMLElement) => boolean) => HTMLElement | null}
   * */
  function findParentByPredicate(element, predicate) {
    let currentNode = element;
    const fallbackIfNotFound = null;
    while (predicate(currentNode) === false) {
      currentNode = currentNode.parentElement;
      if (currentNode === window.document.documentElement) {
        return fallbackIfNotFound;
      }
    }
    return currentNode;
  }

  /** Scroll the page to the dottom
   * @type {() => void}
   * */
  const scrollToBottomOfPage = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      left: 0,
      behavior: 'smooth'
    });
  };

  // ==========================================
  // specific utils
  // ==========================================

  const logger = {
    isEnabled: true,
    log(...args) {
      if (!this.isEnabled) return;
      console.log(`Find Near Vid - `, ...args);
    },
    throw(...args) {
      throw new Error(`Find near Vid - Erroor - `, ...args);
    }
  };
  const storage = {
    key: 'go-to-nearest-video-of-same-channel-data',
    get() {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw);
    },
    save(data) {
      window.localStorage.setItem(this.key, JSON.stringify(data));
    },
    destroy() {
      window.localStorage.removeItem(this.key);
    }
  };

  /** inject the "Show Near Vidz" button into the page
   * @type {() => HTMLElement[]}
   */
  function injectButtonsIntoDOM() {
    // routine
    const injectAndReturns = () => {
      const parents = document.querySelectorAll('#top-level-buttons-computed');
      [...parents].forEach((parent) =>
        parent.insertAdjacentHTML(
          'afterbegin',
          `<button
                 id="go-to-nearest-video-of-same-channel"
                 style="margin-right: 8px"
                 class="yt-spec-button-shape-next yt-spec-button-shape-next--icon-leading yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-m yt-spec-button-shape-next--tonal"
               >
               Show Near Vidz
               </button>`
        )
      );
      // try to get it
      const nodes = document.querySelectorAll(
        '#go-to-nearest-video-of-same-channel'
      );
      return [...nodes];
    };

    // if fails retry some times...
    let attemptsLeft = 5;
    /** @type {HTMLElement[]} */
    let buttons = [];
    while (!buttons.length && attemptsLeft > 0) {
      buttons = injectAndReturns();
      attemptsLeft--;
    }
    return buttons;
  }

  /** Trigger some UI signal that ensure
   * user notices the target video card
   * @type {(linkNode: HTMLElement) => void}
   * */
  function makeUserNoticeTheVideo(linkNode) {
    const gridItem = findParentByPredicate(linkNode, (node) => {
      console.log(node.tagName);
      return node.tagName.toLowerCase() === 'ytd-rich-item-renderer';
    });
    if (!gridItem) return;
    document.body.insertAdjacentHTML(
      'beforeend',
      `
          <style>
          @keyframes animation-flashy {
                       from {
                         opacity: 0;
                         transform: scale(0.5) rotate(-3deg);
                       }
                       to {
                         opacity: 1;
                         transform: none;
                       }
                     }
                     .animation-flashy {
                       animation: animation-flashy 500ms infinite;
                     }
           </style>
          `
    );
    gridItem.classList.add('animation-flashy');
    setTimeout(() => gridItem.classList.remove('animation-flashy'), 5000);
  }
  /**
   * This function must be launched from a "single" video page
   * It returns the youtube-id of the video.
   * @type {() => string | null}
   */
  function getCurrentVideoId() {
    try {
      const value = document
        .querySelector('[itemprop="identifier"]')
        .getAttribute('content');
      if (value) return value;
    } catch (err) {
      /*not found*/
    }

    try {
      const value = document
        .querySelector('meta[itemprop="videoId"]')
        .getAttribute('content');
      if (value) return value;
    } catch (err) {
      /*not found*/
    }

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const value = urlParams.get('v');
      if (value) return value;
    } catch (err) {
      /*not found*/
    }

    try {
      // ytInitialData is injected by youtube into global window, so disable eslint error
      // eslint-disable-next-line no-undef
      const value = ytInitialData.currentVideoEndpoint.watchEndpoint.videoId;
      if (value) return value;
    } catch (err) {
      /*not found*/
    }

    return null;
  }
  /**
   * This function must be launched from a "single" video page
   * It returns the url Youtube channel of video's author .
   * @type {() => string | null}
   */
  function getCurrentVideoAuthorUrl() {
    try {
      let value = document
        .querySelector('[itemprop="author"] link[itemprop="url"]')
        .getAttribute('href');
      if (value) return value;
    } catch (err) {
      /*not found*/
    }

    return null;
  }

  // ==========================================
  // run!
  // ==========================================

  setTimeout(runScript, 2000);
  async function runScript() {
    // Your code here...
    logger.log('Start');
    logger.log('path', window.location.pathname);

    // if its "video_page", save the current video id and redirect to "author videos page"
    if (window.location.pathname.split('/')[1] === 'watch') {
      logger.log("We are in 'Video Page'");

      // add a button on video page
      logger.log('Injecting button into dom');
      const buttons = injectButtonsIntoDOM();
      if (!buttons.length) logger.throw('Impossible to inject button into DOM');

      // on click of button run "redirect_to_videos_at_this_point()"
      buttons.forEach((button) =>
        button.addEventListener('click', (e) => {
          logger.log('Obtaining video info...');

          //     get curerrent video identifier
          const current_video_id = getCurrentVideoId();
          const current_video_author_url = getCurrentVideoAuthorUrl();
          logger.log('current_video_id', current_video_id);
          logger.log('current_video_author_url', current_video_author_url);
          if (!current_video_id) logger.throw('No video id found!');
          if (!current_video_author_url)
            logger.throw('No video author url found!');

          //     save to local storage the id of the destination videos
          logger.log('Saving video info to storage...');
          storage.save({
            video_id: current_video_id,
            author_url: current_video_author_url
          });
          //     get url of page where there are all the video from the same channel
          //     redirect to that page
          logger.log('Redirecting to videos list page...');
          window.location.href = `${current_video_author_url}/videos`;
        })
      );
    }

    // if is "author videos page" scroll to video card
    if (window.location.pathname.endsWith('/videos')) {
      logger.log("We are in 'Channel Videos List Page'");

      // extract video_id
      logger.log('Extracting video info...');
      const { video_id } = storage.get() || {};
      logger.log('video id', video_id);
      if (!video_id) logger.throw('No video info available in storage !');

      // find the video in the grid and scroll to it
      //         because videos are fetched while user scroll the page (aka load more)
      //         the target video could not be present in the starting items
      //         so simulate user scroll to bottom until you find the video item
      let lastPageHeight = 0;
      setTimeout(searchVideo, 200);
      async function searchVideo() {
        // routines
        const getPageHeight = () =>
          document.getElementsByTagName('ytd-app')[0].clientHeight;
        const getVideoItemFromPage = () =>
          document.querySelector(`a[href*="${video_id}"]`);

        // scroll to bottom so youtube loads more videos
        logger.log('Scrolling to bottom ...');
        scrollToBottomOfPage();

        // get page height to check if scroll is arrived to the end
        await sleep(1000);
        const pageHeight = getPageHeight();
        logger.log('pageHeight', pageHeight);

        if (pageHeight === lastPageHeight) {
          storage.destroy();
          logger.throw('Page is already scrolled to end. No video is found');
        }
        lastPageHeight = pageHeight;

        // try to find video item
        logger.log('Searching video in the list ...');
        const element = getVideoItemFromPage();
        if (!element) {
          logger.log('Video not found..');
          setTimeout(searchVideo, 200);
          return;
        }

        // we have found item.
        // stop scrolling and let user understand which one is in the grid
        logger.log('Found video in the list !!');
        setTimeout(() => {
          scrollPageToElement(element);
          makeUserNoticeTheVideo(element);
        }, 2000);

        // clear storage
        storage.destroy();
      }
    }
  }
})();
