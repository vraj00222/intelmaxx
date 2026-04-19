"use client";

import { useEffect, useState } from "react";
import SpyIntro from "@/components/SpyIntro";
import WarRoom from "@/components/WarRoom";

const INTRO_SEEN_KEY = "intelmaxxing-intro-seen";

export default function Home() {
  const [introDone, setIntroDone] = useState<boolean | null>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
    setIntroDone(seen);
  }, []);

  if (introDone === null) return null;

  if (!introDone) {
    return (
      <SpyIntro
        onDone={() => {
          sessionStorage.setItem(INTRO_SEEN_KEY, "1");
          setIntroDone(true);
        }}
      />
    );
  }

  return <WarRoom />;
}
