    const [updated] = await db
      .update(user)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(user.id, id))
      .returning();
    return updated;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update user state");
  }
}

export async function getAppSettings(): Promise<AppSetting[]> {
  try {
    return await db.select().from(appSetting);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load application settings"
    );
  }
}

export async function getAppSetting<T>(key: string): Promise<T | null> {
  try {
    const [setting] = await db
      .select()
      .from(appSetting)
      .where(eq(appSetting.key, key))
      .limit(1);
    return setting ? (setting.value as T) : null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to load application setting"
    );
  }
}

export async function setAppSetting<T>({
  key,
  value,
}: {
  key: string;
  value: T;
}) {
  try {
    await db
      .insert(appSetting)
      .values({ key, value: value as unknown, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSetting.key,
        set: {
          value: value as unknown,
          updatedAt: new Date(),
        },
      });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update application setting"
    );
  }
}

export async function listChats({
  limit = 50,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<Chat[]> {
