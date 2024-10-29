import { normalizeProvider } from "@smithy/util-middleware";
import { getEndpointFromConfig } from "./adaptors/getEndpointFromConfig";
import { toEndpointV1 } from "./adaptors/toEndpointV1";
export const resolveEndpointConfig = (input) => {
    const tls = input.tls ?? true;
    const { endpoint } = input;
    const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await normalizeProvider(endpoint)()) : undefined;
    const isCustomEndpoint = !!endpoint;
    const resolvedConfig = {
        ...input,
        endpoint: customEndpointProvider,
        tls,
        isCustomEndpoint,
        useDualstackEndpoint: normalizeProvider(input.useDualstackEndpoint ?? false),
        useFipsEndpoint: normalizeProvider(input.useFipsEndpoint ?? false),
    };
    let configuredEndpointPromise = undefined;
    resolvedConfig.serviceConfiguredEndpoint = async () => {
        if (input.serviceId && !configuredEndpointPromise) {
            configuredEndpointPromise = getEndpointFromConfig(input.serviceId);
        }
        return configuredEndpointPromise;
    };
    return resolvedConfig;
};
