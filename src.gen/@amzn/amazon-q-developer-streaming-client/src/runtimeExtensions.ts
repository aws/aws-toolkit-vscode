// smithy-typescript generated code
import {
  getHttpAuthExtensionConfiguration,
  resolveHttpAuthRuntimeConfig,
} from "./auth/httpAuthExtensionConfiguration";
import {
  getAwsRegionExtensionConfiguration,
  resolveAwsRegionExtensionConfiguration,
} from "@aws-sdk/region-config-resolver";
import {
  getHttpHandlerExtensionConfiguration,
  resolveHttpHandlerRuntimeConfig,
} from "@smithy/protocol-http";
import {
  getDefaultExtensionConfiguration,
  resolveDefaultRuntimeConfig,
} from "@smithy/smithy-client";
import { QDeveloperStreamingExtensionConfiguration } from "./extensionConfiguration";

/**
 * @public
 */
export interface RuntimeExtension {
    configure(extensionConfiguration: QDeveloperStreamingExtensionConfiguration): void;
}

/**
 * @public
 */
export interface RuntimeExtensionsConfig {
    extensions: RuntimeExtension[]
}

const asPartial = <T extends Partial<QDeveloperStreamingExtensionConfiguration>>(t: T) => t;

/**
 * @internal
 */
export const resolveRuntimeExtensions = (
    runtimeConfig: any,
    extensions: RuntimeExtension[]
) => {
  const extensionConfiguration: QDeveloperStreamingExtensionConfiguration = {
    ...asPartial(getAwsRegionExtensionConfiguration(runtimeConfig)),
    ...asPartial(getDefaultExtensionConfiguration(runtimeConfig)),
    ...asPartial(getHttpHandlerExtensionConfiguration(runtimeConfig)),
    ...asPartial(getHttpAuthExtensionConfiguration(runtimeConfig)),
  };

  extensions.forEach(extension => extension.configure(extensionConfiguration));

  return {
    ...runtimeConfig,
    ...resolveAwsRegionExtensionConfiguration(extensionConfiguration),
    ...resolveDefaultRuntimeConfig(extensionConfiguration),
    ...resolveHttpHandlerRuntimeConfig(extensionConfiguration),
    ...resolveHttpAuthRuntimeConfig(extensionConfiguration),
  };
}
