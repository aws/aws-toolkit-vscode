"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultUserAgent = void 0;
const tslib_1 = require("tslib");
const bowser_1 = tslib_1.__importDefault(require("bowser"));
const defaultUserAgent = ({ serviceId, clientVersion }) => async () => {
    const parsedUA = typeof window !== "undefined" && window?.navigator?.userAgent
        ? bowser_1.default.parse(window.navigator.userAgent)
        : undefined;
    const sections = [
        ["aws-sdk-js", clientVersion],
        ["ua", "2.0"],
        [`os/${parsedUA?.os?.name || "other"}`, parsedUA?.os?.version],
        ["lang/js"],
        ["md/browser", `${parsedUA?.browser?.name ?? "unknown"}_${parsedUA?.browser?.version ?? "unknown"}`],
    ];
    if (serviceId) {
        sections.push([`api/${serviceId}`, clientVersion]);
    }
    return sections;
};
exports.defaultUserAgent = defaultUserAgent;
