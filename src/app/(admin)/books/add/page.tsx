"use client";

// src/app/(admin)/books/add/page.tsx
// 旧 views/BookAddition.vue を移植
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Book, Baseline, Cross } from "lucide-react";
import api from "@/api/axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hint from "@/components/Hint";
import { useFeedbackStore } from "@/stores/feedback";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import PageBackground from "@/components/PageBackground";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import RedLetterEditor, {
  type RedLetterEditorHandle,
} from "@/components/RedLetterEditor";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BookCombobox from "@/components/BookCombobox";

type BookOrChapter = { id: number; name: string };

/** 既存の節の本文(エディタに入れる形。英語の末尾の # は改行フラグを表す) */
type VerseText = { textEn: string; textJp: string };

/** 既存の節(VerseDTO の name は「章名:節番号」の表記。例: Psalms 23:1) */
type ExistingVerse = VerseText & { name: string };

/**
 * 既存の節の確認状態
 * idle: 章・節が未確定 / loading: 確認中 / found: 登録済み(更新になる)
 * none: 未登録(新規追加になる) / error: 確認に失敗
 */
type VerseLookup = "idle" | "loading" | "found" | "none" | "error";

/** 章・節を入力してから既存の節を問い合わせるまでの待ち時間(ms) */
const LOOKUP_DELAY = 300;

/** 空・空白だけでないか */
const isFilled = (v: string) => !!v && v.trim() !== EMPTY_STRING;

/** 書・章の一覧は変わらないので、一度取得したら再取得しない */
const STATIC_LIST = { staleTime: Infinity } as const;
const NO_BOOKS: BookOrChapter[] = [];

