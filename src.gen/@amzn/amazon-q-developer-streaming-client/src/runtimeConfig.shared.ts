// smithy-typescript generated code
import { defaultRegionInfoProvider } from "./endpoints";
import { NoOpLogger } from "@aws-sdk/smithy-client";
import { parseUrl } from "@aws-sdk/url-parser";
import {
  fromBase64,
  toBase64,
} from "@aws-sdk/util-base64";
import {
  fromUtf8,
  toUtf8,
} from "@aws-sdk/util-utf8";
import { QDeveloperStreamingClientConfig } from "./QDeveloperStreamingClient";

/**
 * @internal
 */
export const getRuntimeConfig = (config: QDeveloperStreamingClientConfig) => ({
  apiVersion: "2024-06-11",
  base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  logger: config?.logger ?? new NoOpLogger(),
  regionInfoProvider: config?.regionInfoProvider ?? defaultRegionInfoProvider,
  serviceId: config?.serviceId ?? "QDeveloperStreaming",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8,
});
