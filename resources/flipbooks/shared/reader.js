/**
 * Flipbook Utilities Module
 * Contains general-purpose helper functions like debounce for performance optimization.
 */
/**
 * Utility: Debounce
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
/**
 * Utility: isZoomed
 * Returns true if the flipbook is currently zoomed in.
 */
function isZoomed() {
    return typeof zoom !== 'undefined' && zoom > 1;
}

/**
 * Utility: getDistance
 * Calculates Euclidean distance between two points.
 */
function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Utility: resetZoomState
 * Resets zoom and pan state to 1x and updates UI.
 */
function resetZoomState() {
    zoom = 1;
    panX = 0;
    panY = 0;

    const slider = document.getElementById('zoom-slider');
    if (slider) slider.value = 1;

    const zoomText = document.getElementById('zoom-level');
    if (zoomText) zoomText.textContent = '1x';

    if (typeof updateTransform === 'function') {
        updateTransform();
    }
}

/**
 * Utility: handleZoomNavigation
 * Resets zoom before performing a navigation action if zoomed in.
 * @param {Function} navigateCallback - The navigation action to perform
 */
function handleZoomNavigation(navigateCallback) {
    if (isZoomed()) {
        resetZoomState();
        // Small delay to allow zoom-out animation to start
        setTimeout(navigateCallback, 150);
    } else {
        navigateCallback();
    }
}

/**
 * Flipbook State Module
 * Central repository for the flipbook's reactive state (page numbers, zoom levels, sizes, etc.).
 */
// Global state
let zoom = 1;
window.currentZoom = 1;
let isPanning = false;
let startX = 0, startY = 0;
let panX = 0, panY = 0;
const ZOOM_RESET_TOLERANCE = 0.01;
let BOOK_WIDTH_AT_1X = 0;
let BOOK_HEIGHT_AT_1X = 0;
let pageFlip = null;
let isUpdatingFromHash = false; // Prevent infinite loops between hash and flip events

/**
 * Flipbook Navigation Module
 * Manages URL hash-based navigation to allow sharing specific pages and history support.
 */
/**
 * URL Helper Functions for Page Navigation
 */

/**
 * Get the current page number from URL hash
 * @param {number} maxPage - Maximum valid page number
 * @returns {number|null} Page number (1-indexed) or null if invalid/not present
 */
function getPageFromHash(maxPage) {
    const hash = window.location.hash;
    if (!hash) return null;

    const match = hash.match(/#page=(\d+)/);
    if (!match) return null;

    const pageNum = parseInt(match[1]);
    // Validate page number using same logic as page input handler
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= maxPage) {
        return pageNum;
    }
    return null;
}

/**
 * Update URL hash with current page number
 * @param {number} pageNum - Page number (1-indexed)
 */
function setPageInHash(pageNum) {
    const newHash = `#page=${pageNum}`;
    // Use replaceState to update URL without creating browser history entries
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', newHash);
    } else {
        // Fallback for older browsers
        window.location.hash = newHash;
    }
}

/**
 * Flipbook Scaling Module
 * Handles dynamic image source updates (srcset) and EPUB content scaling for responsive layouts.
 */
/**
 * Update img sizes attribute based on zoom level for currently visible pages
 */
function updateImageSizes() {
    // Optimization: Skip expensive quality update if user is actively panning
    if (window.isPanning) return;

    const zoomLevel = window.currentZoom || 1;
    const images = document.querySelectorAll('.page-image');

    images.forEach((img) => {
        if (img && img.hasAttribute('srcset')) {
            const baseSize = 50;
            const zoomedSize = Math.round(baseSize * zoomLevel);
            const newSizes = `${zoomedSize}vw`;

            if (img.sizes !== newSizes) {
                img.sizes = newSizes;
                if (zoomLevel > 1) {
                    const srcset = img.srcset;
                    img.srcset = '';
                    img.srcset = srcset;
                }
            }

            if (zoomLevel > 1) {
                img.style.transform = 'translateZ(0)';
            } else {
                img.style.transform = '';
            }
        }
    });
}

const debouncedUpdateImageSizes = debounce(updateImageSizes, 200);

/**
 * Scale EPUB content to fit the page container
 * This ensures fixed-dimension content (from pagination) fits the responsive page
 */
function updateEpubContentScale() {
    // Use requestAnimationFrame to ensure StPageFlip has finished resizing its elements
    // and the browser has recalculated the layout before we measure clientWidth/Height.
    requestAnimationFrame(() => {
        const epubContents = document.querySelectorAll('.epub-content');
        epubContents.forEach(content => {
            const parent = content.closest('.page-container');
            if (!parent) return;

            // Get fixed dimensions from inline styles (set during pagination)
            const fixedWidth = parseFloat(content.style.width);
            const fixedHeight = parseFloat(content.style.height);

            if (!fixedWidth || !fixedHeight) return;

            const parentWidth = parent.clientWidth;
            const parentHeight = parent.clientHeight;

            if (parentWidth === 0 || parentHeight === 0) return;

            const scaleX = parentWidth / fixedWidth;
            const scaleY = parentHeight / fixedHeight;

            // Use the smaller scale to ensure it fits without cropping
            const scale = Math.min(scaleX, scaleY);

            content.style.transform = `scale(${scale})`;
            content.style.transformOrigin = 'top left';
        });
    });
}

