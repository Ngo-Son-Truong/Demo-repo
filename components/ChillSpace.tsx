"use client";

import { useEffect, useState } from "react";
import { LandingPage } from "@/components/landing/LandingPage";
import { ProfileSetup } from "@/components/onboarding/ProfileSetup";
import { AppShell } from "@/components/app/AppShell";
import { useAmbientAudio } from "@/lib/hooks/useAmbientAudio";
import type { SceneThemeId, UserProfile } from "@/lib/types";

type Stage = "landing" | "profile" | "app";

const PROFILE_KEY = "chillspace.profile.v1";

export function ChillSpace({ initialInviteCode = null }: { initialInviteCode?: string | null }) {
  const [stage, setStage] = useState<Stage>("landing");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [theme] = useState<SceneThemeId>("rainyCafe");
  const audio = useAmbientAudio();

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserProfile;
        if (parsed?.nickname) setProfile(parsed);
      }
    } catch {
      /* storage might be unavailable — the prototype still works */
    }
  }, []);

  const enter = () => {
    if (!audio.playing) audio.play();
    setStage(profile ? "app" : "profile");
  };

  const completeProfile = (next: UserProfile) => {
    setProfile(next);
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (!audio.playing) audio.play();
    setStage("app");
  };

  if (stage === "landing") {
    return (
      <LandingPage
        theme={theme}
        profile={profile}
        audio={audio}
        inviteCode={initialInviteCode}
        onEnter={enter}
        onEditProfile={() => setStage("profile")}
      />
    );
  }

  if (stage === "profile") {
    return (
      <ProfileSetup
        theme={theme}
        initial={profile}
        inviteCode={initialInviteCode}
        onBack={() => setStage("landing")}
        onSubmit={completeProfile}
      />
    );
  }

  if (!profile) return null;

  return (
    <AppShell
      profile={profile}
      audio={audio}
      initialInviteCode={initialInviteCode}
      onEditProfile={() => setStage("profile")}
      onSignOut={() => setStage("landing")}
    />
  );
}
