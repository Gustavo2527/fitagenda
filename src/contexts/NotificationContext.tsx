import { createContext, useContext } from "react";

interface NotificationContextType {
  rescheduleToday: () => void;
}

export const NotificationContext = createContext<NotificationContextType>({
  rescheduleToday: () => {},
});

export const useNotificationActions = () => useContext(NotificationContext);
