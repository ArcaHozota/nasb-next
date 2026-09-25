"use client";

// src/components/BookCombobox.tsx
// 検索付きの書セレクト(shadcn/ui の Combobox パターン = Popover + Command)。
// 聖書66巻をスクロールせず、「ヨハネ」「創」など名前の一部を打ち込んで絞り込める。
// cmdk は日本語IMEの変換中(isComposing)のEnterを無視するため、変換確定で誤選択しない。
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type BookOption = { id: number | string; name: string };

type Props = {
  id?: string;
  books: BookOption[];
  value: number | string;
  onChange: (id: number | string) => void;
  className?: string;
};

export default function BookCombobox({
  id,
  books,
  value,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = books.find((b) => String(b.id) === String(value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={books.length === 0}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2 text-left text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.name ?? "書を選択"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
      >
        <Command className={className}>
          <CommandInput placeholder="書名で検索…" />
          <CommandList className="max-h-72">
            <CommandEmpty>該当する書がありません</CommandEmpty>
            {books.map((b) => (
              <CommandItem
                key={b.id}
                // 検索対象は書名。書名は一意なので value に使える。
                value={b.name}
                onSelect={() => {
                  onChange(b.id);
                  setOpen(false);
                }}
              >
                {b.name}
                <Check
                  className={cn(
                    "ml-auto text-primary",
                    String(b.id) === String(value) ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
