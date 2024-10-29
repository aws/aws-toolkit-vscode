import { CredentialsProviderError } from "@smithy/property-provider";
import { getSelectorName } from "./getSelectorName";
export const fromEnv = (envVarSelector, logger) => async () => {
    try {
        const config = envVarSelector(process.env);
        if (config === undefined) {
            throw new Error();
        }
        return config;
    }
    catch (e) {
        throw new CredentialsProviderError(e.message || `Not found in ENV: ${getSelectorName(envVarSelector.toString())}`, { logger });
    }
};
