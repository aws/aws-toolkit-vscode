"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/submodules/httpAuthSchemes/index.ts
var httpAuthSchemes_exports = {};
__export(httpAuthSchemes_exports, {
  AWSSDKSigV4Signer: () => AWSSDKSigV4Signer,
  AwsSdkSigV4ASigner: () => AwsSdkSigV4ASigner,
  AwsSdkSigV4Signer: () => AwsSdkSigV4Signer,
  NODE_SIGV4A_CONFIG_OPTIONS: () => NODE_SIGV4A_CONFIG_OPTIONS,
  resolveAWSSDKSigV4Config: () => resolveAWSSDKSigV4Config,
  resolveAwsSdkSigV4AConfig: () => resolveAwsSdkSigV4AConfig,
  resolveAwsSdkSigV4Config: () => resolveAwsSdkSigV4Config,
  validateSigningProperties: () => validateSigningProperties
});
module.exports = __toCommonJS(httpAuthSchemes_exports);

// src/submodules/httpAuthSchemes/aws_sdk/AwsSdkSigV4Signer.ts
var import_protocol_http2 = require("@smithy/protocol-http");

// src/submodules/httpAuthSchemes/utils/getDateHeader.ts
var import_protocol_http = require("@smithy/protocol-http");
var getDateHeader = /* @__PURE__ */ __name((response) => {
  var _a, _b;
  return import_protocol_http.HttpResponse.isInstance(response) ? ((_a = response.headers) == null ? void 0 : _a.date) ?? ((_b = response.headers) == null ? void 0 : _b.Date) : void 0;
}, "getDateHeader");

// src/submodules/httpAuthSchemes/utils/getSkewCorrectedDate.ts
var getSkewCorrectedDate = /* @__PURE__ */ __name((systemClockOffset) => new Date(Date.now() + systemClockOffset), "getSkewCorrectedDate");

// src/submodules/httpAuthSchemes/utils/isClockSkewed.ts
var isClockSkewed = /* @__PURE__ */ __name((clockTime, systemClockOffset) => Math.abs(getSkewCorrectedDate(systemClockOffset).getTime() - clockTime) >= 3e5, "isClockSkewed");

// src/submodules/httpAuthSchemes/utils/getUpdatedSystemClockOffset.ts
var getUpdatedSystemClockOffset = /* @__PURE__ */ __name((clockTime, currentSystemClockOffset) => {
  const clockTimeInMs = Date.parse(clockTime);
  if (isClockSkewed(clockTimeInMs, currentSystemClockOffset)) {
    return clockTimeInMs - Date.now();
  }
  return currentSystemClockOffset;
}, "getUpdatedSystemClockOffset");

