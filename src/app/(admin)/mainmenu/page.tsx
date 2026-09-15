"use client";

// src/app/(admin)/mainmenu/page.tsx
// 旧 views/MainMenu.vue を移植
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFeedbackStore } from "@/stores/feedback";
import { DELAY_APOLOGY } from "@/lib/constants";

type MenuCard = {
  key: string;
  title: string;
  color: string;
  img: string;
  action: () => void;
};

export default function MainMenu() {
  const router = useRouter();
  const toast = useFeedbackStore((s) => s.toast);

  const cards: MenuCard[] = [
    {
      key: "books",
      title: "聖書奉読",
      color: "#800020",
      img: "/assets/burgundy.svg",
      action: () => toast(DELAY_APOLOGY),
    },
    {
      key: "hymns",
      title: "賛美歌集め",
      color: "#006400",
      img: "/assets/bourbon.svg",
      action: () => router.push("/hymns"),
    },
    {
      key: "random",
      title: "ランダム選択",
      color: "#002fa7",
      img: "/assets/newaragon.svg",
      action: () => router.push("/hymns/random-five"),
    },
  ];

  // 旧 mainmenu.js: localStorageのredirectMessage/loginMsgをトースト表示
  useEffect(() => {
    const msg = localStorage.getItem("redirectMessage");
    if (msg) {
      toast(msg);
      localStorage.removeItem("redirectMessage");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold text-primary">メインメニュー</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.key}
            className="group relative h-[66vh] cursor-pointer overflow-hidden rounded-lg shadow"
            onClick={card.action}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.img} alt={card.title} className="h-full w-full object-cover" />
            <div
              className="absolute bottom-0 w-full bg-black/35 py-3 text-center text-white transition-colors duration-200"
              style={{ ["--hover-color" as string]: card.color }}
            >
              <h2 className="text-xl group-hover:!text-[var(--hover-color)]">{card.title}</h2>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
