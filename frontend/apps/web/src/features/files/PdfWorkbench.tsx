import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  GlobalWorkerOptions,
  RenderingCancelledException,
  TextLayer,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Loader2Icon,
  RefreshCwIcon,
  SearchIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { api } from '../../lib/api';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfWorkbenchProps {
  id: string;
  src: string;
  name: string;
  initialPage?: number;
  onPageChange?: (page: number) => void;
}

interface PageSize {
  width: number;
  height: number;
}

interface SearchHit {
  page: number;
  occurrence: number;
}

const DEFAULT_PAGE_SIZE: PageSize = { width: 612, height: 792 };
const RANGE_CHUNK_SIZE = 512 * 1024;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

/** A custom Nook PDF workbench. PDF.js is used only as the parsing/rendering engine. */
export function PdfWorkbench({
  id,
  src,
  name,
  initialPage = 1,
  onPageChange,
}: PdfWorkbenchProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [firstPageSize, setFirstPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [scale, setScale] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [pageInput, setPageInput] = useState(String(Math.max(1, initialPage)));
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [activeHit, setActiveHit] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentPageRef = useRef(currentPage);
  const positionedDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const searchRequestRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    setDocument(null);
    setLoadError(null);
    setLoadProgress(null);
    setPageSizes({});
    setFirstPageSize(DEFAULT_PAGE_SIZE);

    try {
      loadingTask = getDocument({
        url: src,
        withCredentials: true,
        rangeChunkSize: RANGE_CHUNK_SIZE,
        // Range requests make the first page available without waiting for the entire file.
        disableStream: true,
        disableAutoFetch: true,
        useSystemFonts: true,
        stopAtErrors: false,
      });
      loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
        if (!disposed) setLoadProgress({ loaded, total });
      };
      void loadingTask.promise
        .then(async (pdf) => {
          const firstPage = await pdf.getPage(1);
          const firstViewport = firstPage.getViewport({ scale: 1 });
          if (disposed) return;
          const size = { width: firstViewport.width, height: firstViewport.height };
          setFirstPageSize(size);
          setPageSizes({ 1: size });
          setDocument(pdf);
          setLoadProgress(null);
        })
        .catch((error: unknown) => {
          if (disposed) return;
          setLoadError(pdfErrorMessage(error));
          setLoadProgress(null);
        });
    } catch (error) {
      setLoadError(pdfErrorMessage(error));
    }

    return () => {
      disposed = true;
      searchRequestRef.current += 1;
      void loadingTask?.destroy();
    };
  }, [retryKey, src]);

  const calculateFitScale = useCallback(() => {
    if (!viewportElement) return;
    const availableWidth = Math.max(240, viewportElement.clientWidth - 40);
    setScale(clamp(availableWidth / firstPageSize.width, MIN_SCALE, MAX_SCALE));
  }, [firstPageSize.width, viewportElement]);

  useEffect(() => {
    if (!fitWidth || !viewportElement) return;
    calculateFitScale();
    const observer = new ResizeObserver(calculateFitScale);
    observer.observe(viewportElement);
    return () => observer.disconnect();
  }, [calculateFitScale, fitWidth, viewportElement]);

  const updatePageSize = useCallback((page: number, size: PageSize) => {
    setPageSizes((current) => {
      const previous = current[page];
      if (previous && closeEnough(previous.width, size.width) && closeEnough(previous.height, size.height)) {
        return current;
      }
      return { ...current, [page]: size };
    });
  }, []);

  const scrollToPage = useCallback(
    (page: number, behavior: ScrollBehavior = 'smooth') => {
      if (!document || !viewportElement) return;
      const target = clamp(Math.round(page), 1, document.numPages);
      const element = viewportElement.querySelector<HTMLElement>(`[data-pdf-page="${target}"]`);
      if (!element) return;
      const viewportBounds = viewportElement.getBoundingClientRect();
      const pageBounds = element.getBoundingClientRect();
      const top = viewportElement.scrollTop + pageBounds.top - viewportBounds.top - 12;
      viewportElement.scrollTo({ top: Math.max(0, top), behavior });
    },
    [document, viewportElement],
  );

  useEffect(() => {
    if (!document || !viewportElement) return;
    const target = clamp(initialPage, 1, document.numPages);
    const isInitialPosition = positionedDocumentRef.current !== document;
    if (!isInitialPosition && target === currentPageRef.current) return;

    positionedDocumentRef.current = document;
    currentPageRef.current = target;
    setCurrentPage(target);
    setPageInput(String(target));
    const frame = window.requestAnimationFrame(() =>
      scrollToPage(target, isInitialPosition ? 'instant' : 'smooth'),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [document, initialPage, scrollToPage, viewportElement]);

  useEffect(() => {
    if (!document || !viewportElement) return;
    let frame = 0;
    const viewportRect = () => viewportElement.getBoundingClientRect();
    const findCurrentPage = () => {
      frame = 0;
      const bounds = viewportRect();
      const viewportTop = bounds.top + 8;
      let closestPage = currentPageRef.current;
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const element of viewportElement.querySelectorAll<HTMLElement>('[data-pdf-page]')) {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < viewportTop) continue;
        const distance = Math.abs(rect.top - viewportTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = Number(element.dataset.pdfPage);
        }
        if (rect.top > bounds.bottom) break;
      }
      if (closestPage !== currentPageRef.current) {
        currentPageRef.current = closestPage;
        setCurrentPage(closestPage);
        setPageInput(String(closestPage));
        onPageChange?.(closestPage);
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(findCurrentPage);
    };
    viewportElement.addEventListener('scroll', onScroll, { passive: true });
    findCurrentPage();
    return () => {
      viewportElement.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [document, onPageChange, viewportElement]);

  const submitPage = (event: FormEvent) => {
    event.preventDefault();
    if (!document) return;
    const parsed = Number.parseInt(pageInput, 10);
    const next = clamp(Number.isFinite(parsed) ? parsed : currentPage, 1, document.numPages);
    setPageInput(String(next));
    scrollToPage(next);
  };

  const changeScale = (next: number) => {
    setFitWidth(false);
    setScale(clamp(next, MIN_SCALE, MAX_SCALE));
  };

  const showSearch = () => {
    setSearchOpen(true);
    window.setTimeout(() => rootRef.current?.querySelector<HTMLInputElement>('[data-pdf-search]')?.focus());
  };

  const closeSearch = () => {
    searchRequestRef.current += 1;
    setSearchOpen(false);
    setSearching(false);
    setSearchHits([]);
    setActiveHit(-1);
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    const request = ++searchRequestRef.current;
    setSearching(true);
    setSearchHits([]);
    setActiveHit(-1);
    try {
      const extracted = await api.files.text(id);
      if (request !== searchRequestRef.current) return;
      const needle = keyword.toLocaleLowerCase();
      const hits = extracted.pages.flatMap(({ page, text }) =>
        Array.from({ length: countOccurrences(text.toLocaleLowerCase(), needle) }, (_, occurrence) => ({
          page,
          occurrence,
        })),
      );
      setSearchHits(hits);
      setActiveHit(hits.length ? 0 : -1);
      if (hits[0]) scrollToPage(hits[0].page);
    } catch {
      if (request === searchRequestRef.current) setSearchHits([]);
    } finally {
      if (request === searchRequestRef.current) setSearching(false);
    }
  };

  const moveSearch = (direction: -1 | 1) => {
    if (!searchHits.length) return;
    const next = (activeHit + direction + searchHits.length) % searchHits.length;
    const hit = searchHits[next];
    if (!hit) return;
    setActiveHit(next);
    scrollToPage(hit.page);
  };

  const activeSearchPage = activeHit >= 0 ? searchHits[activeHit]?.page : undefined;
  const zoomPercent = Math.round(scale * 100);
  const pageNumbers = useMemo(
    () => (document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : []),
    [document],
  );

  if (loadError) {
    return (
      <div className="nook-pdf-workbench" data-testid="pdf-workbench">
        <div className="nook-pdf-workbench__state nook-pdf-workbench__state--error">
          <span>{loadError}</span>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)}>
            <RefreshCwIcon /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!document) {
    const percentage = loadProgress?.total
      ? Math.min(100, Math.round((loadProgress.loaded / loadProgress.total) * 100))
      : null;
    return (
      <div className="nook-pdf-workbench" data-testid="pdf-workbench">
        <div className="nook-pdf-workbench__state">
          <Loader2Icon className="nook-file-viewer__spin" />
          <span>{percentage === null ? 'Opening PDF…' : `Opening PDF… ${percentage}%`}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="nook-pdf-workbench"
      data-testid="pdf-workbench"
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault();
          showSearch();
        }
        if (event.key === 'Escape' && searchOpen) closeSearch();
      }}
    >
      <div className="nook-pdf-workbench__surface">
        <div className="nook-pdf-workbench__toolbar" role="toolbar" aria-label="PDF controls">
          <button
            type="button"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => scrollToPage(currentPage - 1)}
          >
            <ChevronLeftIcon />
          </button>
          <form className="nook-pdf-workbench__page-form" onSubmit={submitPage}>
            <input
              value={pageInput}
              inputMode="numeric"
              aria-label="Page number"
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => setPageInput(String(currentPage))}
            />
            <span>/ {document.numPages}</span>
          </form>
          <button
            type="button"
            aria-label="Next page"
            disabled={currentPage >= document.numPages}
            onClick={() => scrollToPage(currentPage + 1)}
          >
            <ChevronRightIcon />
          </button>

          <span className="nook-pdf-workbench__divider" />
          <button type="button" aria-label="Zoom out" onClick={() => changeScale(scale / 1.2)}>
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            className="nook-pdf-workbench__zoom-value"
            title="Actual size"
            onClick={() => changeScale(1)}
          >
            {zoomPercent}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => changeScale(scale * 1.2)}>
            <ZoomInIcon />
          </button>
          <button
            type="button"
            className={`nook-pdf-workbench__fit${fitWidth ? ' is-active' : ''}`}
            onClick={() => {
              setFitWidth(true);
              calculateFitScale();
            }}
          >
            Fit width
          </button>
          <span className="nook-pdf-workbench__spacer" />
          <button
            type="button"
            aria-label="Search document"
            className={searchOpen ? 'is-active' : undefined}
            onClick={() => (searchOpen ? closeSearch() : showSearch())}
          >
            <SearchIcon />
          </button>
        </div>

        {searchOpen ? (
          <form className="nook-pdf-workbench__search" onSubmit={(event) => void runSearch(event)}>
            <SearchIcon />
            <input
              data-pdf-search
              value={query}
              aria-label="Search PDF"
              placeholder="Search in document…"
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-live="polite">
              {searching
                ? 'Searching…'
                : searchHits.length
                  ? `${activeHit + 1} / ${searchHits.length}`
                  : query
                    ? 'No matches'
                    : ''}
            </span>
            <button
              type="button"
              aria-label="Previous match"
              disabled={!searchHits.length}
              onClick={() => moveSearch(-1)}
            >
              <ChevronUpIcon />
            </button>
            <button
              type="button"
              aria-label="Next match"
              disabled={!searchHits.length}
              onClick={() => moveSearch(1)}
            >
              <ChevronDownIcon />
            </button>
            <button type="button" aria-label="Close search" onClick={closeSearch}>
              <XIcon />
            </button>
          </form>
        ) : null}

        <div
          ref={setViewportElement}
          className="nook-pdf-workbench__viewport"
          aria-label={`${name} PDF pages`}
        >
          <div className="nook-pdf-workbench__scroller">
            {pageNumbers.map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                document={document}
                pageNumber={pageNumber}
                scale={scale}
                size={pageSizes[pageNumber] ?? firstPageSize}
                viewportElement={viewportElement}
                searchQuery={searchHits.length ? query : ''}
                activeSearchResult={activeSearchPage === pageNumber}
                onSize={updatePageSize}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfPage({
  document,
  pageNumber,
  scale,
  size,
  viewportElement,
  searchQuery,
  activeSearchResult,
  onSize,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  size: PageSize;
  viewportElement: HTMLDivElement | null;
  searchQuery: string;
  activeSearchResult: boolean;
  onSize: (page: number, size: PageSize) => void;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayerInstanceRef = useRef<TextLayer | null>(null);
  const [visible, setVisible] = useState(pageNumber === 1);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    const element = pageRef.current;
    if (!element || !viewportElement) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { root: viewportElement, rootMargin: '125% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewportElement]);

  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    setRendered(false);
    setRenderError(false);
    void document
      .getPage(pageNumber)
      .then(async (page: PDFPageProxy) => {
        if (disposed) return;
        const naturalViewport = page.getViewport({ scale: 1 });
        onSize(pageNumber, { width: naturalViewport.width, height: naturalViewport.height });

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer || disposed) return;

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });

        textContainer.replaceChildren();
        textContainer.style.setProperty('--total-scale-factor', String(scale));
        textContainer.style.setProperty('--scale-round-x', '1px');
        textContainer.style.setProperty('--scale-round-y', '1px');
        textLayer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textContainer,
          viewport,
        });
        textLayerInstanceRef.current = textLayer;

        await Promise.all([renderTask.promise, textLayer.render()]);
        if (!disposed) {
          highlightTextLayer(textLayer, searchQuery, activeSearchResult);
          setRendered(true);
        }
      })
      .catch((error: unknown) => {
        if (disposed || error instanceof RenderingCancelledException) return;
        setRenderError(true);
      });

    return () => {
      disposed = true;
      renderTask?.cancel();
      textLayer?.cancel();
      if (textLayerInstanceRef.current === textLayer) textLayerInstanceRef.current = null;
    };
  }, [document, onSize, pageNumber, scale, visible]);

  useEffect(() => {
    if (textLayerInstanceRef.current) {
      highlightTextLayer(textLayerInstanceRef.current, searchQuery, activeSearchResult);
    }
  }, [activeSearchResult, searchQuery]);

  const width = size.width * scale;
  const height = size.height * scale;

  return (
    <div
      ref={pageRef}
      className={`nook-pdf-workbench__page${activeSearchResult ? ' is-search-result' : ''}`}
      data-pdf-page={pageNumber}
      data-pdf-rendered={rendered ? 'true' : 'false'}
      style={{ width, height }}
      aria-label={`Page ${pageNumber}`}
    >
      {visible ? (
        <>
          <canvas ref={canvasRef} />
          <div ref={textLayerRef} className="nook-pdf-workbench__text-layer" />
          {!rendered && !renderError ? (
            <span className="nook-pdf-workbench__page-loading">
              <Loader2Icon className="nook-file-viewer__spin" /> Rendering page…
            </span>
          ) : null}
          {renderError ? <span className="nook-pdf-workbench__page-error">Page could not be rendered</span> : null}
        </>
      ) : null}
    </div>
  );
}

function highlightTextLayer(layer: TextLayer, query: string, active: boolean) {
  const needle = query.trim().toLocaleLowerCase();
  layer.textDivs.forEach((element, index) => {
    const matches = Boolean(needle && layer.textContentItemsStr[index]?.toLocaleLowerCase().includes(needle));
    element.classList.toggle('is-search-match', matches);
    element.classList.toggle('is-active-search-match', matches && active);
  });
}

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += Math.max(needle.length, 1);
  }
  return count;
}

function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pdfErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/password/i.test(message)) return 'This PDF is password protected.';
  if (/invalid|format|corrupt/i.test(message)) return 'This PDF is invalid or damaged.';
  if (/missing|404|unexpected response/i.test(message)) return 'The PDF file could not be found.';
  return 'The PDF could not be opened.';
}