/**
 * Flipbook Zoom Module
 * Implements high-resolution physical zoom and panning logic with viewport boundary enforcement.
 */
/**
 * Apply zoom and pan transforms to the container
 */
/**
 * Apply zoom and pan transforms to the container
 * @param {boolean} isPanOnly - If true, skip expensive resizing operations and only apply translation
 */
function updateTransform(isPanOnly = false) {
    const wrapper = document.getElementById('flipbook-wrapper');
    const container = document.getElementById('flipbook-container');

    if (!wrapper || !container) return;

    if (BOOK_WIDTH_AT_1X === 0) {
        BOOK_WIDTH_AT_1X = wrapper.clientWidth;
        BOOK_HEIGHT_AT_1X = wrapper.clientHeight;
    }

    // Constrain pan
    if (isZoomed()) {
        // Add a small buffer (e.g. 50px) to allow reaching the edges easily
        const buffer = 50;
        const maxPanX = Math.max(0, (BOOK_WIDTH_AT_1X * zoom - wrapper.clientWidth) / 2) + buffer;
        const maxPanY = Math.max(0, (BOOK_HEIGHT_AT_1X * zoom - wrapper.clientHeight) / 2) + buffer;
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    } else {
        panX = 0;
        panY = 0;
    }

    // Apply transform
    // We always set width/height to ensure consistency, but layout thrashing should be minimal if values don't change
    // However, dispatching 'resize' is VERY expensive.

    if (!isPanOnly) {
        container.style.width = `${BOOK_WIDTH_AT_1X * zoom}px`;
        container.style.height = `${BOOK_HEIGHT_AT_1X * zoom}px`;
    }

    container.style.transform = `translate(${panX}px, ${panY}px)`;

    if (!isPanOnly) {
        // Force StPageFlip to update its size
        window.isProgrammaticResize = true;
        window.dispatchEvent(new Event('resize'));
        window.isProgrammaticResize = false;

        // Update EPUB content scale immediately to prevent visual glitches
        updateEpubContentScale();
    }

    // Update cursor and disable/enable flipping
    // Only verify this on zoom change or start/end, not every frame of pan?
    // Doing it here is safe but we can skip if isPanOnly to save DOM writes
    if (!isPanOnly) {
        if (isZoomed()) {
            wrapper.style.cursor = 'grab';

            // Native library locks (supported after our custom lib build)
            if (window.pageFlip) {
                const settings = window.pageFlip.getSettings();
                settings.useMouseEvents = false;
                settings.showPageCorners = false;
            }
        } else {
            wrapper.style.cursor = 'default';

            if (window.pageFlip) {
                const settings = window.pageFlip.getSettings();
                settings.useMouseEvents = true;
                settings.showPageCorners = true;
            }
        }
    }

    window.currentZoom = zoom;
    // updateImageSizes() is now called with debounce in zoom handler
}

/**
 * Flipbook PageFlip Module
 * Controls the low-level StPageFlip integration, page preloading, and dimension calculations.
 */
/**
 * Preload images for the next spread to ensure smooth flipping
 * @param {number} currentIndex - Current page index (0-based)
 */
function preloadNextSpread(currentIndex) {
    const config = window.FLIPBOOK_CONFIG || {};
    const isDoubleSpread = config.doubleSpread;
    const pageCount = config.pageCount;

    // Calculate next pages to preload
    let pagesToPreload = [];

    if (isDoubleSpread) {
        pagesToPreload = [
            currentIndex + 1,
            currentIndex + 2,
            currentIndex + 3,
            currentIndex + 4
        ];
    } else {
        pagesToPreload = [currentIndex + 1, currentIndex + 2];
    }

    pagesToPreload.forEach(idx => {
        if (idx < pageCount) {
            const allImages = document.querySelectorAll('.page-image');
            if (allImages[idx]) {
                const img = allImages[idx];
                if (img.src) {
                    const preloader = new Image();
                    preloader.src = img.src;
                    if (img.srcset) preloader.srcset = img.srcset;

                    // Calculate correct sizes matching updateImageSizes logic
                    const zoomLevel = window.currentZoom || 1;
                    const baseSize = 50;
                    const zoomedSize = Math.round(baseSize * zoomLevel);
                    preloader.sizes = `${zoomedSize}vw`;
                }
            }
        }
    });
}

function calculateDimensions(wrapper, config) {
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;
    // Use injected aspect ratio or fallback to A4-ish (0.707)
    const pageAspectRatio = config.pageAspectRatio || 0.707;

    // Detect display mode
    const isSingleMode = window.innerHeight > window.innerWidth;

    let width, height;

    if (isSingleMode) {
        width = wrapperWidth;
        height = width / pageAspectRatio;

        if (height > wrapperHeight) {
            height = wrapperHeight;
            width = height * pageAspectRatio;
        }
    } else {
        const targetAspectRatio = pageAspectRatio * 2;
        width = wrapperWidth;
        height = width / targetAspectRatio;

        if (height > wrapperHeight) {
            height = wrapperHeight;
            width = height * targetAspectRatio;
        }
    }

    return {
        width: Math.floor(width),
        height: Math.floor(height)
    };
}

/**
 * Flipbook UI Module
 * Manages all UI event listeners, controls (zoom, full-screen, TOC), and user input handling.
 */
