/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as agentsDb from "../agentsDb.js";
import type * as auth from "../auth.js";
import type * as chats from "../chats.js";
import type * as classify from "../classify.js";
import type * as classifyAction from "../classifyAction.js";
import type * as evalRunner from "../evalRunner.js";
import type * as evals from "../evals.js";
import type * as evalsDb from "../evalsDb.js";
import type * as gmail from "../gmail.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as inboxAgent from "../inboxAgent.js";
import type * as labelChanges from "../labelChanges.js";
import type * as models from "../models.js";
import type * as promptVersions from "../promptVersions.js";
import type * as prompts from "../prompts.js";
import type * as rag from "../rag.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  agentsDb: typeof agentsDb;
  auth: typeof auth;
  chats: typeof chats;
  classify: typeof classify;
  classifyAction: typeof classifyAction;
  evalRunner: typeof evalRunner;
  evals: typeof evals;
  evalsDb: typeof evalsDb;
  gmail: typeof gmail;
  http: typeof http;
  inbox: typeof inbox;
  inboxAgent: typeof inboxAgent;
  labelChanges: typeof labelChanges;
  models: typeof models;
  promptVersions: typeof promptVersions;
  prompts: typeof prompts;
  rag: typeof rag;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
