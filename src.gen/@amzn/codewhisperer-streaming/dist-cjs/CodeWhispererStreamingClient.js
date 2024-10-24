"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeWhispererStreamingClient = exports.__Client = void 0;
const runtimeConfig_1 = require("./runtimeConfig");
const runtimeExtensions_1 = require("./runtimeExtensions");
const middleware_host_header_1 = require("@aws-sdk/middleware-host-header");
const middleware_logger_1 = require("@aws-sdk/middleware-logger");
const middleware_recursion_detection_1 = require("@aws-sdk/middleware-recursion-detection");
const middleware_token_1 = require("@aws-sdk/middleware-token");
const middleware_user_agent_1 = require("@aws-sdk/middleware-user-agent");
const config_resolver_1 = require("@smithy/config-resolver");
const eventstream_serde_config_resolver_1 = require("@smithy/eventstream-serde-config-resolver");
const middleware_content_length_1 = require("@smithy/middleware-content-length");
const middleware_retry_1 = require("@smithy/middleware-retry");
const smithy_client_1 = require("@smithy/smithy-client");
Object.defineProperty(exports, "__Client", { enumerable: true, get: function () { return smithy_client_1.Client; } });
class CodeWhispererStreamingClient extends smithy_client_1.Client {
    constructor(...[configuration]) {
        let _config_0 = (0, runtimeConfig_1.getRuntimeConfig)(configuration || {});
        let _config_1 = (0, config_resolver_1.resolveRegionConfig)(_config_0);
        let _config_2 = (0, config_resolver_1.resolveEndpointsConfig)(_config_1);
        let _config_3 = (0, middleware_retry_1.resolveRetryConfig)(_config_2);
        let _config_4 = (0, middleware_host_header_1.resolveHostHeaderConfig)(_config_3);
        let _config_5 = (0, middleware_token_1.resolveTokenConfig)(_config_4);
        let _config_6 = (0, middleware_user_agent_1.resolveUserAgentConfig)(_config_5);
        let _config_7 = (0, eventstream_serde_config_resolver_1.resolveEventStreamSerdeConfig)(_config_6);
        let _config_8 = (0, runtimeExtensions_1.resolveRuntimeExtensions)(_config_7, configuration?.extensions || []);
        super(_config_8);
        this.config = _config_8;
        this.middlewareStack.use((0, middleware_retry_1.getRetryPlugin)(this.config));
        this.middlewareStack.use((0, middleware_content_length_1.getContentLengthPlugin)(this.config));
        this.middlewareStack.use((0, middleware_host_header_1.getHostHeaderPlugin)(this.config));
        this.middlewareStack.use((0, middleware_logger_1.getLoggerPlugin)(this.config));
        this.middlewareStack.use((0, middleware_recursion_detection_1.getRecursionDetectionPlugin)(this.config));
        this.middlewareStack.use((0, middleware_token_1.getTokenPlugin)(this.config));
        this.middlewareStack.use((0, middleware_user_agent_1.getUserAgentPlugin)(this.config));
    }
    destroy() {
        super.destroy();
    }
}
exports.CodeWhispererStreamingClient = CodeWhispererStreamingClient;
