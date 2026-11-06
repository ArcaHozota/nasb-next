"use client";

// src/app/(admin)/mainmenu/page.tsx
// 旧 views/MainMenu.vue を移植
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
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
      color: "#002fa7",
      img: "/assets/bourbon.svg",
      action: () => router.push("/hymns"),
    },
    {
      key: "random",
      title: "ランダム選択",
      color: "#006400",
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
          // 押せる面なので <button> を土台にし、見た目は Card。
          // 浮き上がり(hover)・カードごとの色の光・押したときの縮みは、group-* で Card に伝える
          <button
            key={card.key}
            type="button"
            className="group block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            style={{ ["--hover-color" as string]: card.color }}
            onClick={card.action}
          >
            <Card className="relative h-[66vh] gap-0 overflow-hidden rounded-lg border-0 py-0 shadow transition-[translate,scale,box-shadow] duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_12px_32px_color-mix(in_srgb,var(--hover-color)_45%,transparent)] group-active:scale-[0.98]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.img}
                alt={card.title}
                className="h-full w-full object-cover"
              />
              <div className="absolute bottom-0 w-full bg-black/35 py-3 text-center text-white transition-colors duration-200">
                <h2 className="text-xl group-hover:text-(--hover-color)!">
                  {card.title}
                </h2>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