function setupUI(pageCount, pageInput, zoomSlider, zoomText, controlsPanel, topControlsPanel, fullscreenBtn, wrapper, tocBtn, tableOfContents, tocModal, tocList, tocCloseBtn, tocOverlay, prevPageBtn, nextPageBtn, pageLinksBtn, linksModal, linksList, linksCloseBtn) {
    // Mobile-friendly control panel activation (both panels share state)
    let controlsPanelTimeout = null;
    let isUsingSlider = false;

    const activateControlPanel = () => {
        if (controlsPanel) controlsPanel.classList.add('active');
        if (topControlsPanel) topControlsPanel.classList.add('active');

        // Clear any existing timeout
        if (controlsPanelTimeout) {
            clearTimeout(controlsPanelTimeout);
            controlsPanelTimeout = null;
        }
    };

    const deactivateControlPanel = () => {
        if (isUsingSlider) return;
        controlsPanelTimeout = setTimeout(() => {
            if (controlsPanel) controlsPanel.classList.remove('active');
            if (topControlsPanel) topControlsPanel.classList.remove('active');
        }, 1000);
    };

    if (controlsPanel) {
        controlsPanel.addEventListener('click', () => {
            activateControlPanel();
            deactivateControlPanel();
        });
    }

    if (topControlsPanel) {
        topControlsPanel.addEventListener('click', () => {
            activateControlPanel();
            deactivateControlPanel();
        });
    }

    // Fullscreen button handler
    if (fullscreenBtn && !document.documentElement.requestFullscreen) fullscreenBtn.hidden = true;
    if (fullscreenBtn && document.documentElement.requestFullscreen) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.error('Error attempting to enable fullscreen:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });
    }

    // Deactivate controls when clicking outside
    document.addEventListener('click', (e) => {
        const isClickInsideControls = controlsPanel && controlsPanel.contains(e.target);
        const isClickInsideTopControls = topControlsPanel && topControlsPanel.contains(e.target);
        if (isUsingSlider) return;
        if (!isClickInsideControls && !isClickInsideTopControls) {
            if (controlsPanel) controlsPanel.classList.remove('active');
            if (topControlsPanel) topControlsPanel.classList.remove('active');
            if (controlsPanelTimeout) {
                clearTimeout(controlsPanelTimeout);
                controlsPanelTimeout = null;
            }
        }
    });

    // Zoom Slider
    if (zoomSlider) {
        zoomSlider.addEventListener('mousedown', () => {
            isUsingSlider = true;
            activateControlPanel();
        });
        zoomSlider.addEventListener('touchstart', () => {
            isUsingSlider = true;
            activateControlPanel();
        });
        zoomSlider.addEventListener('mouseup', () => {
            isUsingSlider = false;
            zoomSlider.blur();
            deactivateControlPanel();
        });
        zoomSlider.addEventListener('touchend', () => {
            isUsingSlider = false;
            zoomSlider.blur();
            deactivateControlPanel();
        });
        zoomSlider.addEventListener('input', e => {
            zoom = parseFloat(e.target.value);
            if (zoomText) {
                zoomText.textContent = Number.isInteger(zoom) ? `${zoom}x` : `${zoom.toFixed(2)}x`;
            }
            updateTransform();
            debouncedUpdateImageSizes();
        });
        zoomSlider.addEventListener('keydown', e => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
            }
        });
    }

    // Page navigation buttons
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            handleZoomNavigation(() => pageFlip.flipPrev());
        });
    }
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            handleZoomNavigation(() => pageFlip.flipNext());
        });
    }

    // Page input handler
    if (pageInput) {
        pageInput.addEventListener('change', e => {
            const targetPage = parseInt(e.target.value);
            if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= pageCount) {
                handleZoomNavigation(() => pageFlip.flip(targetPage - 1));
            }
        });

        // Blur input when tapping outside (dismisses keyboard on mobile)
        // Use pointerdown instead of click for immediate response on touch
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('.page-input-container')) {
                pageInput.blur();
            }
        });
    }

    // Table of Contents
    if (tocBtn && tableOfContents.length > 0) {
        tocBtn.style.display = 'flex';
        function renderTOC(items, container, level = 0) {
            items.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = `toc-item toc-level-${level}`;
                // Add data-page attribute for Active TOC logic
                itemEl.setAttribute('data-page', item.page);

                itemEl.innerHTML = `<span class="toc-item-title">${item.title}</span><span class="toc-item-page">${item.page}</span>`;
                itemEl.addEventListener('click', () => {
                    if (pageFlip) {
                        handleZoomNavigation(() => {
                            pageFlip.flip(item.page - 1);
                            closeTOC();
                        });
                    }
                });
                container.appendChild(itemEl);
                if (item.children && item.children.length > 0) {
                    renderTOC(item.children, container, level + 1);
                }
            });
        }
        renderTOC(tableOfContents, tocList);

        // Active TOC Logic
        window.updateActiveTOC = (currentPage) => {
            const items = tocList.querySelectorAll('.toc-item');
            let activeItem = null;

            items.forEach(item => {
                item.classList.remove('active');
                const itemPage = parseInt(item.getAttribute('data-page'), 10);
                if (itemPage <= currentPage) {
                    activeItem = item;
                }
            });

            if (activeItem) {
                activeItem.classList.add('active');
                // Only scroll if TOC is visible to avoid unnecessary layout calculations
                if (!tocModal.classList.contains('hidden')) {
                    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        };

        const openTOC = () => {
            tocModal.classList.remove('hidden');
            // Update active item when opening just in case
            if (window.pageFlip) {
                window.updateActiveTOC(window.pageFlip.getCurrentPageIndex() + 1);
            }
        };
        const closeTOC = () => tocModal.classList.add('hidden');
        tocBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTOC();
        });
        if (tocCloseBtn) tocCloseBtn.addEventListener('click', closeTOC);
        if (tocOverlay) tocOverlay.addEventListener('click', closeTOC);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !tocModal.classList.contains('hidden')) {
                closeTOC();
            }
        });
    }

    // Page Links List
    if (pageLinksBtn && linksModal && linksList) {
        const isExternalUrl = (url) => url && (url.startsWith('http') || url.startsWith('mailto:') || url.startsWith('tel:'));

        const getLinksFromVisiblePages = () => {
            if (!pageFlip) return [];
            const activeIndex = pageFlip.getCurrentPageIndex();
            const display = (pageFlip.getSettings() && pageFlip.getSettings().display) || 'double';

            const pageContainers = document.querySelectorAll('.page-container');
            const indices = [activeIndex];
            if (display === 'double') indices.push(activeIndex + 1);

            const links = [];
            indices.forEach(idx => {
                const page = pageContainers[idx];
                if (!page) return;

                // Query all links in the enrichment layer
                const pageLinks = page.querySelectorAll('.enrichment-layer a');
                pageLinks.forEach(a => {
                    const epubHref = a.getAttribute('data-epub-href');
                    let targetPage = a.getAttribute('data-target-page');

                    // Resolve EPUB link for the list title/target if possible
                    if (epubHref) {
                        const linkMap = (window.FLIPBOOK_CONFIG && window.FLIPBOOK_CONFIG.linkMap) || {};

                        // 1. Try exact match (with anchor) first
                        targetPage = linkMap[epubHref];

                        // 2. Fallback to stripping the anchor
                        if (!targetPage) {
                            let key = epubHref.split('#')[0];
                            targetPage = linkMap[key];
                        }
                    }

                    const href = a.getAttribute('href');
                    const isExternal = href && (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:'));

                    // Skip links that have no destination
                    if (!isExternal && !targetPage) return;

                    links.push({
                        title: a.getAttribute('title') || a.textContent.trim() || (isExternal ? 'External Link' : 'Internal Link'),
                        url: isExternal ? href : null,
                        targetPage: targetPage,
                        epubHref: epubHref,
                        sourceArea: {
                            top: parseFloat(a.getAttribute('data-source-top')),
                            left: parseFloat(a.getAttribute('data-source-left')),
                            width: parseFloat(a.getAttribute('data-source-width')),
                            height: parseFloat(a.getAttribute('data-source-height'))
                        },
                        sourcePageIndex: idx
                    });
                });
            });
            return links;
        };

        const updateLinksButtonVisibility = () => {
            const links = getLinksFromVisiblePages();
            if (links.length > 0) {
                pageLinksBtn.style.display = 'flex';
            } else {
                pageLinksBtn.style.display = 'none';
                closeLinks();
            }
        };

        const renderLinks = (links) => {
            linksList.innerHTML = '';
            links.forEach(link => {
                const itemEl = document.createElement('div');
                itemEl.className = 'toc-item';

                let targetText = '';
                if (link.url) {
                    targetText = link.url.length > 60 ? link.url.substring(0, 57) + '...' : link.url;
                } else if (link.targetPage) {
                    targetText = `Page ${link.targetPage}`;
                }

                let previewHtml = '';
                if (link.sourceArea && !isNaN(link.sourceArea.top)) {
                    const pageContainers = document.querySelectorAll('.page-container');
                    const sourcePageEl = pageContainers[link.sourcePageIndex];
                    if (sourcePageEl) {
                        const sourceImg = sourcePageEl.querySelector('img.page-image');
                        if (sourceImg) {
                            const { top, left, width, height } = link.sourceArea;
                            // Replicate CSS logic for preview dimensions to ensure JS math matches exactly
                            let previewW = Math.min(window.innerWidth * 0.25, 180); // max-width: 180px
                            let previewH = previewW * 0.6;

                            // Check media query equivalent (max-height: 600px)
                            if (window.innerHeight <= 600) {
                                previewH = Math.min(window.innerHeight * 0.15, 108); // max-height: 108px
                                previewW = previewH * 1.666;
                            }

                            const previewAspect = previewW / previewH;
                            const centerX = left + width / 2;
                            const centerY = top + height / 2;

                            // Calculate zoom: fill the preview box as much as possible but cap resolution
                            // To avoid blurriness, we cap the background-size.
                            const zoom = Math.min(800, Math.max(200, 100 / Math.max(width / 100, height * previewAspect / 100)));
                            const zoomFactor = zoom / 100;

                            const aspect = sourceImg.naturalWidth / sourceImg.naturalHeight || 0.707;
                            const imgW = previewW * zoomFactor;
                            const imgH = imgW / aspect;

                            // Calculate pixel offset to center the link in the box
                            const posX = (previewW / 2) - (centerX / 100) * imgW;
                            const posY = (previewH / 2) - (centerY / 100) * imgH;

                            const highlightWidth = width * (zoomFactor);
                            const highlightHeight = height * (zoomFactor);


                            // Create offscreen canvas for the thumbnail
                            const canvas = document.createElement('canvas');
                            // Scale for high DPI
                            const pixelRatio = window.devicePixelRatio || 1;
                            canvas.width = previewW * pixelRatio;
                            canvas.height = previewH * pixelRatio;

                            const ctx = canvas.getContext('2d');
                            ctx.scale(pixelRatio, pixelRatio);

                            // Draw the image at the exact position calculated for CSS
                            // CSS 'backgound-position: Xpx Ypx' corresponds to drawing at (X, Y)
                            ctx.drawImage(sourceImg, posX, posY, imgW, imgH);

                            // Export to low-quality JPEG for memory efficiency
                            const thumbUrl = canvas.toDataURL('image/jpeg', 0.8);

                            previewHtml = `
                                <div class="link-preview-container">
                                    <div class="link-preview-viewport" style="
                                        background-image: url('${thumbUrl}');
                                        background-position: center;
                                        background-size: 100% 100%;
                                    "></div>
                                    <div class="link-preview-highlight" style="
                                        width: ${highlightWidth}px;
                                        height: ${highlightHeight}px;
                                        left: calc(50% - ${highlightWidth / 2}px);
                                        top: calc(50% - ${highlightHeight / 2}px);
                                    "></div>
                                </div>
                            `;
                        }
                    }
                }

                itemEl.innerHTML = `
                    ${previewHtml}
                    <div class="toc-item-text">
                        <span class="toc-item-title">${link.title}</span>
                        <span class="toc-item-page">${targetText}</span>
                    </div>
                `;

                itemEl.addEventListener('click', () => {
                    if (link.url) {
                        window.open(link.url, '_blank');
                    } else if (link.targetPage) {
                        const pageNum = parseInt(link.targetPage, 10);
                        if (!isNaN(pageNum)) {
                            console.log('Links Modal: Flipping to page', pageNum);
                            handleZoomNavigation(() => pageFlip.flip(pageNum - 1));
                        }
                    }
                    closeLinks();
                });
                linksList.appendChild(itemEl);
            });
        };

        const openLinks = () => {
            const links = getLinksFromVisiblePages();
            renderLinks(links);
            linksModal.classList.remove('hidden');
        };
        const closeLinks = () => linksModal.classList.add('hidden');

        pageLinksBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLinks();
        });
        if (linksCloseBtn) linksCloseBtn.addEventListener('click', closeLinks);

        // Expose to window for main.js to call
        window.updateLinksButtonVisibility = updateLinksButtonVisibility;

        // Initial check
        setTimeout(updateLinksButtonVisibility, 500);
    }

    // Keyboard navigation
    document.addEventListener('keydown', e => {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        if (isZoomed()) {
            if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
            return;
        }
        if (pageFlip) {
            if (e.key === 'ArrowRight') pageFlip.flipNext();
            else if (e.key === 'ArrowLeft') pageFlip.flipPrev();
        }
    });

    // Panning helper
    let isActuallyPanning = false;
    let mouseDownX = 0;
    let mouseDownY = 0;
    const PAN_THRESHOLD = 5;

    const onStart = (clientX, clientY) => {
        if (isZoomed()) {
            isPanning = true;
            window.isPanning = true; // Expose globally for scaling.js check
            isActuallyPanning = false;
            mouseDownX = clientX;
            mouseDownY = clientY;
            startX = clientX - panX;
            startY = clientY - panY;
            wrapper.style.cursor = 'grabbing';
        }
    };
    const onMove = (clientX, clientY) => {
        if (isPanning && isZoomed()) {
            const dist = getDistance(mouseDownX, mouseDownY, clientX, clientY);
            if (!isActuallyPanning && dist > PAN_THRESHOLD) {
                isActuallyPanning = true;
            }

            if (isActuallyPanning) {
                panX = clientX - startX;
                panY = clientY - startY;
                updateTransform(true); // Optimization: Pan only
            }
        }
    };
    const onEnd = () => {
        isPanning = false;
        window.isPanning = false;
        isActuallyPanning = false;
        if (isZoomed()) {
            wrapper.style.cursor = 'grab';
            // Trigger quality update now that panning has stopped
            debouncedUpdateImageSizes();
        }
    };

    wrapper.addEventListener('mousedown', (e) => {
        if (e.target.closest('#controls-panel') || e.target.closest('#top-controls-panel')) return;
        onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            if (isActuallyPanning) {
                e.preventDefault();
            }
            onMove(e.clientX, e.clientY);
        }
    });
    window.addEventListener('mouseup', onEnd);
    wrapper.addEventListener('touchstart', (e) => {
        if (e.target.closest('#controls-panel') || e.target.closest('#top-controls-panel')) return;
        if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 1) {
            if (isActuallyPanning && e.cancelable) {
                e.preventDefault();
            }
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: false });
    window.addEventListener('touchend', onEnd);
}

