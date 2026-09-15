"use client";

// src/app/(admin)/books/add/page.tsx
// 旧 views/BookAddition.vue を移植
import { useEffect, useRef, useState } from "react";
import { BookOpen, Book, Baseline, LoaderCircle } from "lucide-react";
import api from "@/api/axios";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import RedLetterEditor, { type RedLetterEditorHandle } from "@/components/RedLetterEditor";

type BookOrChapter = { id: number; name: string };

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
  const [errors, setErrors] = useState({ textEn: false, textJp: false, verseId: false });

  const textEnEditorRef = useRef<RedLetterEditorHandle | null>(null);
  const textJpEditorRef = useRef<RedLetterEditorHandle | null>(null);

  const booksLoaded = useRef(false);

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

  const onStore = async () => {
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
    setSaving(true);
    try {
      const { data } = await api.post("/books", {
        chapterId,
        id: verseId.trim(),
        textEn: textEn.trim(),
        textJp: textJp.trim(),
      });
      feedback.toast(typeof data === "string" ? data : "追加済み");
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

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/mainmenu-bg.webp" alt="" className="h-full w-full object-cover" />
      </div>

      <div className="bookaddition-card noto-serif glass-panel glass-panel--burgundy relative overflow-hidden rounded-[18px]">
        <div className="noto-serif flex items-center bg-gray-800 px-4 py-3 text-white">
          <BookOpen className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">聖書章節入力</h1>
        </div>

        <div className="p-6">
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
                  errors.textEn ? "上記の入力ボックスを空になってはいけません。" : undefined
                }
              />
            </div>
          </div>

          <div className="mb-2 flex justify-start pl-16">
            <button
              type="button"
              className="rounded-full p-2 text-red-700 hover:bg-red-50"
              title="選択範囲を赤文字にする(再押下で解除)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onWrapSelection}
            >
              <Baseline className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-6 flex items-start gap-4">
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
                  errors.textJp ? "上記の入力ボックスを空になってはいけません。" : undefined
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <div className="w-full md:w-[22%]">
              <label className="noto-serif mb-1 block text-sm text-gray-600">書</label>
              <select
                value={bookId}
                onChange={(e) => setBookId(e.target.value)}
                className="noto-serif h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              >
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-[30%]">
              <label className="noto-serif mb-1 flex items-center gap-1 text-sm text-gray-600">
                章
                {chapterLoading && <LoaderCircle className="inline-block h-3 w-3 animate-spin" />}
              </label>
              <select
                value={chapterId}
                onChange={(e) => setChapterId(e.target.value)}
                className="noto-serif h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-[22%]">
              <label className="noto-serif mb-1 block text-sm text-gray-600">節</label>
              <input
                value={verseId}
                type="text"
                placeholder="節の数を入力しましょう"
                className={`noto-serif h-9 w-full rounded-md border px-2 text-sm outline-none ${errors.verseId ? "border-red-400" : "border-gray-300 focus:border-primary"}`}
                onChange={(e) => handleVerseIdChange(e.target.value)}
              />
              {errors.verseId && (
                <p className="mt-1 text-xs text-red-600">上記の入力ボックスを空になってはいけません。</p>
              )}
            </div>

            <div className="w-full md:w-[16%]">
              <label className="mb-1 block text-sm text-transparent">追加</label>
              <button
                type="button"
                className="noto-serif h-9 w-full rounded-md bg-primary text-sm font-medium text-white disabled:opacity-60"
                disabled={saving}
                onClick={onStore}
              >
                {saving ? (
                  <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center justify-center gap-1">
                    <Book className="h-4 w-4" /> 追加
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
