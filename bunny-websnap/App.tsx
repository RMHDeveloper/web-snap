
import React, { useState, useRef } from 'react';
import { AppStatus, ScreenshotData } from './types';
import { analyzeScreenshot } from './services/geminiService';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

// Screenshot providers, tried in order. Both are free/keyless, return full-page
// PNGs, and send permissive CORS headers so the browser can read the bytes.
const SHOT_PROVIDERS: { name: string; build: (target: string) => string; attempts: number }[] = [
  {
    name: 'Microlink',
    build: (t) =>
      `https://api.microlink.io/?url=${encodeURIComponent(t)}` +
      `&screenshot=true&fullPage=true&meta=false&embed=screenshot.url`,
    attempts: 2,
  },
  {
    name: 'thum.io',
    build: (t) => `https://image.thum.io/get/viewport/1440x900/width/1440/fullpage/true/${t}`,
    attempts: 3,
  },
];

// Fetch with a hard timeout so a hanging provider can't stall the whole chain.
const fetchWithTimeout = async (url: string, ms: number): Promise<Response> => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { cache: 'no-store', signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Try each provider until one returns a real image. Throws with the last reason.
const fetchScreenshot = async (
  target: string,
): Promise<{ blob: Blob; sourceUrl: string; engine: string }> => {
  let lastReason = 'no screenshot engine responded';
  for (const provider of SHOT_PROVIDERS) {
    const sourceUrl = provider.build(target);
    for (let attempt = 1; attempt <= provider.attempts; attempt++) {
      try {
        const res = await fetchWithTimeout(sourceUrl, 30000);
        if (res.ok) {
          const candidate = await res.blob();
          if (candidate.type.startsWith('image/') && candidate.size > 4096) {
            return { blob: candidate, sourceUrl, engine: provider.name };
          }
          lastReason = candidate.type.startsWith('image/')
            ? `${provider.name} is still rendering`
            : `${provider.name} returned an unexpected response`;
        } else if (res.status === 429 || res.status === 403) {
          lastReason = `${provider.name} is rate-limited right now`;
        } else {
          lastReason = `${provider.name} returned HTTP ${res.status}`;
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          lastReason = `${provider.name} timed out (the site may be slow or blocking capture)`;
          break; // retrying a timeout in the same run rarely helps — move on
        }
        lastReason = `could not reach ${provider.name}`;
      }
      if (attempt < provider.attempts) await sleep(attempt * 3000);
    }
  }
  throw new Error(`Couldn't get a screenshot — ${lastReason}. Try again in a moment.`);
};

const Navbar = () => (
  <nav className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 glass sticky top-0 z-[100]">
    <div className="flex items-center gap-2 min-w-0">
      <img src="https://rabbitmarketinghouse.in/webinar/assets/kk-removebg-preview.png" alt="Bunny WebSnap Logo" className="w-8 h-8 object-contain shrink-0" />
      <span className="text-lg sm:text-xl font-jakarta font-bold tracking-tight text-white whitespace-nowrap">Bunny WebSnap</span>
    </div>
    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
      <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
      <span className="hidden sm:inline text-[10px] font-black text-gray-500 uppercase tracking-widest">Legacy Full-Page Engine Active</span>
    </div>
  </nav>
);

const Footer = () => (
  <footer className="py-12 px-6 border-t border-gray-800 text-center text-gray-500 text-sm mt-auto bg-[#030712] relative z-20">
    <p>© 2026 Bunny WebSnap. Developed by <a href="https://rabbitmarketinghouse.in/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Rabbit Marketing House</a></p>
  </footer>
);

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScreenshotData & { dimensions?: { w: number, h: number } } | null>(null);
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const handleImageLoad = () => {
    if (imgRef.current && result) {
      setResult({
        ...result,
        dimensions: {
          w: imgRef.current.naturalWidth,
          h: imgRef.current.naturalHeight
        }
      });
    }
  };

  const initiateCapture = async (targetUrl: string) => {
    if (!targetUrl) return;

    let formattedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    try {
      setStatus(AppStatus.CAPTURING);
      setError(null);
      setAnalysisNote(null);
      setResult(null);

      const { blob, sourceUrl, engine } = await fetchScreenshot(formattedUrl);

      setStatus(AppStatus.ANALYZING);

      // Data URL for Gemini; object URL for on-screen display (no re-fetch).
      const base64ImageUrl = `data:${blob.type};base64,${await blobToBase64(blob)}`;
      const objectUrl = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = objectUrl;

      let analysis;
      try {
        analysis = await analyzeScreenshot(base64ImageUrl);
      } catch (e: any) {
        console.error('Analysis failed:', e);
        // Still show the screenshot even if the AI step fails.
        setAnalysisNote(e?.message || 'AI analysis is unavailable right now.');
      }

      setResult({
        url: formattedUrl,
        imageUrl: objectUrl,
        sourceUrl,
        engine,
        timestamp: new Date().toLocaleTimeString(),
        device: 'desktop',
        analysis,
      });
      setStatus(AppStatus.SUCCESS);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Capture failed. The site might be blocking screenshots or the engine is busy.');
      setStatus(AppStatus.ERROR);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    initiateCapture(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#030712] text-gray-100 overflow-x-hidden">
      <Navbar />

      <main className="flex-grow max-w-7xl mx-auto w-full px-5 sm:px-6 py-10 sm:py-12 relative">
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-jakarta font-extrabold mb-5 sm:mb-6 tracking-tighter">
            Full <span className="gradient-text">Vision</span>
          </h1>
          <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto mb-8 sm:mb-10 font-medium">
            Professional full-page website snapshots with deep AI analysis.
          </p>

          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleFormSubmit} className="mb-8">
              <div className="relative">
                <input
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="https://website.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-800 rounded-3xl py-5 sm:py-6 text-lg sm:text-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500/50 transition-all text-white placeholder:text-gray-700 shadow-2xl pr-6 pl-6 sm:pl-8"
                  disabled={status === AppStatus.CAPTURING || status === AppStatus.ANALYZING}
                />
              </div>
              <button
                type="submit"
                disabled={status === AppStatus.CAPTURING || status === AppStatus.ANALYZING || !url}
                className="mt-4 w-full px-10 py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-2xl font-black transition-all flex items-center justify-center gap-2 text-white shadow-xl uppercase tracking-widest text-xs"
              >
                {status === AppStatus.CAPTURING || status === AppStatus.ANALYZING ? (
                  <i className="fa-solid fa-spinner fa-spin text-lg"></i>
                ) : (
                  <>Capture Full Page</>
                )}
              </button>
            </form>
          </div>

          {error && (
            <div className="mt-10">
              <div className="inline-flex items-center gap-3 bg-red-500/10 border border-red-500/20 px-6 py-4 rounded-2xl text-red-400 font-bold text-sm">
                <i className="fa-solid fa-triangle-exclamation"></i>
                {error}
              </div>
            </div>
          )}
        </div>

        {/* Processing State */}
        {(status === AppStatus.CAPTURING || status === AppStatus.ANALYZING) && (
          <div className="flex flex-col items-center justify-center py-24 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 border-8 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="fa-solid fa-bolt text-blue-500 animate-pulse"></i>
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white uppercase tracking-tighter">
                {status === AppStatus.CAPTURING ? 'Rendering Full Page...' : 'Analyzing Captured Page...'}
              </h2>
              <p className="text-gray-600 text-sm mt-2">
                {status === AppStatus.CAPTURING
                  ? 'This may take up to 15 seconds for long or complex pages.'
                  : <>Note: Full page captures may sometimes show only the initial content if the target website uses lazy loading extensively.<br />The AI will analyze the visible content.</>}
              </p>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col lg:flex-row gap-12 items-start mt-8">
            {/* Direct Full-Page Image */}
            <div className="lg:w-2/3 w-full">
              <div className="bg-[#0f172a] rounded-[3rem] border border-gray-800 shadow-[0_80px_120px_-30px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="bg-gray-900/95 px-10 py-6 border-b border-gray-800/50 flex items-center justify-between sticky top-[72px] z-50 backdrop-blur-2xl">
                  <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/40"></div>
                      <div className="w-3 h-3 rounded-full bg-yellow-500/40"></div>
                      <div className="w-3 h-3 rounded-full bg-green-500/40"></div>
                    </div>
                    <span className="text-xs font-mono text-gray-500 ml-4 truncate max-w-md">{result.url}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-gray-500 bg-gray-500/5 px-3 py-1.5 rounded-lg border border-gray-500/10 uppercase hidden sm:inline">
                      via {result.engine}
                    </span>
                    {result.dimensions && (
                      <span className="text-[10px] font-black text-blue-400 bg-blue-400/5 px-3 py-1.5 rounded-lg border border-blue-400/10 uppercase">
                        {result.dimensions.h}PX Height
                      </span>
                    )}
                    <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="text-white hover:text-blue-400 transition-colors" title="Open full screenshot in a new tab">
                      <i className="fa-solid fa-up-right-from-square"></i>
                    </a>
                  </div>
                </div>

                {/* FULL IMAGE RENDER - NO INTERNAL SCROLLBAR */}
                {/* Adjusted padding-top to account for sticky header and removed min-h-screen */}
                <div className="bg-black flex justify-center px-6 md:px-12 pt-[72px] pb-6 md:pb-12">
                  <img
                    ref={imgRef}
                    src={result.imageUrl}
                    alt={`Screenshot of ${result.url}`}
                    onLoad={handleImageLoad}
                    className="h-auto block shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl w-full"
                  />
                </div>
              </div>
            </div>

            {/* Sticky Analysis Sidebar */}
            <div className="lg:w-1/3 w-full flex flex-col gap-6 lg:sticky lg:top-32 pb-24">
              {!result.analysis && analysisNote && (
                <div className="glass p-6 rounded-2xl border border-gray-800 shadow-xl text-gray-500 text-xs font-medium flex items-start gap-3">
                  <i className="fa-solid fa-circle-info mt-0.5"></i>
                  <span>{analysisNote}</span>
                </div>
              )}
              {result.analysis && (
                <>
                  <div className="glass p-10 rounded-[2.5rem] border-l-[6px] border-blue-600 shadow-2xl">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">AI Summary</h3>
                      <div className="px-3 py-1 bg-blue-500/10 rounded-full text-[9px] font-bold text-blue-400 border border-blue-500/20">GEMINI VISION</div>
                    </div>
                    <p className="text-lg text-gray-100 font-medium leading-relaxed italic">
                      "{result.analysis.summary}"
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-8 rounded-[2.5rem] border border-gray-800 shadow-xl flex flex-col items-center">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-4">UI Score</span>
                      <div className="text-4xl font-black text-white">{result.analysis.uiScore}<span className="text-sm text-gray-600">/100</span></div>
                    </div>
                    <div className="glass p-8 rounded-[2.5rem] border border-gray-800 shadow-xl flex flex-col justify-center items-center text-center">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-4">Structure</span>
                      <span className="text-sm font-black text-blue-100 uppercase tracking-tight">{result.analysis.layoutType}</span>
                    </div>
                  </div>

                  <div className="glass p-10 rounded-lg border border-gray-800 shadow-xl">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-8">Extracted Colors</h3>
                    <div className="grid grid-cols-4 gap-4">
                      {result.analysis.colors.map((color, i) => (
                        <div key={i} className="flex flex-col items-center gap-3">
                          <div className="w-full aspect-square rounded-lg shadow-lg ring-4 ring-white/5" style={{ backgroundColor: color }}></div>
                          <span className="text-[8px] font-mono font-black text-gray-500">{color.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass p-10 rounded-[2.5rem] border border-gray-800 shadow-xl">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-8">UX Recommendations</h3>
                    <div className="space-y-6">
                      {result.analysis.uxSuggestions.map((s, i) => (
                        <div key={i} className="flex gap-5 group">
                          <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0 group-hover:bg-blue-600 transition-all">
                            <i className="fa-solid fa-check text-[10px] text-blue-400 group-hover:text-white"></i>
                          </div>
                          <p className="text-sm text-gray-400 font-medium group-hover:text-gray-200 transition-colors">{s}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass p-10 rounded-[2.5rem] border border-gray-800 shadow-xl">
                    <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-6">Tech DNA</h3>
                    <div className="flex flex-wrap gap-2.5">
                      {result.analysis.techStackGuess.map((t, i) => (
                        <span key={i} className="px-4 py-2 bg-gray-900 rounded-xl text-[10px] font-black text-blue-400 border border-blue-900/30 uppercase tracking-tighter">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default App;
