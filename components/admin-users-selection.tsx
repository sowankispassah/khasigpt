"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AdminUserDeleteDialog } from "@/components/admin-user-delete-dialog";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";

type AdminUsersSelectionContextValue = {
  allVisibleUsersSelected: boolean;
  clearSelection: () => void;
  openBulkDeleteDialog: () => void;
  registerVisibleUserIds: (userIds: string[]) => void;
  selectedCount: number;
  selectedUserIds: string[];
  someVisibleUsersSelected: boolean;
  toggleSelectAllVisibleUsers: () => void;
  toggleUser: (userId: string) => void;
  isUserSelected: (userId: string) => boolean;
  selectableUserCount: number;
};

const EMPTY_SELECTION_CONTEXT: AdminUsersSelectionContextValue = {
  allVisibleUsersSelected: false,
  clearSelection: () => {},
  openBulkDeleteDialog: () => {},
  registerVisibleUserIds: () => {},
  selectedCount: 0,
  selectedUserIds: [],
  someVisibleUsersSelected: false,
  toggleSelectAllVisibleUsers: () => {},
  toggleUser: () => {},
  isUserSelected: () => false,
  selectableUserCount: 0,
};

const AdminUsersSelectionContext =
  createContext<AdminUsersSelectionContextValue>(EMPTY_SELECTION_CONTEXT);

