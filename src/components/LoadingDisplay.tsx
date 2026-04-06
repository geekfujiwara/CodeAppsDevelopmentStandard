import React from "react";
import { Spinner, makeStyles } from "@fluentui/react-components";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "48px",
    minHeight: "200px",
  },
});

interface LoadingDisplayProps {
  /** ローディング中に表示するメッセージ */
  message?: string;
  /** スピナーのサイズ */
  size?: "tiny" | "small" | "medium" | "large" | "extra-large" | "huge";
}

/**
 * LoadingDisplay - ローディング表示用の共通コンポーネント
 *
 * データ取得中やコネクタ通信中のローディング状態を統一的に表示します。
 */
export const LoadingDisplay: React.FC<LoadingDisplayProps> = ({
  message = "読み込み中...",
  size = "large",
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <Spinner size={size} label={message} />
    </div>
  );
};
