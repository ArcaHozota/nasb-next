"use client";

// src/components/ConfirmDialog.tsx
// アプリ共通の確認ダイアログ。見た目は聖書章節入力の「上書きの確認」(shadcn/ui の AlertDialog)にそろえ、
// ボタンは常に「いいえ」「はい」にする。
//   タイトルは次の3つだけを使う:
//     登録済みのものを上書き → 「上書きの確認」
//     ログアウト・削除       → 「警告」
//     それ以外(編集内容の破棄・お知らせ・YouTube 連携の確認など) → 「お知らせ」
// モーダル(Dialog)の中から出すときは、その DialogContent の子として描画する
// (Radix が入れ子のレイヤーとして扱い、外側のモーダルを閉じずにこちらだけ閉じられる)。
import type { ReactNode } from "react";
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

export const CONFIRM_LABEL = "はい";
export const CANCEL_LABEL = "いいえ";

type Props = {
  open: boolean;
  /** Esc キー・「いいえ」・「はい」のどれで閉じても open=false で呼ばれる */
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** 「はい」を押したとき(このあと onOpenChange(false) も呼ばれる) */
  onConfirm: () => void;
  /** 「いいえ」を押したとき */
  onCancel?: () => void;
};

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="noto-serif">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{CANCEL_LABEL}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{CONFIRM_LABEL}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
