"use client";

import { Sparkles } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { AuthView } from "@/components/AuthView";
import { WorkspaceApp } from "@/components/WorkspaceApp";
import { PublicUser } from "@/types/app";

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [monthlyTokens, setMonthlyTokens] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as {
        needsSetup: boolean;
        user: PublicUser | null;
        monthlyTokens: number;
        error?: string;
      };
      setNeedsSetup(data.needsSetup);
      setUser(data.user);
      setMonthlyTokens(data.monthlyTokens ?? 0);
      setInitError(data.error ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then(
        (data: {
          needsSetup: boolean;
          user: PublicUser | null;
          monthlyTokens: number;
          error?: string;
        }) => {
          if (!active) return;
          setNeedsSetup(data.needsSetup);
          setUser(data.user);
          setMonthlyTokens(data.monthlyTokens ?? 0);
          setInitError(data.error ?? null);
        }
      )
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#191817] text-[#9e998e] gap-3">
        <Sparkles className="w-6 h-6 text-[#d97757] animate-pulse" />
        <span className="text-xs">読み込み中...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        needsSetup={needsSetup}
        initialError={initError}
        onAuthenticated={(u) => {
          setNeedsSetup(false);
          setUser(u);
          void checkSession();
        }}
      />
    );
  }

  return (
    <WorkspaceApp
      initialUser={user}
      initialMonthlyTokens={monthlyTokens}
      onLoggedOut={() => {
        setUser(null);
        void checkSession();
      }}
    />
  );
}
