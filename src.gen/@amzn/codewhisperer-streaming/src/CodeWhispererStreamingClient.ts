// smithy-typescript generated code
import {
  HttpAuthSchemeInputConfig,
  HttpAuthSchemeResolvedConfig,
  defaultCodeWhispererStreamingHttpAuthSchemeParametersProvider,
  resolveHttpAuthSchemeConfig,
} from "./auth/httpAuthSchemeProvider";
import {
  ExportResultArchiveCommandInput,
  ExportResultArchiveCommandOutput,
} from "./commands/ExportResultArchiveCommand";
import {
  GenerateAssistantResponseCommandInput,
  GenerateAssistantResponseCommandOutput,
} from "./commands/GenerateAssistantResponseCommand";
import {
  GenerateTaskAssistPlanCommandInput,
  GenerateTaskAssistPlanCommandOutput,
} from "./commands/GenerateTaskAssistPlanCommand";
import {
  SendMessageCommandInput,
  SendMessageCommandOutput,
} from "./commands/SendMessageCommand";
import { getRuntimeConfig as __getRuntimeConfig } from "./runtimeConfig";
import {
  RuntimeExtension,
  RuntimeExtensionsConfig,
  resolveRuntimeExtensions,
} from "./runtimeExtensions";
import {
  HostHeaderInputConfig,
  HostHeaderResolvedConfig,
  getHostHeaderPlugin,
  resolveHostHeaderConfig,
} from "@aws-sdk/middleware-host-header";
import { getLoggerPlugin } from "@aws-sdk/middleware-logger";
import { getRecursionDetectionPlugin } from "@aws-sdk/middleware-recursion-detection";
import {
  UserAgentInputConfig,
  UserAgentResolvedConfig,
  getUserAgentPlugin,
  resolveUserAgentConfig,
} from "@aws-sdk/middleware-user-agent";
import {
  EndpointsInputConfig,
  EndpointsResolvedConfig,
  RegionInputConfig,
  RegionResolvedConfig,
  resolveEndpointsConfig,
  resolveRegionConfig,
} from "@smithy/config-resolver";
import {
  DefaultIdentityProviderConfig,
  getHttpAuthSchemePlugin,
  getHttpSigningPlugin,
} from "@smithy/core";
import {
  EventStreamSerdeInputConfig,
  EventStreamSerdeResolvedConfig,
  resolveEventStreamSerdeConfig,
} from "@smithy/eventstream-serde-config-resolver";
import { getContentLengthPlugin } from "@smithy/middleware-content-length";
import {
  RetryInputConfig,
  RetryResolvedConfig,
  getRetryPlugin,
  resolveRetryConfig,
} from "@smithy/middleware-retry";
import { HttpHandlerUserInput as __HttpHandlerUserInput } from "@smithy/protocol-http";
import {
  Client as __Client,
  DefaultsMode as __DefaultsMode,
  SmithyConfiguration as __SmithyConfiguration,
  SmithyResolvedConfiguration as __SmithyResolvedConfiguration,
} from "@smithy/smithy-client";
import {
  Provider,
  RegionInfoProvider,
  BodyLengthCalculator as __BodyLengthCalculator,
  CheckOptionalClientConfig as __CheckOptionalClientConfig,
  ChecksumConstructor as __ChecksumConstructor,
  Decoder as __Decoder,
  Encoder as __Encoder,
  EventStreamSerdeProvider as __EventStreamSerdeProvider,
  HashConstructor as __HashConstructor,
  HttpHandlerOptions as __HttpHandlerOptions,
  Logger as __Logger,
  Provider as __Provider,
  StreamCollector as __StreamCollector,
  UrlParser as __UrlParser,
  UserAgent as __UserAgent,
} from "@smithy/types";

export { __Client }

/**
 * @public
 */
export type ServiceInputTypes =
  | ExportResultArchiveCommandInput
  | GenerateAssistantResponseCommandInput
  | GenerateTaskAssistPlanCommandInput
  | SendMessageCommandInput;