// src/submodules/httpAuthSchemes/aws_sdk/AwsSdkSigV4Signer.ts
var throwSigningPropertyError = /* @__PURE__ */ __name((name, property) => {
  if (!property) {
    throw new Error(`Property \`${name}\` is not resolved for AWS SDK SigV4Auth`);
  }
  return property;
}, "throwSigningPropertyError");
var validateSigningProperties = /* @__PURE__ */ __name(async (signingProperties) => {
  var _a, _b, _c;
  const context = throwSigningPropertyError(
    "context",
    signingProperties.context
  );
  const config = throwSigningPropertyError("config", signingProperties.config);
  const authScheme = (_c = (_b = (_a = context.endpointV2) == null ? void 0 : _a.properties) == null ? void 0 : _b.authSchemes) == null ? void 0 : _c[0];
  const signerFunction = throwSigningPropertyError(
    "signer",
    config.signer
  );
  const signer = await signerFunction(authScheme);
  const signingRegion = signingProperties == null ? void 0 : signingProperties.signingRegion;
  const signingRegionSet = signingProperties == null ? void 0 : signingProperties.signingRegionSet;
  const signingName = signingProperties == null ? void 0 : signingProperties.signingName;
  return {
    config,
    signer,
    signingRegion,
    signingRegionSet,
    signingName
  };
}, "validateSigningProperties");
var _AwsSdkSigV4Signer = class _AwsSdkSigV4Signer {
  async sign(httpRequest, identity, signingProperties) {
    var _a;
    if (!import_protocol_http2.HttpRequest.isInstance(httpRequest)) {
      throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
    }
    const validatedProps = await validateSigningProperties(signingProperties);
    const { config, signer } = validatedProps;
    let { signingRegion, signingName } = validatedProps;
    const handlerExecutionContext = signingProperties.context;
    if (((_a = handlerExecutionContext == null ? void 0 : handlerExecutionContext.authSchemes) == null ? void 0 : _a.length) ?? 0 > 1) {
      const [first, second] = handlerExecutionContext.authSchemes;
      if ((first == null ? void 0 : first.name) === "sigv4a" && (second == null ? void 0 : second.name) === "sigv4") {
        signingRegion = (second == null ? void 0 : second.signingRegion) ?? signingRegion;
        signingName = (second == null ? void 0 : second.signingName) ?? signingName;
      }
    }
    const signedRequest = await signer.sign(httpRequest, {
      signingDate: getSkewCorrectedDate(config.systemClockOffset),
      signingRegion,
      signingService: signingName
    });
    return signedRequest;
  }
  errorHandler(signingProperties) {
    return (error) => {
      const serverTime = error.ServerTime ?? getDateHeader(error.$response);
      if (serverTime) {
        const config = throwSigningPropertyError("config", signingProperties.config);
        const initialSystemClockOffset = config.systemClockOffset;
        config.systemClockOffset = getUpdatedSystemClockOffset(serverTime, config.systemClockOffset);
        const clockSkewCorrected = config.systemClockOffset !== initialSystemClockOffset;
        if (clockSkewCorrected && error.$metadata) {
          error.$metadata.clockSkewCorrected = true;
        }
      }
      throw error;
    };
  }
  successHandler(httpResponse, signingProperties) {
    const dateHeader = getDateHeader(httpResponse);
    if (dateHeader) {
      const config = throwSigningPropertyError("config", signingProperties.config);
      config.systemClockOffset = getUpdatedSystemClockOffset(dateHeader, config.systemClockOffset);
    }
  }
};
__name(_AwsSdkSigV4Signer, "AwsSdkSigV4Signer");
var AwsSdkSigV4Signer = _AwsSdkSigV4Signer;
var AWSSDKSigV4Signer = AwsSdkSigV4Signer;

// src/submodules/httpAuthSchemes/aws_sdk/AwsSdkSigV4ASigner.ts
var import_protocol_http3 = require("@smithy/protocol-http");
var _AwsSdkSigV4ASigner = class _AwsSdkSigV4ASigner extends AwsSdkSigV4Signer {
  async sign(httpRequest, identity, signingProperties) {
    var _a;
    if (!import_protocol_http3.HttpRequest.isInstance(httpRequest)) {
      throw new Error("The request is not an instance of `HttpRequest` and cannot be signed");
    }
    const { config, signer, signingRegion, signingRegionSet, signingName } = await validateSigningProperties(
      signingProperties
    );
    const configResolvedSigningRegionSet = await ((_a = config.sigv4aSigningRegionSet) == null ? void 0 : _a.call(config));
    const multiRegionOverride = (configResolvedSigningRegionSet ?? signingRegionSet ?? [signingRegion]).join(",");
    const signedRequest = await signer.sign(httpRequest, {
      signingDate: getSkewCorrectedDate(config.systemClockOffset),
      signingRegion: multiRegionOverride,
      signingService: signingName
    });
    return signedRequest;
  }
};
__name(_AwsSdkSigV4ASigner, "AwsSdkSigV4ASigner");
var AwsSdkSigV4ASigner = _AwsSdkSigV4ASigner;

// src/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4AConfig.ts
var import_core = require("@smithy/core");
var import_property_provider = require("@smithy/property-provider");
var resolveAwsSdkSigV4AConfig = /* @__PURE__ */ __name((config) => {
  config.sigv4aSigningRegionSet = (0, import_core.normalizeProvider)(config.sigv4aSigningRegionSet);
  return config;
}, "resolveAwsSdkSigV4AConfig");
var NODE_SIGV4A_CONFIG_OPTIONS = {
  environmentVariableSelector(env) {
    if (env.AWS_SIGV4A_SIGNING_REGION_SET) {
      return env.AWS_SIGV4A_SIGNING_REGION_SET.split(",").map((_) => _.trim());
    }
    throw new import_property_provider.ProviderError("AWS_SIGV4A_SIGNING_REGION_SET not set in env.", {
      tryNextLink: true
    });
  },
  configFileSelector(profile) {
    if (profile.sigv4a_signing_region_set) {
      return (profile.sigv4a_signing_region_set ?? "").split(",").map((_) => _.trim());
    }
    throw new import_property_provider.ProviderError("sigv4a_signing_region_set not set in profile.", {
      tryNextLink: true
    });
  },
  default: void 0
};

