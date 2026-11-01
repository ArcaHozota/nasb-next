"use client";

// src/components/BookCombobox.tsx
// 検索付きの書セレクト(shadcn/ui の Combobox パターン = Popover + Command)。
// 聖書66巻をスクロールせず、「ヨハネ」「創」など名前の一部を打ち込んで絞り込める。
// cmdk は日本語IMEの変換中(isComposing)のEnterを無視するため、変換確定で誤選択しない。
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

type BookOption = { id: number | string; name: string };

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
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={books.length === 0}
          className={cn(
            "w-full justify-between bg-transparent px-2 text-left font-normal hover:bg-transparent focus-visible:border-primary focus-visible:ring-primary/20",
            className,
          )}
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected?.name ?? "書を選択"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
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
                    String(b.id) === String(value)
                      ? "opacity-100"
                      : "opacity-0",
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