/**
 * @public
 */
export type ServiceOutputTypes =
  | ExportResultArchiveCommandOutput
  | GenerateAssistantResponseCommandOutput
  | GenerateTaskAssistPlanCommandOutput
  | SendMessageCommandOutput;

/**
 * @public
 */
export interface ClientDefaults
  extends Partial<__SmithyConfiguration<__HttpHandlerOptions>> {
  /**
   * The HTTP handler to use or its constructor options. Fetch in browser and Https in Nodejs.
   */
  requestHandler?: __HttpHandlerUserInput;

  /**
   * A constructor for a class implementing the {@link @smithy/types#ChecksumConstructor} interface
   * that computes the SHA-256 HMAC or checksum of a string or binary buffer.
   * @internal
   */
  sha256?: __ChecksumConstructor | __HashConstructor;

  /**
   * The function that will be used to convert strings into HTTP endpoints.
   * @internal
   */
  urlParser?: __UrlParser;

  /**
   * A function that can calculate the length of a request body.
   * @internal
   */
  bodyLengthChecker?: __BodyLengthCalculator;

  /**
   * A function that converts a stream into an array of bytes.
   * @internal
   */
  streamCollector?: __StreamCollector;

  /**
   * The function that will be used to convert a base64-encoded string to a byte array.
   * @internal
   */
  base64Decoder?: __Decoder;

  /**
   * The function that will be used to convert binary data to a base64-encoded string.
   * @internal
   */
  base64Encoder?: __Encoder;

  /**
   * The function that will be used to convert a UTF8-encoded string to a byte array.
   * @internal
   */
  utf8Decoder?: __Decoder;

  /**
   * The function that will be used to convert binary data to a UTF-8 encoded string.
   * @internal
   */
  utf8Encoder?: __Encoder;

  /**
   * The runtime environment.
   * @internal
   */
  runtime?: string;

  /**
   * Disable dynamically changing the endpoint of the client based on the hostPrefix
   * trait of an operation.
   */
  disableHostPrefix?: boolean;

  /**
   * Unique service identifier.
   * @internal
   */
  serviceId?: string;

  /**
   * Enables IPv6/IPv4 dualstack endpoint.
   */
  useDualstackEndpoint?: boolean | __Provider<boolean>;

  /**
   * Enables FIPS compatible endpoints.
   */
  useFipsEndpoint?: boolean | __Provider<boolean>;

  /**
   * The AWS region to which this client will send requests
   */
  region?: string | __Provider<string>;

  /**
   * Fetch related hostname, signing name or signing region with given region.
   * @internal
   */
  regionInfoProvider?: RegionInfoProvider;

  /**
   * The provider populating default tracking information to be sent with `user-agent`, `x-amz-user-agent` header
   * @internal
   */
  defaultUserAgentProvider?: Provider<__UserAgent>;

  /**
   * Value for how many times a request will be made at most in case of retry.
   */
  maxAttempts?: number | __Provider<number>;

  /**
   * Specifies which retry algorithm to use.
   * @see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-smithy-util-retry/Enum/RETRY_MODES/
   *
   */
  retryMode?: string | __Provider<string>;

  /**
   * Optional logger for logging debug/info/warn/error.
   */
  logger?: __Logger;

  /**
   * Optional extensions
   */
  extensions?: RuntimeExtension[];

  /**
   * The function that provides necessary utilities for generating and parsing event stream
   */
  eventStreamSerdeProvider?: __EventStreamSerdeProvider;

  /**
   * The {@link @smithy/smithy-client#DefaultsMode} that will be used to determine how certain default configuration options are resolved in the SDK.
   */
  defaultsMode?: __DefaultsMode | __Provider<__DefaultsMode>;

}

/**
 * @public
 */
