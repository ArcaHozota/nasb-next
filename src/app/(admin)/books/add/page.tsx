"use client";

// src/app/(admin)/books/add/page.tsx
// 旧 views/BookAddition.vue を移植
import { useEffect, useRef, useState } from "react";
import { BookOpen, Book, Baseline, Pencil } from "lucide-react";
import api from "@/api/axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hint from "@/components/Hint";
import { useFeedbackStore } from "@/stores/feedback";
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

/**
 * 既存の節の確認状態
 * idle: 章・節が未確定 / loading: 確認中 / found: 登録済み(更新になる)
 * none: 未登録(新規追加になる) / error: 確認に失敗
 */
type VerseLookup = "idle" | "loading" | "found" | "none" | "error";

/** 章・節を入力してから既存の節を問い合わせるまでの待ち時間(ms) */
const LOOKUP_DELAY = 300;

const required = (v: string) => !!v && v.trim() !== EMPTY_STRING;

export default function BookAddition() {
  const feedback = useFeedbackStore();

  const [books, setBooks] = useState<BookOrChapter[]>([]);
  const [chapters, setChapters] = useState<BookOrChapter[]>([]);
  const [bookId, setBookId] = useState<number | string>(EMPTY_STRING);
  const [chapterId, setChapterId] = useState<number | string>(EMPTY_STRING);
  const [verseId, setVerseId] = useState(EMPTY_STRING);
  const [textEn, setTextEn] = useState(EMPTY_STRING);
  const [textJp, setTextJp] = useState(EMPTY_STRING);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({
    textEn: false,
    textJp: false,
    verseId: false,
  });

  // 編集モード(既存の節を読み込んで更新する)用
  const [lookup, setLookup] = useState<VerseLookup>("idle");
  const [existing, setExisting] = useState<VerseText | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const textEnEditorRef = useRef<RedLetterEditorHandle | null>(null);
  const textJpEditorRef = useRef<RedLetterEditorHandle | null>(null);

  const booksLoaded = useRef(false);

  // 非同期の応答の中から最新の入力値を読むための写し
  const textEnRef = useRef(textEn);
  const textJpRef = useRef(textJp);
  // 既存の節からエディタへ読み込んだ内容(ユーザーが未編集かどうかの判定用)
  const loadedRef = useRef<VerseText | null>(null);

  useEffect(() => {
    textEnRef.current = textEn;
    textJpRef.current = textJp;
  }, [textEn, textJp]);

  // 初期表示: 書一覧を取得
  useEffect(() => {
    if (booksLoaded.current) return;
    booksLoaded.current = true;
    (async () => {
      try {
        const { data } = await api.get("/books");
        setBooks(data);
        if (data.length) setBookId(data[0].id);
      } catch (e: unknown) {
        feedback.toast(extractErrorMessage(e, "書の取得に失敗しました"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 書が変わったら章を取り直す(連動の核心)
  useEffect(() => {
    setChapterId(EMPTY_STRING);
    setChapters([]);
    if (!bookId) return;
    setChapterLoading(true);
    (async () => {
      try {
        const { data } = await api.get(`/books/${bookId}/chapters`);
        setChapters(data);
        if (data.length) setChapterId(data[0].id);
      } catch (e: unknown) {
        feedback.toast(extractErrorMessage(e, "章の取得に失敗しました"));
      } finally {
        setChapterLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  // 両方の入力欄が空、または既存の節から読み込んだ内容のまま(未編集)か
  const isPristine = () => {
    const en = textEnRef.current;
    const jp = textJpRef.current;
    if (!required(en) && !required(jp)) return true;
    const loaded = loadedRef.current;
    return !!loaded && en === loaded.textEn && jp === loaded.textJp;
  };

  // 既存の節の本文を入力欄へ読み込む
  const loadExisting = (verse: VerseText) => {
    loadedRef.current = verse;
    setTextEn(verse.textEn);
    setTextJp(verse.textJp);
    setErrors((er) => ({ ...er, textEn: false, textJp: false }));
  };

  // 別の節から読み込んだままの未編集の内容は、節が変わったら消す(編集済みなら残す)
  const releaseLoaded = () => {
    const loaded = loadedRef.current;
    if (
      loaded &&
      textEnRef.current === loaded.textEn &&
      textJpRef.current === loaded.textJp
    ) {
      setTextEn(EMPTY_STRING);
      setTextJp(EMPTY_STRING);
    }
    loadedRef.current = null;
  };

  // 章・節が決まったら既存の節を探す。あれば編集モード(ボタンが「更新」になる)
  useEffect(() => {
    const verse = verseId.trim();
    setExisting(null);
    if (!chapterId || !/^\d+$/.test(verse)) {
      setLookup("idle");
      releaseLoaded();
      return;
    }
    setLookup("loading");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        // 登録済みなら1件、未登録なら空のリストが返る
        const { data } = await api.get(`/books/${chapterId}/verse`, {
          params: { verseNo: verse },
        });
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : undefined;
        if (row) {
          const found: VerseText = {
            textEn: row.textEn ?? EMPTY_STRING,
            textJp: row.textJp ?? EMPTY_STRING,
          };
          setExisting(found);
          setLookup("found");
          // 入力欄が空、または別の節から読み込んだままなら、既存の内容に置き換える
          if (isPristine()) loadExisting(found);
        } else {
          setLookup("none");
          releaseLoaded();
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setLookup("error");
        feedback.toast(extractErrorMessage(e, "既存の節の確認に失敗しました"));
      }
    }, LOOKUP_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, verseId]);

  // 入力中でも該当欄が埋まった時点でアラート(エラー表示)を消す
  const handleTextEnChange = (v: string) => {
    setTextEn(v);
    if (required(v)) setErrors((er) => ({ ...er, textEn: false }));
  };

  const handleTextJpChange = (v: string) => {
    setTextJp(v);
    if (required(v)) setErrors((er) => ({ ...er, textJp: false }));
  };

  const handleVerseIdChange = (v: string) => {
    setVerseId(v);
    if (required(v)) setErrors((er) => ({ ...er, verseId: false }));
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
      feedback.toast(typeof data === "string" ? data : "追加済み");
      loadedRef.current = null;
      setVerseId(EMPTY_STRING);
      setTextEn(EMPTY_STRING);
      setTextJp(EMPTY_STRING);
      setErrors({ textEn: false, textJp: false, verseId: false });
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const onStore = () => {
    const nextErrors = {
      textEn: !required(textEn),
      textJp: !required(textJp),
      verseId: !required(verseId),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      feedback.toast("入力情報不正");
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
  const bookName = books.find((b) => String(b.id) === String(bookId))?.name;
  const chapterName = chapters.find(
    (c) => String(c.id) === String(chapterId),
  )?.name;

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <Card className="bookaddition-card noto-serif glass-panel glass-panel--burgundy relative overflow-hidden rounded-[18px] gap-0 py-0">
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
                error={errors.textEn}
                helperText={
                  errors.textEn
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
                rippleColor="rgba(185, 28, 28, 0.2)"
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
                error={errors.textJp}
                helperText={
                  errors.textJp
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
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-2 hover:opacity-80"
                    onClick={() => loadExisting(existing)}
                  >
                    既存の内容を読み込む
                  </button>
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
                onChange={setBookId}
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
                onValueChange={setChapterId}
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
                    <Pencil className="h-4 w-4" /> 更新
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
                ? `${bookName ?? EMPTY_STRING} ${chapterName ?? EMPTY_STRING} ${verseId.trim()}節は既に登録されています。入力した内容で上書きして更新しますか?`
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