export default function BookAddition() {
  const toast = useFeedbackStore((s) => s.toast);

  // ユーザーが選んだ書・章。未選択(または一覧に無い)ときは先頭を使う(下の effectiveXxx)
  const [pickedBookId, setPickedBookId] = useState<number | string>(
    EMPTY_STRING,
  );
  const [pickedChapterId, setPickedChapterId] = useState<number | string>(
    EMPTY_STRING,
  );
  const [verseId, setVerseId] = useState(EMPTY_STRING);
  // ユーザーが入力した本文。null の間は「既存の節の本文(あれば)」を表示する
  const [edited, setEdited] = useState<VerseText | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({
    textEn: false,
    textJp: false,
    verseId: false,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);

  const textEnEditorRef = useRef<RedLetterEditorHandle | null>(null);
  const textJpEditorRef = useRef<RedLetterEditorHandle | null>(null);

  // ===== 書・章(切り替えの競合は、クエリキーが書ごとに分かれることで起きない) =====
  const booksQuery = useQuery({
    queryKey: ["books"],
    queryFn: async () => (await api.get<BookOrChapter[]>("/books")).data,
    ...STATIC_LIST,
  });
  const books = booksQuery.data ?? NO_BOOKS;
  const bookId = pickedBookId || books[0]?.id || EMPTY_STRING;

  const chaptersQuery = useQuery({
    queryKey: ["chapters", String(bookId)],
    queryFn: async () =>
      (await api.get<BookOrChapter[]>(`/books/${bookId}/chapters`)).data,
    enabled: !!bookId,
    ...STATIC_LIST,
  });
  const chapters = chaptersQuery.data ?? NO_BOOKS;
  const chapterLoading = !!bookId && chaptersQuery.isPending;
  const chapterId = chapters.some(
    (c) => String(c.id) === String(pickedChapterId),
  )
    ? pickedChapterId
    : (chapters[0]?.id ?? EMPTY_STRING);

  const onBookChange = (id: number | string) => {
    setPickedBookId(id);
    setPickedChapterId(EMPTY_STRING); // 書が変わったら章は先頭に戻す
  };

  useEffect(() => {
    if (booksQuery.error) {
      toast(extractErrorMessage(booksQuery.error, "書の取得に失敗しました"));
    }
  }, [booksQuery.error, toast]);
  useEffect(() => {
    if (chaptersQuery.error) {
      toast(extractErrorMessage(chaptersQuery.error, "章の取得に失敗しました"));
    }
  }, [chaptersQuery.error, toast]);

  // ===== 既存の節の確認(章・節を入力して一定時間たったら問い合わせる) =====
  // 登録済みなら編集モード(ボタンが「更新」になり、本文を読み込む)
  const lookupVerse = verseId.trim();
  const lookupReady = !!chapterId && /^\d+$/.test(lookupVerse);
  const lookupKey = `${chapterId}|${lookupVerse}`;
  const debouncedKey = useDebouncedValue(lookupKey, LOOKUP_DELAY);
  const verseQuery = useQuery({
    queryKey: ["verse", debouncedKey],
    queryFn: async (): Promise<ExistingVerse | null> => {
      const [chapter, verse] = debouncedKey.split("|");
      // 登録済みなら1件、未登録なら空のリストが返る
      const { data } = await api.get(`/books/${chapter}/verse`, {
        params: { verseNo: verse },
      });
      const row = Array.isArray(data) ? data[0] : undefined;
      return row
        ? {
            name: row.name ?? EMPTY_STRING,
            textEn: row.textEn ?? EMPTY_STRING,
            textJp: row.textJp ?? EMPTY_STRING,
          }
        : null;
    },
    enabled: lookupReady && debouncedKey === lookupKey,
    gcTime: 0, // 節の内容は他の人が更新するかもしれないので、キャッシュは残さない
  });
  const lookup: VerseLookup = !lookupReady
    ? "idle"
    : debouncedKey !== lookupKey
      ? "loading" // 入力が落ち着くのを待っている
      : verseQuery.isError
        ? "error"
        : verseQuery.isPending
          ? "loading"
          : verseQuery.data
            ? "found"
            : "none";
  const existing = lookup === "found" ? (verseQuery.data ?? null) : null;

  useEffect(() => {
    if (verseQuery.error) {
      toast(
        extractErrorMessage(verseQuery.error, "既存の節の確認に失敗しました"),
      );
    }
  }, [verseQuery.error, toast]);

  // 画面に出す本文: 入力済みならそれ、未入力なら既存の節の本文(無ければ空)
  const textEn = edited ? edited.textEn : (existing?.textEn ?? EMPTY_STRING);
  const textJp = edited ? edited.textJp : (existing?.textJp ?? EMPTY_STRING);

  // 編集内容があるか。本文が空、または既存の節から読み込んだままの未編集なら、なし。
  // 編集内容があるまま、タブを閉じる・再読み込み・別サイトへ移動しようとしたらブラウザが確認する。
  // 画面内の移動は (admin)/layout.tsx 側で確認する(useUnsavedGuard の dirty を見る)。
  const isDirty =
    (isFilled(textEn) || isFilled(textJp)) &&
    !(existing && textEn === existing.textEn && textJp === existing.textJp);
  useUnsavedChanges(isDirty);

  // 入力中でも該当欄が埋まった時点でアラート(エラー表示)を消す
  const changeText = (next: Partial<VerseText>) => {
    const value: VerseText = { textEn, textJp, ...next };
    // 両方空になったら「未入力」に戻す(節を変えたとき既存の本文が読み込まれる)
    setEdited(isFilled(value.textEn) || isFilled(value.textJp) ? value : null);
  };

  const handleTextEnChange = (v: string) => {
    changeText({ textEn: v });
    if (isFilled(v)) setErrors((er) => ({ ...er, textEn: false }));
  };

  const handleTextJpChange = (v: string) => {
    changeText({ textJp: v });
    if (isFilled(v)) setErrors((er) => ({ ...er, textJp: false }));
  };

  const handleVerseIdChange = (v: string) => {
    setVerseId(v);
    if (isFilled(v)) setErrors((er) => ({ ...er, verseId: false }));
  };

  // 既存の節の本文を入力欄へ読み込む(入力済みの内容は捨てる)
  const loadExisting = () => {
    setEdited(null);
    setErrors((er) => ({ ...er, textEn: false, textJp: false }));
  };

  const onWrapSelection = () => {
    textEnEditorRef.current?.wrapSelection();
    textJpEditorRef.current?.wrapSelection();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.post("/books", {
        chapterId,
        id: verseId.trim(),
        textEn: textEn.trim(),
        textJp: textJp.trim(),
      });
      toast(typeof data === "string" ? data : "追加済み");
      setVerseId(EMPTY_STRING);
      setEdited(null);
      setErrors({ textEn: false, textJp: false, verseId: false });
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const onStore = () => {
    const nextErrors = {
      textEn: !isFilled(textEn),
      textJp: !isFilled(textJp),
      verseId: !isFilled(verseId),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      toast("入力情報不正");
      return;
    }
    // 登録済み(更新になる)場合、または既存かどうか確認できなかった場合は、上書き確認を出す
    if (lookup === "found" || lookup === "error") {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  };

  const isUpdate = lookup === "found";
  // 入力内容が既存の節と違う(「既存の内容を読み込む」を出す)か
  const differsFromExisting =
    !!existing && (existing.textEn !== textEn || existing.textJp !== textJp);
  // 確認ダイアログに出す節の表記は VerseDTO の name を使う(無ければ入力値で代替)
  const verseLabel = existing?.name || `${verseId.trim()}節`;

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <PageBackground src="/assets/mainmenu-bg.webp" />

      <Card className="bookaddition-card noto-serif glass-panel relative overflow-hidden rounded-[18px] gap-0 py-0">
        <CardHeader className="gap-0 noto-serif flex items-center bg-gray-800 px-4 py-3 text-white">
          <BookOpen className="mr-2 h-5 w-5" />
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-lg leading-normal"
          >
            聖書章節入力
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <div className="mb-2 flex items-start gap-4">
            <div className="label-text w-16 shrink-0 pt-2 text-right text-[0.95rem] font-semibold">
              英語
            </div>
            <div className="flex-1">
              <RedLetterEditor
                ref={textEnEditorRef}
                value={textEn}
                onChange={handleTextEnChange}
                error={errors.textEn && !isFilled(textEn)}
                helperText={
                  errors.textEn && !isFilled(textEn)
                    ? "上記の入力ボックスを空になってはいけません。"
                    : undefined
                }
              />
            </div>
          </div>

          <div className="mb-2 flex justify-start pl-16">
            <Hint label="選択範囲を赤文字にする(再押下で解除)">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-red-700 hover:bg-red-50 hover:text-red-700"
                aria-label="選択範囲を赤文字にする"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onWrapSelection}
              >
                <Baseline className="size-5" />
              </Button>
            </Hint>
          </div>

          <div className="mb-3 flex items-start gap-4">
            <div className="label-text w-16 shrink-0 pt-2 text-right text-[0.95rem] font-semibold">
              日本語
            </div>
            <div className="flex-1">
              <RedLetterEditor
                ref={textJpEditorRef}
                value={textJp}
                onChange={handleTextJpChange}
                error={errors.textJp && !isFilled(textJp)}
                helperText={
                  errors.textJp && !isFilled(textJp)
                    ? "上記の入力ボックスを空になってはいけません。"
                    : undefined
                }
              />
            </div>
          </div>

          {/* 既存の節の確認状況(行の高さが変わらないよう min-h を確保) */}
          <div
            className="noto-serif mb-3 min-h-6 pl-20 text-sm"
            aria-live="polite"
          >
            {lookup === "loading" && (
              <span className="text-gray-500">既存の節を確認中…</span>
            )}
            {lookup === "found" && (
              <span className="text-red-700">
                この節は登録済みです。保存すると上書き更新されます。
                {differsFromExisting && existing && (
                  <Button
                    type="button"
                    variant="link"
                    className="ml-2 h-auto p-0 text-inherit underline hover:opacity-80"
                    onClick={loadExisting}
                  >
                    既存の内容を読み込む
                  </Button>
                )}
              </span>
            )}
            {lookup === "error" && (
              <span className="text-red-700">
                既存の節かどうか確認できませんでした。保存時に確認します。
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <Field className="w-full md:w-[22%] gap-1.5">
              <FieldLabel
                htmlFor="book-select"
                className="noto-serif font-normal text-gray-600"
              >
                書
              </FieldLabel>
              <BookCombobox
                id="book-select"
                books={books}
                value={bookId}
                onChange={onBookChange}
                className="noto-serif"
              />
            </Field>

            <Field className="w-full md:w-[30%] gap-1.5">
              <FieldLabel
                htmlFor="chapter-select"
                className="noto-serif gap-1 font-normal text-gray-600"
              >
                章{chapterLoading && <Spinner className="size-3" />}
              </FieldLabel>
              <Select
                value={String(chapterId)}
                onValueChange={setPickedChapterId}
                disabled={chapterLoading || chapters.length === 0}
              >
                <SelectTrigger
                  id="chapter-select"
                  className="noto-serif w-full px-2 focus-visible:border-primary focus-visible:ring-primary/20"
                >
                  <SelectValue placeholder="章を選択" />
                </SelectTrigger>
                {/* 詩篇(150章)でも画面を覆い尽くさないよう高さを抑える */}
                <SelectContent className="noto-serif max-h-72">
                  {chapters.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={String(c.id)}
                      // 先頭文字によるタイプアヘッドは「第」で始まる章名だと効かないため、
                      // 章番号(「第23章」→「23」)で照合させる。数字キーで章へジャンプできる。
                      textValue={c.name.replace(/\D/g, "") || c.name}
                    >
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field className="w-full md:w-[22%] gap-1.5">
              <FieldLabel
                htmlFor="verse-input"
                className="noto-serif font-normal text-gray-600"
              >
                節
              </FieldLabel>
              <Input
                id="verse-input"
                value={verseId}
                type="text"
                placeholder="節の数を入力しましょう"
                aria-invalid={!!errors.verseId}
                aria-describedby={
                  errors.verseId ? "verse-input-error" : undefined
                }
                className="noto-serif px-2 not-aria-invalid:focus-visible:border-primary not-aria-invalid:focus-visible:ring-primary/20"
                onChange={(e) => handleVerseIdChange(e.target.value)}
              />
              {errors.verseId && (
                <FieldError id="verse-input-error" className="text-xs">
                  上記の入力ボックスを空になってはいけません。
                </FieldError>
              )}
            </Field>

            {/*
              ボタンも他の列と同じ Field + FieldLabel の構造にする。
              ラベルは見えないだけで同じ高さ・同じ間隔を取るので、入力欄・プルダウンと
              ボタンが同じ行に揃う(以前は別寸法の見えないラベルで約5pxずれていた)。
              狭い画面(縦積み)ではラベルの分の空きを作らない。
            */}
            <Field className="w-full md:w-[16%] gap-1.5">
              <FieldLabel
                aria-hidden="true"
                className="noto-serif invisible font-normal max-md:hidden"
              >
                追加
              </FieldLabel>
              <Button
                className="noto-serif w-full"
                type="button"
                disabled={saving || lookup === "loading"}
                onClick={onStore}
              >
                {saving ? (
                  <Spinner />
                ) : isUpdate ? (
                  <span className="flex items-center justify-center gap-1">
                    <Cross className="h-4 w-4" /> 更新
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <Book className="h-4 w-4" /> 追加
                  </span>
                )}
              </Button>
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* 上書き確認 */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="noto-serif">
          <AlertDialogHeader>
            <AlertDialogTitle>上書きの確認</AlertDialogTitle>
            <AlertDialogDescription>
              {isUpdate
                ? `${verseLabel} は既に登録されています。入力した内容で上書きして更新しますか?`
                : "既存の節かどうか確認できませんでした。既に登録されている場合は上書きされます。保存しますか?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doSave()}>
              {isUpdate ? "更新する" : "保存する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