/**
 * Flipbook Link Handling Module
 * Centralizes all link-related interactions (EPUB, PDF, and external links)
 * into a single unified event listener.
 *
 * NOTE: Link previews are restricted to PDF (image-based) documents only.
 */

/**
 * Sets up a centralized click listener for all flipbook links
 * @param {Object} pageFlip - StPageFlip instance
 * @param {Object} config - Flipbook configuration
 * @param {HTMLElement} wrapper - Flipbook wrapper element
 */
function setupLinks(pageFlip, config, wrapper) {
    console.log('Setting up flipbook links handle...', { hasLinkMap: !!config.linkMap });

    let previewElement = null;
    let showTimeout = null;
    let hideTimeout = null;
    let currentPreviewPage = null;
    let currentLink = null;

    const createPreviewElement = () => {
        const el = document.createElement('div');
        el.className = 'link-hover-preview';
        (wrapper || document.body).appendChild(el);

        // Allow user to interact with the preview (scroll it)
        el.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
        });
        el.addEventListener('mouseleave', () => {
            hidePreview(0);
        });

        return el;
    };

    const showPreview = (targetPageNum, mouseX, mouseY) => {
        if (!previewElement) previewElement = createPreviewElement();

        // Use persistent pages if available, otherwise fallback to DOM
        const pageContainers = window.FLIPBOOK_PAGES || document.querySelectorAll('.page-container');
        const targetPageEl = pageContainers[targetPageNum - 1];

        if (!targetPageEl) return;

        if (currentPreviewPage !== targetPageNum || !previewElement.classList.contains('visible')) {
            previewElement.innerHTML = '';
            const previewContent = document.createElement('div');
            previewContent.className = 'preview-content';

            // Strictly PDF Logic: Only clone the <img> tag
            const img = targetPageEl.querySelector('img.page-image');
            if (img) {
                const previewImg = img.cloneNode(false);
                previewImg.src = img.src;
                if (img.srcset) previewImg.srcset = img.srcset;
                if (img.sizes) previewImg.sizes = img.sizes;
                previewImg.style.pointerEvents = 'none';
                previewImg.style.width = '100%';
                previewImg.style.height = 'auto';
                previewContent.appendChild(previewImg);
            }

            previewElement.appendChild(previewContent);
            currentPreviewPage = targetPageNum;
            previewElement.scrollTop = 0;
        }

        updatePosition(mouseX, mouseY);
        previewElement.classList.add('visible');
    };

    const updatePosition = (mouseX, mouseY) => {
        if (!previewElement) return;

        const margin = 15;
        // Measure real dimensions for accurate boundary check
        const previewW = previewElement.offsetWidth || 300;
        const previewH = previewElement.offsetHeight || 400;

        const rect = wrapper ? wrapper.getBoundingClientRect() : {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };

        let left = mouseX - rect.left + margin;
        let top = mouseY - rect.top + margin;

        // Viewport boundaries (relative to wrapper)
        if (left + previewW > rect.width) {
            left = (mouseX - rect.left) - previewW - margin;
        }
        if (top + previewH > rect.height) {
            top = rect.height - previewH - margin;
        }

        // Final safety check for top/left
        if (top < margin) top = margin;
        if (left < margin) left = margin;

        previewElement.style.left = `${left}px`;
        previewElement.style.top = `${top}px`;
    };

    const hidePreview = (delay = 400) => {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            if (previewElement) {
                previewElement.classList.remove('visible');
            }
            currentLink = null;
            currentPreviewPage = null; // Reset to force re-render if needed
        }, delay);
    };

    // Initialize missing hrefs for internal links so native right-click/ctrl-click works
    const internalLinks = (wrapper || document.body).querySelectorAll('a[data-target-page], a[data-epub-href]');
    internalLinks.forEach(link => {
        if (!link.getAttribute('href') || link.getAttribute('href') === 'javascript:void(0)') {
            let targetPage = link.getAttribute('data-target-page');
            const epubHref = link.getAttribute('data-epub-href');

            if (epubHref) {
                const linkMap = config.linkMap || {};

                // 1. Try exact match (with anchor) first
                targetPage = linkMap[epubHref];

                // 2. Fallback to stripping the anchor
                if (!targetPage) {
                    let key = epubHref.split('#')[0];
                    targetPage = linkMap[key];

                    if (!targetPage) {
                        const matchingKeys = Object.keys(linkMap).filter(k => k.includes(key) || key.includes(k));
                        if (matchingKeys.length > 0) {
                            targetPage = linkMap[matchingKeys[0]];
                        }
                    }
                }
            }

            if (targetPage) {
                link.setAttribute('href', `#page=${targetPage}`);
            }
        }
    });

    // Centralized event listener for taps/clicks to hide preview
    document.addEventListener('pointerdown', (e) => {
        if (previewElement && previewElement.classList.contains('visible')) {
            const isInsidePreview = previewElement.contains(e.target);
            const isLink = e.target.closest('a[data-target-page], a[data-epub-href]');

            if (!isInsidePreview && !isLink) {
                hidePreview(0);
            }
        }
    }, true);

    // Centralized event listener for navigation clicks
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        // Navigation works for BOTH formats
        const epubHref = link.getAttribute('data-epub-href');
        const targetPageAttr = link.getAttribute('data-target-page');

        if (epubHref) {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const linkMap = config.linkMap || {};

            // 1. Try exact match (with anchor) first
            let targetPage = linkMap[epubHref];

            // 2. Fallback to stripping the anchor
            if (!targetPage) {
                let key = epubHref.split('#')[0]; // Robust lookup
                targetPage = linkMap[key];

                if (!targetPage) {
                    const matchingKeys = Object.keys(linkMap).filter(k =>
                        k.includes(key) || key.includes(k)
                    );
                    if (matchingKeys.length > 0) {
                        targetPage = linkMap[matchingKeys[0]];
                    }
                }
            }

            if (targetPage && pageFlip) {
                handleZoomNavigation(() => pageFlip.flip(targetPage - 1));
            }
            return;
        }

        if (targetPageAttr) {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            const pageNum = parseInt(targetPageAttr, 10);
            if (!isNaN(pageNum) && pageFlip) {
                handleZoomNavigation(() => pageFlip.flip(pageNum - 1));
            }
            return;
        }

        const href = link.getAttribute('href');
        if (href && (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:'))) {
            e.stopPropagation();
        }
    }, true);

    // Hide preview on page flip
    if (pageFlip) {
        pageFlip.on('flip', () => {
            hidePreview(0);
        });
    }

    // Disable context menu on internal links (for mobile long-press)
    // Removed to allow native right-click natively.
    // document.addEventListener('contextmenu', (e) => {
    //     const link = e.target.closest('a');
    //     if (link && (link.hasAttribute('data-target-page') || link.hasAttribute('data-epub-href'))) {
    //         e.preventDefault();
    //     }
    // }, true);

    // Hover listeners
    document.addEventListener('mouseover', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        // PREVIEW logic: not epub because pages are html. Works with flipbooks generated from api
        // We explicitly ignore data-epub-href for previews
        const targetPageAttr = link.getAttribute('data-target-page');
        if (!targetPageAttr) return;

        // Clear hide timeout when over a valid preview-enabled link
        clearTimeout(hideTimeout);

        if (link === currentLink && previewElement && previewElement.classList.contains('visible')) {
            updatePosition(e.clientX, e.clientY);
            return;
        }

        currentLink = link;
        const targetPageNum = parseInt(targetPageAttr, 10);

        if (targetPageNum && !isNaN(targetPageNum)) {
            clearTimeout(showTimeout);
            showTimeout = setTimeout(() => {
                showPreview(targetPageNum, e.clientX, e.clientY);
            }, 150);
        }
    });

    document.addEventListener('mouseout', (e) => {
        const link = e.target.closest('a');
        if (link && (!e.relatedTarget || !link.contains(e.relatedTarget))) {
            clearTimeout(showTimeout);
            hidePreview(400);
        }
    });
}

