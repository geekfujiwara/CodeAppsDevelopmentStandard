import React, { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardPreview,
  Text,
  Title2,
  Body1,
  Spinner,
  Avatar,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  Person24Regular,
  Mail24Regular,
  Building24Regular,
} from "@fluentui/react-icons";
import type { UserProfileData } from "../types/user";

const useStyles = makeStyles({
  card: {
    width: "100%",
    maxWidth: "600px",
  },
  preview: {
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    backgroundColor: tokens.colorBrandBackground2,
  },
  details: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px",
  },
  detailRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
});

/**
 * UserProfile - Office 365 Users コネクタを使用してユーザープロフィールを表示するコンポーネント
 *
 * このコンポーネントは、Power Apps SDK を通じて Office 365 Users コネクタにアクセスし、
 * 現在のユーザーのプロフィール情報と写真を取得して表示します。
 *
 * ## 前提条件
 * - pac code add-data-source で Office 365 Users コネクタが追加済みであること
 * - src/services/Office365UsersService が生成済みであること
 *
 * ## PAC CLI セットアップ
 * ```bash
 * pac code add-data-source -a shared_office365users -c {connection-id}
 * ```
 */
export const UserProfile: React.FC = () => {
  const styles = useStyles();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        // PAC CLI で生成されたサービスを動的インポート
        // pac code add-data-source 実行後に利用可能になります
        const { Office365UsersService } = await import(
          "../services/Office365UsersService"
        );

        // ユーザープロフィールの取得
        const profileResponse = await Office365UsersService.MyProfile_V2(
          "id,displayName,jobTitle,department,mail,userPrincipalName"
        );
        const userData = profileResponse.data as UserProfileData;
        setProfile(userData);

        // ユーザー写真の取得
        try {
          const photoResponse = await Office365UsersService.UserPhoto_V2(
            userData.id
          );
          if (photoResponse.data) {
            const blob = new Blob([photoResponse.data as BlobPart], {
              type: "image/jpeg",
            });
            setPhotoUrl(URL.createObjectURL(blob));
          }
        } catch {
          // 写真が設定されていない場合はスキップ
          console.info("ユーザー写真が設定されていません");
        }
      } catch (err) {
        console.error("プロフィールの取得に失敗しました:", err);
        setError(
          err instanceof Error
            ? err
            : new Error("プロフィールの取得中にエラーが発生しました")
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, []);

  // クリーンアップ: Object URL の解放
  useEffect(() => {
    return () => {
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
      }
    };
  }, [photoUrl]);

  if (isLoading) {
    return <Spinner size="large" label="プロフィールを読み込み中..." />;
  }

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>プロフィール取得エラー</MessageBarTitle>
          {error.message}
          <br />
          <Text size={200}>
            Office 365 Users コネクタが正しく設定されているか確認してください。
          </Text>
        </MessageBarBody>
      </MessageBar>
    );
  }

  if (!profile) {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>
          <MessageBarTitle>データなし</MessageBarTitle>
          プロフィールデータが見つかりませんでした。
        </MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <Card className={styles.card}>
      <CardPreview className={styles.preview}>
        <Avatar
          name={profile.displayName}
          image={photoUrl ? { src: photoUrl } : undefined}
          size={96}
          color="brand"
        />
      </CardPreview>
      <CardHeader
        header={<Title2>{profile.displayName}</Title2>}
        description={<Body1>{profile.jobTitle ?? "役職未設定"}</Body1>}
      />
      <div className={styles.details}>
        <div className={styles.detailRow}>
          <Person24Regular />
          <Text>{profile.userPrincipalName}</Text>
        </div>
        {profile.mail && (
          <div className={styles.detailRow}>
            <Mail24Regular />
            <Text>{profile.mail}</Text>
          </div>
        )}
        {profile.department && (
          <div className={styles.detailRow}>
            <Building24Regular />
            <Text>{profile.department}</Text>
          </div>
        )}
      </div>
    </Card>
  );
};
