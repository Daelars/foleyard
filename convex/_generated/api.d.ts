/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as blog from "../blog.js";
import type * as crons from "../crons.js";
import type * as downloads from "../downloads.js";
import type * as http from "../http.js";
import type * as launch from "../launch.js";
import type * as launchAction from "../launchAction.js";
import type * as launchEmail from "../launchEmail.js";
import type * as launchHelpers from "../launchHelpers.js";
import type * as signupEmail from "../signupEmail.js";
import type * as signupHttp from "../signupHttp.js";
import type * as signups from "../signups.js";
import type * as site from "../site.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  blog: typeof blog;
  crons: typeof crons;
  downloads: typeof downloads;
  http: typeof http;
  launch: typeof launch;
  launchAction: typeof launchAction;
  launchEmail: typeof launchEmail;
  launchHelpers: typeof launchHelpers;
  signupEmail: typeof signupEmail;
  signupHttp: typeof signupHttp;
  signups: typeof signups;
  site: typeof site;
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

export declare const components: {};
