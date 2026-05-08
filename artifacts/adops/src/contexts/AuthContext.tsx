import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: "admin" | "provider" | "pitcher";
  portalSlug: string | null;
  isActive: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  setUser: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const { data, isLoading, isError } = useGetMe();

  useEffect(() => {
    if (data) {
      setUser(data as AuthUser);
    }
    if (isError) {
      setUser(null);
    }
  }, [data, isError]);

  return (
    <AuthContext.Provider value={{ user, isLoading: isLoading && !isError, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
