import { chain, CredentialsProviderError } from "@smithy/property-provider";
export const resolveCredentialSource = (credentialSource, profileName, logger) => {
    const sourceProvidersMap = {
        EcsContainer: async (options) => {
            const { fromHttp } = await import("@aws-sdk/credential-provider-http");
            const { fromContainerMetadata } = await import("@smithy/credential-provider-imds");
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is EcsContainer");
            return chain(fromHttp(options ?? {}), fromContainerMetadata(options));
        },
        Ec2InstanceMetadata: async (options) => {
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Ec2InstanceMetadata");
            const { fromInstanceMetadata } = await import("@smithy/credential-provider-imds");
            return fromInstanceMetadata(options);
        },
        Environment: async (options) => {
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Environment");
            const { fromEnv } = await import("@aws-sdk/credential-provider-env");
            return fromEnv(options);
        },
    };
    if (credentialSource in sourceProvidersMap) {
        return sourceProvidersMap[credentialSource];
    }
    else {
        throw new CredentialsProviderError(`Unsupported credential source in profile ${profileName}. Got ${credentialSource}, ` +
            `expected EcsContainer or Ec2InstanceMetadata or Environment.`, { logger });
    }
};
