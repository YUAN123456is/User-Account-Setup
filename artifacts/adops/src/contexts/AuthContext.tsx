import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "provider" | "pitcher";
  portalSlug?: string | null;
  canAssignAccounts: boolean;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  setUser: () => {},
});

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: ReactNode }) {
  // manualUser is set immediately after login so the UI updates without waiting for a refetch
  const [manualUser, setManualUser] = useState<AuthUser | null>(null);
  const { data, isLoading, isError } = useGetMe();

  // Derive user synchronously in the same render that React Query updates —
  // this eliminates the one-render gap where isLoading=false but user=null
  // that causes the spurious redirect to /login → NotFound on refresh.
  const user = useMemo<AuthUser | null>(() => {
    if (data) return data as AuthUser;
    return manualUser;
  }, [data, manualUser]);

  // isLoading is true only while the initial fetch is in flight and we have
  // no user at all (not from server, not from a manual login).
  const contextIsLoading = isLoading && !isError && !user;

  return (
    <AuthContext.Provider value={{ user, isLoading: contextIsLoading, setUser: setManualUser }}>
      {children}
    </AuthContext.Provider>
  );
}