export function AdminUsersSelectionProvider({
  children,
  currentUserId,
  initialUserIds,
  scopeKey,
}: PropsWithChildren<{
  currentUserId: string | undefined;
  initialUserIds: string[];
  scopeKey: string;
}>) {
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    () => new Set()
  );
  const [registeredUserIds, setRegisteredUserIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const visibleUserIds = useMemo(
    () =>
      Array.from(new Set([...initialUserIds, ...registeredUserIds])).filter(
        (userId) => userId !== currentUserId
      ),
    [currentUserId, initialUserIds, registeredUserIds]
  );
  useEffect(() => {
    if (scopeKey) {
      setSelectedUserIds(new Set());
      setRegisteredUserIds([]);
      setBulkDeleteDialogOpen(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    const visibleIds = new Set(visibleUserIds);
    setSelectedUserIds((current) => {
      const next = new Set(
        Array.from(current).filter((userId) => visibleIds.has(userId))
      );
      return next.size === current.size ? current : next;
    });
  }, [visibleUserIds]);

  const registerVisibleUserIds = useCallback((userIds: string[]) => {
    if (userIds.length === 0) {
      return;
    }
    setRegisteredUserIds((current) => {
      const next = Array.from(new Set([...current, ...userIds]));
      return next.length === current.length ? current : next;
    });
  }, []);

  const toggleUser = useCallback((userId: string) => {
    if (userId === currentUserId) {
      return;
    }
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }, [currentUserId]);

  const clearSelection = useCallback(() => {
    setSelectedUserIds(new Set());
  }, []);

  const toggleSelectAllVisibleUsers = useCallback(() => {
    setSelectedUserIds((current) => {
      const allSelected =
        visibleUserIds.length > 0 &&
        visibleUserIds.every((userId) => current.has(userId));
      return allSelected ? new Set() : new Set(visibleUserIds);
    });
  }, [visibleUserIds]);

  const openBulkDeleteDialog = useCallback(() => {
    if (selectedUserIds.size > 0) {
      setBulkDeleteDialogOpen(true);
    }
  }, [selectedUserIds.size]);

  const selectedUserIdList = useMemo(
    () => visibleUserIds.filter((userId) => selectedUserIds.has(userId)),
    [selectedUserIds, visibleUserIds]
  );
  const allVisibleUsersSelected =
    visibleUserIds.length > 0 &&
    visibleUserIds.every((userId) => selectedUserIds.has(userId));
  const someVisibleUsersSelected =
    selectedUserIdList.length > 0 && !allVisibleUsersSelected;

  const contextValue = useMemo<AdminUsersSelectionContextValue>(
    () => ({
      allVisibleUsersSelected,
      clearSelection,
      openBulkDeleteDialog,
      registerVisibleUserIds,
      selectedCount: selectedUserIdList.length,
      selectedUserIds: selectedUserIdList,
      someVisibleUsersSelected,
      toggleSelectAllVisibleUsers,
      toggleUser,
      isUserSelected: (userId: string) => selectedUserIds.has(userId),
      selectableUserCount: visibleUserIds.length,
    }),
    [
      allVisibleUsersSelected,
      clearSelection,
      openBulkDeleteDialog,
      registerVisibleUserIds,
      selectedUserIdList,
      selectedUserIds,
      someVisibleUsersSelected,
      toggleSelectAllVisibleUsers,
      toggleUser,
      visibleUserIds.length,
    ]
  );

  return (
    <AdminUsersSelectionContext.Provider value={contextValue}>
      {children}
      <AdminUserDeleteDialog
        bulk
        onDeleted={clearSelection}
        onOpenChange={setBulkDeleteDialogOpen}
        open={bulkDeleteDialogOpen}
        userIds={selectedUserIdList}
      />
    </AdminUsersSelectionContext.Provider>
  );
}

export function useAdminUsersSelection() {
  return useContext(AdminUsersSelectionContext);
}

export function AdminUsersBulkDeleteButton() {
  const { openBulkDeleteDialog, selectedCount } = useAdminUsersSelection();

  return (
    <Button
      className="cursor-pointer"
      disabled={selectedCount === 0}
      onClick={openBulkDeleteDialog}
      size="sm"
      type="button"
      variant="outline"
    >
      <EditableTranslation
        defaultText="Bulk delete"
        description="Button next to the admin user count that opens bulk deletion for selected users."
        translationKey="admin.users.bulk_delete.button"
      />
    </Button>
  );
}

export function AdminUsersSelectionCheckbox({
  disabled = false,
  email,
  userId,
}: {
  disabled?: boolean;
  email: string;
  userId: string;
}) {
  const { isUserSelected, toggleUser } = useAdminUsersSelection();

  return (
    <label className="flex cursor-pointer items-center justify-center">
      <input
        checked={isUserSelected(userId)}
        className="cursor-pointer"
        disabled={disabled}
        onChange={() => toggleUser(userId)}
        type="checkbox"
      />
      <span className="sr-only">
        <EditableTranslation
          defaultText="Select user {email}"
          description="Accessible label for selecting an individual admin user row."
          translationKey="admin.users.selection.select_user"
          values={{ email }}
        />
      </span>
    </label>
  );
}

export function AdminUsersSelectAllCheckbox() {
  const {
    allVisibleUsersSelected,
    selectableUserCount,
    someVisibleUsersSelected,
    toggleSelectAllVisibleUsers,
  } = useAdminUsersSelection();
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someVisibleUsersSelected;
    }
  }, [someVisibleUsersSelected]);

  return (
    <label className="flex cursor-pointer items-center justify-center">
      <input
        checked={allVisibleUsersSelected}
        className="cursor-pointer"
        disabled={selectableUserCount === 0}
        onChange={toggleSelectAllVisibleUsers}
        ref={checkboxRef}
        type="checkbox"
      />
      <span className="sr-only">
        <EditableTranslation
          defaultText="Select all users on this page"
          description="Accessible label for selecting all visible admin user rows."
          translationKey="admin.users.selection.select_all"
        />
      </span>
    </label>
  );
}

export function AdminUsersBulkActionBar() {
  const {
    clearSelection,
    openBulkDeleteDialog,
    selectedCount,
  } = useAdminUsersSelection();

  if (selectedCount === 0) {
    return null;
  }

  return (
    <output className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <span className="font-medium">
        <EditableTranslation
          defaultText="{count} users selected"
          description="Selected user count in the admin bulk action bar."
          translationKey="admin.users.bulk_delete.selected"
          values={{ count: selectedCount }}
        />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="cursor-pointer"
          onClick={clearSelection}
          size="sm"
          type="button"
          variant="ghost"
        >
          <EditableTranslation
            defaultText="Clear selection"
            description="Button that clears selected admin user rows."
            translationKey="admin.users.bulk_delete.clear"
          />
        </Button>
        <Button
          className="cursor-pointer"
          onClick={openBulkDeleteDialog}
          size="sm"
          type="button"
          variant="destructive"
        >
          <EditableTranslation
            defaultText="Delete selected users"
            description="Button that opens deletion confirmation for selected admin user rows."
            translationKey="admin.users.bulk_delete.delete_selected"
          />
        </Button>
      </div>
    </output>
  );
}
