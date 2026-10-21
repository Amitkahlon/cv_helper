import { createContext } from "react";

// The names of the target roles (Profile tab), for the "tailored" CV choices.
export const RolesContext = createContext<string[]>([]);
