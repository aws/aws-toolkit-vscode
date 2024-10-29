import { AwsCredentialIdentity } from "@smithy/types";
import { FromSSOInit, SsoCredentialsParameters } from "./fromSSO";
export declare const resolveSSOCredentials: ({
  ssoStartUrl,
  ssoSession,
  ssoAccountId,
  ssoRegion,
  ssoRoleName,
  ssoClient,
  clientConfig,
  profile,
  logger,
}: FromSSOInit & SsoCredentialsParameters) => Promise<AwsCredentialIdentity>;
