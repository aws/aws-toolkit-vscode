import { resolveAwsSdkSigV4Config, } from "@aws-sdk/core";
import { getSmithyContext, normalizeProvider, } from "@smithy/util-middleware";
export const defaultQDeveloperStreamingHttpAuthSchemeParametersProvider = async (config, context, input) => {
    return {
        operation: getSmithyContext(context).operation,
        region: await normalizeProvider(config.region)() || (() => {
            throw new Error("expected `region` to be configured for `aws.auth#sigv4`");
        })(),
    };
};
function createAwsAuthSigv4HttpAuthOption(authParameters) {
    return {
        schemeId: "aws.auth#sigv4",
        signingProperties: {
            name: "q",
            region: authParameters.region,
        },
        propertiesExtractor: (config, context) => ({
            signingProperties: {
                config,
                context,
            },
        }),
    };
}
;
export const defaultQDeveloperStreamingHttpAuthSchemeProvider = (authParameters) => {
    const options = [];
    switch (authParameters.operation) {
        default:
            {
                options.push(createAwsAuthSigv4HttpAuthOption(authParameters));
            }
            ;
    }
    ;
    return options;
};
export const resolveHttpAuthSchemeConfig = (config) => {
    const config_0 = resolveAwsSdkSigV4Config(config);
    return {
        ...config_0,
    };
};