/**
 * Flipbook Main Entry Point
 * Coordinates the initialization of all modular components and handles the primary application flow.
 */
// Initialize StPageFlip and all controls
document.addEventListener('DOMContentLoaded', () => {
    const config = window.FLIPBOOK_CONFIG || {};
    const pageCount = config.pageCount || 0;
    const isDoubleSpread = config.doubleSpread || false;

    if (!pageCount) {
        console.error('No page count found');
        return;
    }

    // Check if there's an initial page in the URL hash
    const initialPage = getPageFromHash(pageCount);

    if (typeof St === 'undefined' || !St.PageFlip) {
        console.error('StPageFlip not loaded');
        return;
    }

    const wrapper = document.getElementById('flipbook-wrapper');
    const flipbookEl = document.getElementById('flipbook');

    // Initial calculation
    const dims = calculateDimensions(wrapper, config);
    BOOK_WIDTH_AT_1X = dims.width;
    BOOK_HEIGHT_AT_1X = dims.height;

    // Container size matches book size (at 1x)
    const container = document.getElementById('flipbook-container');
    if (container) {
        container.style.width = `${BOOK_WIDTH_AT_1X}px`;
        container.style.height = `${BOOK_HEIGHT_AT_1X}px`;
    }

    // Store original pages for re-initialization and previews
    window.FLIPBOOK_PAGES = Array.from(document.querySelectorAll('.page-container')).map(node => node.cloneNode(true));
    const originalPages = window.FLIPBOOK_PAGES;

    // Ensure flipbook element exists and is clean
    if (!flipbookEl) {
        const newFlipbookEl = document.createElement('div');
        newFlipbookEl.id = 'flipbook';
        document.getElementById('flipbook-container').appendChild(newFlipbookEl);
        flipbookEl = newFlipbookEl;
    }
    flipbookEl.innerHTML = ''; // Clear previous content

    // Re-append pages
    originalPages.forEach(page => {
        const isSingleMode = window.innerHeight > window.innerWidth;
        page.style.width = (isSingleMode ? BOOK_WIDTH_AT_1X : BOOK_WIDTH_AT_1X / 2) + 'px';
        page.style.height = BOOK_HEIGHT_AT_1X + 'px';
        page.style.overflow = 'hidden';
        flipbookEl.appendChild(page.cloneNode(true));
    });

    // Prevent non-left clicks (e.g., right click) from reaching StPageFlip
    ['mousedown', 'pointerdown'].forEach(eventType => {
        flipbookEl.addEventListener(eventType, (e) => {
            // Allow touch events and primary mouse clicks (0)
            if (e.button !== 0 && e.pointerType !== 'touch') {
                e.stopPropagation();
            }
        }, { capture: true });
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            initStPageFlip();
        });
    });

    function initStPageFlip() {
        const isSingleMode = window.innerHeight > window.innerWidth;
        pageFlip = new St.PageFlip(flipbookEl, {
            width: isSingleMode ? BOOK_WIDTH_AT_1X : BOOK_WIDTH_AT_1X / 2,
            height: BOOK_HEIGHT_AT_1X,
            size: 'stretch',
            minWidth: 100,
            maxWidth: 10000,
            minHeight: 100,
            maxHeight: 10000,
            autoSize: false,
            showCover: false,
            usePortrait: false,
            startPage: initialPage ? initialPage - 1 : 0,
            drawShadow: true,
            maxShadowOpacity: 0.5,
            flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500,
            useMouseEvents: true,
            swipeDistance: 30,
            mobileScrollSupport: false,
            display: window.innerHeight > window.innerWidth ? 'single' : 'double',
            flippingShadow: true,
            flippingShadowOpacity: 0.5,
            flippingShadowWidthOffset: 50,
            flippingShadowWidthScale: 1.5,
            flippingShadowStartAlpha: .7,
            flippingShadowEndAlpha: 0,
            otherShadowOpacityScale: .5,
        });

        updateEpubContentScale();
        pageFlip.loadFromHTML(document.querySelectorAll('.page-container'));
        window.pageFlip = pageFlip;

        // Initialize UI and Links AFTER pageFlip is ready
        setupUI(pageCount, pageInput, zoomSlider, zoomText, controlsPanel, topControlsPanel, fullscreenBtn, wrapper, tocBtn, tableOfContents, tocModal, tocList, tocCloseBtn, tocOverlay, prevPageBtn, nextPageBtn, pageLinksBtn, linksModal, linksList, linksCloseBtn);
        if (typeof setupLinks === 'function') {
            setupLinks(pageFlip, config, wrapper);
        }

        pageFlip.on('flip', (e) => {
            const pageNum = e.data + 1;
            if (pageInput) pageInput.value = pageNum;
            if (!isUpdatingFromHash) {
                setPageInHash(pageNum);
            }
            updateImageSizes();
            updateEpubContentScale();
            preloadNextSpread(e.data);

            if (typeof updateLinksButtonVisibility === 'function') {
                updateLinksButtonVisibility();
            }
            if (typeof window.updateActiveTOC === 'function') {
                window.updateActiveTOC(pageNum);
            }
        });

        pageFlip.on('init', () => {
            window.parent.postMessage({ type: 'hkh-guide-ready', guide: config.guideId }, location.origin);
            updateImageSizes();
            updateEpubContentScale();
            preloadNextSpread(0);

            // Hide loading screen
            const loadingScreen = document.getElementById('loading-screen');
            if (loadingScreen) {
                loadingScreen.classList.add('hidden');
                setTimeout(() => {
                    loadingScreen.remove();
                }, 600);
            }
        });
    }

    // Cache control elements
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomText = document.getElementById('zoom-level');
    const pageInput = document.getElementById('page-input');
    const controlsPanel = document.getElementById('controls-panel');
    const topControlsPanel = document.getElementById('top-controls-panel');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const prevPageBtn = document.getElementById('prev-page-btn');
    const nextPageBtn = document.getElementById('next-page-btn');

    // TOC Elements
    const tocBtn = document.getElementById('toc-btn');
    const tocModal = document.getElementById('toc-modal');
    const tocList = document.getElementById('toc-list');
    const tocCloseBtn = document.getElementById('toc-close-btn');
    const tocOverlay = document.querySelector('.toc-overlay');
    const tableOfContents = config.tableOfContents || [];

    // Page Links Elements
    const pageLinksBtn = document.getElementById('page-links-btn');
    const linksModal = document.getElementById('links-modal');
    const linksList = document.getElementById('links-list');
    const linksCloseBtn = document.getElementById('links-close-btn');

    // This keeps the bottom control bar visible above the keyboard on mobile
    if ('virtualKeyboard' in navigator) {
        navigator.virtualKeyboard.overlaysContent = true;
    }

    // Initial setup
    updateTransform();

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.isProgrammaticResize) return;
        if (pageFlip) pageFlip.getSettings().display = window.innerHeight > window.innerWidth ? 'single' : 'double';
        const dims = calculateDimensions(wrapper, config);
        BOOK_WIDTH_AT_1X = dims.width;
        BOOK_HEIGHT_AT_1X = dims.height;

        const container = document.getElementById('flipbook-container');
        if (container) {
            container.style.width = `${BOOK_WIDTH_AT_1X}px`;
            container.style.height = `${BOOK_HEIGHT_AT_1X}px`;
        }
        panX = 0;
        panY = 0;
        updateTransform();
    });

    // Prevent pinch-zoom and trackpad zoom
    document.addEventListener('wheel', function (e) {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
        if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    document.addEventListener('gesturestart', function (e) {
        e.preventDefault();
    });

    // Handle URL hash changes
    window.addEventListener('hashchange', () => {
        handleZoomNavigation(() => {
            const targetPage = getPageFromHash(pageCount);
            if (targetPage !== null && pageFlip) {
                isUpdatingFromHash = true;
                pageFlip.flip(targetPage - 1);
                setTimeout(() => {
                    isUpdatingFromHash = false;
                }, 100);
            }
        });
    });

    // Set initial URL hash if not present
    if (!window.location.hash && initialPage === null) {
        setPageInHash(1);
    }

    // Cleanup on page unload to stop animation loop and prevent memory leaks
    window.addEventListener('beforeunload', () => {
        if (window.pageFlip && typeof window.pageFlip.destroy === 'function') {
            window.pageFlip.destroy();
        }
    });
});
