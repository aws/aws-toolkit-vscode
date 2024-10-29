const ssoOidcClientsHash = {};
export const getSsoOidcClient = async (ssoRegion) => {
    const { SSOOIDCClient } = await import("@aws-sdk/client-sso-oidc");
    if (ssoOidcClientsHash[ssoRegion]) {
        return ssoOidcClientsHash[ssoRegion];
    }
    const ssoOidcClient = new SSOOIDCClient({ region: ssoRegion });
    ssoOidcClientsHash[ssoRegion] = ssoOidcClient;
    return ssoOidcClient;
};
