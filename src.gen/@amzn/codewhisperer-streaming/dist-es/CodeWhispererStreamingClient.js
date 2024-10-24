import { getRuntimeConfig as __getRuntimeConfig } from "./runtimeConfig";
import { resolveRuntimeExtensions, } from "./runtimeExtensions";
import { getHostHeaderPlugin, resolveHostHeaderConfig, } from "@aws-sdk/middleware-host-header";
import { getLoggerPlugin } from "@aws-sdk/middleware-logger";
import { getRecursionDetectionPlugin } from "@aws-sdk/middleware-recursion-detection";
import { getTokenPlugin, resolveTokenConfig, } from "@aws-sdk/middleware-token";
import { getUserAgentPlugin, resolveUserAgentConfig, } from "@aws-sdk/middleware-user-agent";
import { resolveEndpointsConfig, resolveRegionConfig, } from "@smithy/config-resolver";
import { resolveEventStreamSerdeConfig, } from "@smithy/eventstream-serde-config-resolver";
import { getContentLengthPlugin } from "@smithy/middleware-content-length";
import { getRetryPlugin, resolveRetryConfig, } from "@smithy/middleware-retry";
import { Client as __Client, } from "@smithy/smithy-client";
export { __Client };
export class CodeWhispererStreamingClient extends __Client {
    constructor(...[configuration]) {
        let _config_0 = __getRuntimeConfig(configuration || {});
        let _config_1 = resolveRegionConfig(_config_0);
        let _config_2 = resolveEndpointsConfig(_config_1);
        let _config_3 = resolveRetryConfig(_config_2);
        let _config_4 = resolveHostHeaderConfig(_config_3);
        let _config_5 = resolveTokenConfig(_config_4);
        let _config_6 = resolveUserAgentConfig(_config_5);
        let _config_7 = resolveEventStreamSerdeConfig(_config_6);
        let _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        super(_config_8);
        this.config = _config_8;
        this.middlewareStack.use(getRetryPlugin(this.config));
        this.middlewareStack.use(getContentLengthPlugin(this.config));
        this.middlewareStack.use(getHostHeaderPlugin(this.config));
        this.middlewareStack.use(getLoggerPlugin(this.config));
        this.middlewareStack.use(getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(getTokenPlugin(this.config));
        this.middlewareStack.use(getUserAgentPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}
