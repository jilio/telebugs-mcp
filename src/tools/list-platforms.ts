import { z } from "zod";
import type { UserContext } from "../auth";
import { PLATFORM_NAMES } from "./create-project";

export const listPlatformsSchema = z.object({});

export function listPlatforms(_ctx: UserContext): object {
  return { platforms: PLATFORM_NAMES };
}
