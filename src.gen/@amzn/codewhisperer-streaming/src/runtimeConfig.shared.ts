// smithy-typescript generated code
import { defaultCodeWhispererStreamingHttpAuthSchemeProvider } from "./auth/httpAuthSchemeProvider";
import { defaultRegionInfoProvider } from "./endpoints";
import { HttpBearerAuthSigner } from "@smithy/core";
import { NoOpLogger } from "@smithy/smithy-client";
import { IdentityProviderConfig } from "@smithy/types";
import { parseUrl } from "@smithy/url-parser";
import {
  fromBase64,
  toBase64,
} from "@smithy/util-base64";
import {
  fromUtf8,
  toUtf8,
} from "@smithy/util-utf8";
import { CodeWhispererStreamingClientConfig } from "./CodeWhispererStreamingClient";

/**
 * @internal
 */
export const getRuntimeConfig = (config: CodeWhispererStreamingClientConfig) => {
  return {
    apiVersion: "2023-11-27",
      base64Decoder: config?.base64Decoder ?? fromBase64,
  base64Encoder: config?.base64Encoder ?? toBase64,
  disableHostPrefix: config?.disableHostPrefix ?? false,
  extensions: config?.extensions ?? [],
  httpAuthSchemeProvider: config?.httpAuthSchemeProvider ?? defaultCodeWhispererStreamingHttpAuthSchemeProvider,
  httpAuthSchemes: config?.httpAuthSchemes ?? [{
        schemeId: "smithy.api#httpBearerAuth",
        identityProvider: (ipc: IdentityProviderConfig) =>
          ipc.getIdentityProvider("smithy.api#httpBearerAuth"),
        signer: new HttpBearerAuthSigner(),
      }],
  logger: config?.logger ?? new NoOpLogger(),
  regionInfoProvider: config?.regionInfoProvider ?? defaultRegionInfoProvider,
  serviceId: config?.serviceId ?? "CodeWhispererStreaming",
  urlParser: config?.urlParser ?? parseUrl,
  utf8Decoder: config?.utf8Decoder ?? fromUtf8,
  utf8Encoder: config?.utf8Encoder ?? toUtf8,
  }
};
