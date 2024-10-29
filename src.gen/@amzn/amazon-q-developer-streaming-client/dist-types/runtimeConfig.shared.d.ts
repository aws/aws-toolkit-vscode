import { QDeveloperStreamingClientConfig } from "./QDeveloperStreamingClient";
/**
 * @internal
 */
export declare const getRuntimeConfig: (config: QDeveloperStreamingClientConfig) => {
    apiVersion: string;
    base64Decoder: import("@smithy/types").Decoder;
    base64Encoder: (_input: string | Uint8Array) => string;
    disableHostPrefix: boolean;
    extensions: import("./runtimeExtensions").RuntimeExtension[];
    httpAuthSchemeProvider: import("./auth/httpAuthSchemeProvider").QDeveloperStreamingHttpAuthSchemeProvider;
    httpAuthSchemes: import("@smithy/types").HttpAuthScheme[];
    logger: import("@smithy/types").Logger;
    regionInfoProvider: import("@smithy/types").RegionInfoProvider;
    serviceId: string;
    urlParser: import("@smithy/types").UrlParser;
    utf8Decoder: import("@smithy/types").Decoder;
    utf8Encoder: (input: string | Uint8Array) => string;
};
