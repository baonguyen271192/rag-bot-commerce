import { createContext, useContext } from 'react';

export const ClientsContext = createContext(null);

export function useClients() {
  const clients = useContext(ClientsContext);
  if (!clients) {
    throw new Error('useClients must be used within a ClientsContext.Provider');
  }
  return clients;
}
