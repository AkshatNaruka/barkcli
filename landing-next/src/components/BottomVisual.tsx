"use client";

import { useState } from "react";

const VIDEO_URL =
  "https://res.cloudinary.com/daklr2whx/video/upload/v1778602552/track-video_2_s9lp53.mp4";

/**
 * Bottom visual: the spec'd video with a 100px red gradient blend.
 * If the (private/expired) video asset fails to load, a subtle animated
 * flow takes its place so the section always ends intentionally.
 */
export function BottomVisual() {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="relative w-full shrink-0">
      <div className="absolute top-0 left-0 w-full h-[100px] bg-gradient-to-b from-[#FF0000] to-transparent z-10 pointer-events-none" />

      {videoFailed ? (
        <div className="w-full h-[220px] md:h-[300px] block relative overflow-hidden bark-flow">
          <div className="absolute inset-x-0 top-0 h-px bg-white/20" />
        </div>
      ) : (
        <video
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoFailed(true)}
          className="w-full h-auto block object-contain"
        >
          <source src={VIDEO_URL} type="video/mp4" />
        </video>
      )}
    </div>
  );
}