// src/submodules/httpAuthSchemes/aws_sdk/resolveAwsSdkSigV4Config.ts
var import_core2 = require("@smithy/core");
var import_signature_v4 = require("@smithy/signature-v4");
var resolveAwsSdkSigV4Config = /* @__PURE__ */ __name((config) => {
  let normalizedCreds;
  if (config.credentials) {
    normalizedCreds = (0, import_core2.memoizeIdentityProvider)(config.credentials, import_core2.isIdentityExpired, import_core2.doesIdentityRequireRefresh);
  }
  if (!normalizedCreds) {
    if (config.credentialDefaultProvider) {
      normalizedCreds = (0, import_core2.normalizeProvider)(
        config.credentialDefaultProvider(
          Object.assign({}, config, {
            parentClientConfig: config
          })
        )
      );
    } else {
      normalizedCreds = /* @__PURE__ */ __name(async () => {
        throw new Error("`credentials` is missing");
      }, "normalizedCreds");
    }
  }
  const {
    // Default for signingEscapePath
    signingEscapePath = true,
    // Default for systemClockOffset
    systemClockOffset = config.systemClockOffset || 0,
    // No default for sha256 since it is platform dependent
    sha256
  } = config;
  let signer;
  if (config.signer) {
    signer = (0, import_core2.normalizeProvider)(config.signer);
  } else if (config.regionInfoProvider) {
    signer = /* @__PURE__ */ __name(() => (0, import_core2.normalizeProvider)(config.region)().then(
      async (region) => [
        await config.regionInfoProvider(region, {
          useFipsEndpoint: await config.useFipsEndpoint(),
          useDualstackEndpoint: await config.useDualstackEndpoint()
        }) || {},
        region
      ]
    ).then(([regionInfo, region]) => {
      const { signingRegion, signingService } = regionInfo;
      config.signingRegion = config.signingRegion || signingRegion || region;
      config.signingName = config.signingName || signingService || config.serviceId;
      const params = {
        ...config,
        credentials: normalizedCreds,
        region: config.signingRegion,
        service: config.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = config.signerConstructor || import_signature_v4.SignatureV4;
      return new SignerCtor(params);
    }), "signer");
  } else {
    signer = /* @__PURE__ */ __name(async (authScheme) => {
      authScheme = Object.assign(
        {},
        {
          name: "sigv4",
          signingName: config.signingName || config.defaultSigningName,
          signingRegion: await (0, import_core2.normalizeProvider)(config.region)(),
          properties: {}
        },
        authScheme
      );
      const signingRegion = authScheme.signingRegion;
      const signingService = authScheme.signingName;
      config.signingRegion = config.signingRegion || signingRegion;
      config.signingName = config.signingName || signingService || config.serviceId;
      const params = {
        ...config,
        credentials: normalizedCreds,
        region: config.signingRegion,
        service: config.signingName,
        sha256,
        uriEscapePath: signingEscapePath
      };
      const SignerCtor = config.signerConstructor || import_signature_v4.SignatureV4;
      return new SignerCtor(params);
    }, "signer");
  }
  return {
    ...config,
    systemClockOffset,
    signingEscapePath,
    credentials: normalizedCreds,
    signer
  };
}, "resolveAwsSdkSigV4Config");
var resolveAWSSDKSigV4Config = resolveAwsSdkSigV4Config;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AWSSDKSigV4Signer,
  AwsSdkSigV4ASigner,
  AwsSdkSigV4Signer,
  NODE_SIGV4A_CONFIG_OPTIONS,
  resolveAWSSDKSigV4Config,
  resolveAwsSdkSigV4AConfig,
  resolveAwsSdkSigV4Config,
  validateSigningProperties
});
