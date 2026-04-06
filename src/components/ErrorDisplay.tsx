import React from "react";
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Button,
  makeStyles,
} from "@fluentui/react-components";
import { ArrowClockwise24Regular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    padding: "24px",
  },
});

interface ErrorDisplayProps {
  /** エラーオブジェクト */
  error: Error;
  /** リトライ可能な場合のコールバック */
  onRetry?: () => void;
  /** エラーの発生箇所を示すラベル */
  label?: string;
}

/**
 * ErrorDisplay - エラー表示用の共通コンポーネント
 *
 * コネクタ操作やデータ取得時のエラーを統一的に表示します。
 * リトライ機能をオプションで提供できます。
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  label = "エラーが発生しました",
}) => {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>{label}</MessageBarTitle>
          {error.message}
        </MessageBarBody>
      </MessageBar>
      {onRetry && (
        <Button
          appearance="primary"
          icon={<ArrowClockwise24Regular />}
          onClick={onRetry}
        >
          再試行
        </Button>
      )}
    </div>
  );
};
