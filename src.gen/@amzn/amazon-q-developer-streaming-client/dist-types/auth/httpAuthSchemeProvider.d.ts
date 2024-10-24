import { QDeveloperStreamingClientResolvedConfig } from "../QDeveloperStreamingClient";
import { AwsSdkSigV4AuthInputConfig, AwsSdkSigV4AuthResolvedConfig, AwsSdkSigV4PreviouslyResolved } from "@aws-sdk/core";
import { HandlerExecutionContext, HttpAuthScheme, HttpAuthSchemeParameters, HttpAuthSchemeParametersProvider, HttpAuthSchemeProvider } from "@smithy/types";
/**
 * @internal
 */
export interface QDeveloperStreamingHttpAuthSchemeParameters extends HttpAuthSchemeParameters {
    region?: string;
}
/**
 * @internal
 */
export interface QDeveloperStreamingHttpAuthSchemeParametersProvider extends HttpAuthSchemeParametersProvider<QDeveloperStreamingClientResolvedConfig, HandlerExecutionContext, QDeveloperStreamingHttpAuthSchemeParameters, object> {
}
/**
 * @internal
 */
export declare const defaultQDeveloperStreamingHttpAuthSchemeParametersProvider: (config: QDeveloperStreamingClientResolvedConfig, context: HandlerExecutionContext, input: object) => Promise<QDeveloperStreamingHttpAuthSchemeParameters>;
/**
 * @internal
 */
export interface QDeveloperStreamingHttpAuthSchemeProvider extends HttpAuthSchemeProvider<QDeveloperStreamingHttpAuthSchemeParameters> {
}
/**
 * @internal
 */
export declare const defaultQDeveloperStreamingHttpAuthSchemeProvider: QDeveloperStreamingHttpAuthSchemeProvider;
/**
 * @internal
 */
export interface HttpAuthSchemeInputConfig extends AwsSdkSigV4AuthInputConfig {
    /**
     * Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.
     * @internal
     */
    httpAuthSchemes?: HttpAuthScheme[];
    /**
     * Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.
     * @internal
     */
    httpAuthSchemeProvider?: QDeveloperStreamingHttpAuthSchemeProvider;
}
/**
 * @internal
 */
export interface HttpAuthSchemeResolvedConfig extends AwsSdkSigV4AuthResolvedConfig {
    /**
     * Configuration of HttpAuthSchemes for a client which provides default identity providers and signers per auth scheme.
     * @internal
     */
    readonly httpAuthSchemes: HttpAuthScheme[];
    /**
     * Configuration of an HttpAuthSchemeProvider for a client which resolves which HttpAuthScheme to use.
     * @internal
     */
    readonly httpAuthSchemeProvider: QDeveloperStreamingHttpAuthSchemeProvider;
}
/**
 * @internal
 */
export declare const resolveHttpAuthSchemeConfig: <T>(config: T & HttpAuthSchemeInputConfig & AwsSdkSigV4PreviouslyResolved) => T & HttpAuthSchemeResolvedConfig;
