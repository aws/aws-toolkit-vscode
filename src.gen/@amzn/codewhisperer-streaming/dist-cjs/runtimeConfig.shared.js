"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeConfig = void 0;
const endpoints_1 = require("./endpoints");
const smithy_client_1 = require("@smithy/smithy-client");
const url_parser_1 = require("@smithy/url-parser");
const util_base64_1 = require("@smithy/util-base64");
const util_utf8_1 = require("@smithy/util-utf8");
const getRuntimeConfig = (config) => ({
    apiVersion: "2023-11-27",
    base64Decoder: config?.base64Decoder ?? util_base64_1.fromBase64,
    base64Encoder: config?.base64Encoder ?? util_base64_1.toBase64,
    disableHostPrefix: config?.disableHostPrefix ?? false,
    extensions: config?.extensions ?? [],
    logger: config?.logger ?? new smithy_client_1.NoOpLogger(),
    regionInfoProvider: config?.regionInfoProvider ?? endpoints_1.defaultRegionInfoProvider,
    serviceId: config?.serviceId ?? "CodeWhispererStreaming",
    urlParser: config?.urlParser ?? url_parser_1.parseUrl,
    utf8Decoder: config?.utf8Decoder ?? util_utf8_1.fromUtf8,
    utf8Encoder: config?.utf8Encoder ?? util_utf8_1.toUtf8,
});
exports.getRuntimeConfig = getRuntimeConfig;
