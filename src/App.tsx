import React from "react";
import {
  Spinner,
  Title1,
  Text,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { usePower } from "./PowerProvider";
import { UserProfile } from "./components/UserProfile";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  header: {
    width: "100%",
    padding: "16px 24px",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  headerTitle: {
    color: tokens.colorNeutralForegroundOnBrand,
  },
  content: {
    width: "100%",
    maxWidth: "960px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    gap: "16px",
  },
});

/**
 * App - メインアプリケーションコンポーネント
 *
 * Power Platform SDK の初期化状態に応じて、
 * ローディング / エラー / メインコンテンツ を切り替えて表示します。
 */
const App: React.FC = () => {
  const styles = useStyles();
  const { isInitialized, isLoading, error } = usePower();

  // SDK 初期化中のローディング表示
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Spinner size="extra-large" label="Power Platform に接続中..." />
      </div>
    );
  }

  // SDK 初期化エラーの表示
  if (error) {
    return (
      <div className={styles.loadingContainer}>
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>初期化エラー</MessageBarTitle>
            {error.message}
          </MessageBarBody>
        </MessageBar>
        <Text>
          Power Platform SDK の初期化に失敗しました。
          接続設定を確認してください。
        </Text>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <img src="./assets/logo.svg" alt="Logo" width={32} height={32} />
        <Title1 className={styles.headerTitle}>Power Apps Code App</Title1>
      </header>
      <main className={styles.content}>
        {isInitialized ? (
          <UserProfile />
        ) : (
          <MessageBar intent="warning">
            <MessageBarBody>
              <MessageBarTitle>未初期化</MessageBarTitle>
              Power Platform SDK がまだ初期化されていません。
            </MessageBarBody>
          </MessageBar>
        )}
      </main>
    </div>
  );
};

export default App;
