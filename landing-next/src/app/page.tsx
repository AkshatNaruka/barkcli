const INSTALL = "curl -fsSL https://barkcli.vercel.app/install.sh | sh";

import { BottomVisual } from "@/components/BottomVisual";

export default function Home() {
  return (
    <section className="relative min-h-screen w-full bg-[#FF0000] flex flex-col z-10">
      {/* 1. Centered content */}
      <div className="flex-1 flex flex-col items-center w-full pt-[100px] md:pt-[400px]">
        <div className="flex flex-col items-center w-full px-8 text-center z-20 relative max-w-[900px] h-auto md:h-[620px] mx-auto">
          {/* a) Logo — kanban mark */}
          <svg
            width="80"
            height="80"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-12"
            aria-label="barkcli"
          >
            <rect x="8" y="16" width="30" height="88" rx="9" fill="white" />
            <rect x="45" y="28" width="30" height="76" rx="9" fill="white" opacity="0.8" />
            <rect x="82" y="16" width="30" height="88" rx="9" fill="white" opacity="0.6" />
            <rect x="14" y="26" width="18" height="13" rx="3.5" fill="#FF0000" />
            <rect x="51" y="38" width="18" height="13" rx="3.5" fill="#FF0000" />
            <rect x="88" y="26" width="18" height="13" rx="3.5" fill="#FF0000" />
          </svg>

          {/* b) Mission statement */}
          <p className="text-white text-[16px] h-[100px] w-full max-w-[400px] leading-[1.6] mb-[40px] uppercase tracking-wider mx-auto">
            We built barkcli with a single purpose — to eliminate
            project-management chaos and restore balance to your daily build
            routine
          </p>

          {/* c) Cursive signature */}
          <div className="font-marck text-white text-[88px] md:text-[120px] leading-none mb-[32px]">
            barkcli
          </div>

          {/* d) Two paragraphs */}
          <div className="text-white leading-[1.6] mb-[56px] md:mb-16 w-full flex flex-col items-center font-light">
            <p className="mb-[24px] text-[16px] w-[400px] max-w-full text-center">
              I Was Exhausted By Task Tools That Demanded More Effort Than They
              Actually Saved. That Is Why We Engineered A Git-Native Board That
              Lives Quietly Inside Your Repo.
            </p>
            <p className="text-[16px] w-[400px] max-w-full text-center">
              Your Projects Should Live Where Your Code Does — Not In Another
              Cloud Tab. Let The Board Handle The Heavy Lifting, So You Can
              Focus On What You Ship.
            </p>
          </div>

          {/* Install */}
          <div className="flex flex-col items-center gap-2 mb-[60px] md:mb-24">
            <code className="text-[13px] font-light tracking-wide text-white border border-white/30 rounded-full px-5 py-2.5 bg-white/5 backdrop-blur-sm">
              <span className="opacity-60 select-none">$ </span>
              {INSTALL}
            </code>
            <div className="text-[11px] text-white/70 font-light tracking-wider">
              macOS · Linux · Windows ·{" "}
              <a
                href="https://github.com/AkshatNaruka/barkcli"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-white transition-colors"
              >
                GitHub
              </a>{" "}
              · MIT
            </div>
          </div>
        </div>
      </div>

      {/* 2. Bottom video with red gradient blend */}
      <BottomVisual />
    </section>
  );
}