export type CodeWhispererStreamingClientConfigType = Partial<__SmithyConfiguration<__HttpHandlerOptions>>
  & ClientDefaults
  & UserAgentInputConfig
  & RetryInputConfig
  & RegionInputConfig
  & HostHeaderInputConfig
  & EndpointsInputConfig
  & EventStreamSerdeInputConfig
  & HttpAuthSchemeInputConfig
/**
 * @public
 *
 *  The configuration interface of CodeWhispererStreamingClient class constructor that set the region, credentials and other options.
 */
export interface CodeWhispererStreamingClientConfig extends CodeWhispererStreamingClientConfigType {}

/**
 * @public
 */
export type CodeWhispererStreamingClientResolvedConfigType = __SmithyResolvedConfiguration<__HttpHandlerOptions>
  & Required<ClientDefaults>
  & RuntimeExtensionsConfig
  & UserAgentResolvedConfig
  & RetryResolvedConfig
  & RegionResolvedConfig
  & HostHeaderResolvedConfig
  & EndpointsResolvedConfig
  & EventStreamSerdeResolvedConfig
  & HttpAuthSchemeResolvedConfig
/**
 * @public
 *
 *  The resolved configuration interface of CodeWhispererStreamingClient class. This is resolved and normalized from the {@link CodeWhispererStreamingClientConfig | constructor configuration interface}.
 */
export interface CodeWhispererStreamingClientResolvedConfig extends CodeWhispererStreamingClientResolvedConfigType {}

/**
 * @public
 */
export class CodeWhispererStreamingClient extends __Client<
  __HttpHandlerOptions,
  ServiceInputTypes,
  ServiceOutputTypes,
  CodeWhispererStreamingClientResolvedConfig
> {
  /**
   * The resolved configuration of CodeWhispererStreamingClient class. This is resolved and normalized from the {@link CodeWhispererStreamingClientConfig | constructor configuration interface}.
   */
  readonly config: CodeWhispererStreamingClientResolvedConfig;

  constructor(...[configuration]: __CheckOptionalClientConfig<CodeWhispererStreamingClientConfig>) {
    let _config_0 = __getRuntimeConfig(configuration || {});
    let _config_1 = resolveUserAgentConfig(_config_0);
    let _config_2 = resolveRetryConfig(_config_1);
    let _config_3 = resolveRegionConfig(_config_2);
    let _config_4 = resolveHostHeaderConfig(_config_3);
    let _config_5 = resolveEndpointsConfig(_config_4);
    let _config_6 = resolveEventStreamSerdeConfig(_config_5);
    let _config_7 = resolveHttpAuthSchemeConfig(_config_6);
    let _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
    super(_config_8);
    this.config = _config_8;
    this.middlewareStack.use(getUserAgentPlugin(this.config
    ));
    this.middlewareStack.use(getRetryPlugin(this.config
    ));
    this.middlewareStack.use(getContentLengthPlugin(this.config
    ));
    this.middlewareStack.use(getHostHeaderPlugin(this.config
    ));
    this.middlewareStack.use(getLoggerPlugin(this.config
    ));
    this.middlewareStack.use(getRecursionDetectionPlugin(this.config
    ));
    this.middlewareStack.use(getHttpAuthSchemePlugin(this.config
      , {
        httpAuthSchemeParametersProvider: defaultCodeWhispererStreamingHttpAuthSchemeParametersProvider,identityProviderConfigProvider: async (config: CodeWhispererStreamingClientResolvedConfig) => new DefaultIdentityProviderConfig({
          "smithy.api#httpBearerAuth": config.token,}), }
    ));
    this.middlewareStack.use(getHttpSigningPlugin(this.config
    ));
  }

  /**
   * Destroy underlying resources, like sockets. It's usually not necessary to do this.
   * However in Node.js, it's best to explicitly shut down the client's agent when it is no longer needed.
   * Otherwise, sockets might stay open for quite a long time before the server terminates them.
   */
  destroy(): void {
    super.destroy();
  }
}
