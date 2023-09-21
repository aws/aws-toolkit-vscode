// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.utils.SdkAutoCloseable
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoAccessTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCache
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCredentialProvider

class ProfileSsoSessionProvider(ssoCache: SsoCache, profile: Profile) : AwsCredentialsProvider, SdkAutoCloseable {
    private val ssoClient: SsoClient
    private val ssoOidcClient: SsoOidcClient
    private val credentialsProvider: SsoCredentialProvider
    private val mySsoSection: SsoMetadata
    init {
        val ssoSession = profile.requiredProperty(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY)
        val ssoSessionSection = ProfileFile.defaultProfileFile().getSection(SsoSessionConstants.SSO_SESSION_SECTION_NAME, ssoSession).orElseThrow()
        val clientManager = AwsClientManager.getInstance()

        mySsoSection = SsoMetadata(
            ssoSessionSection.requiredProperty(ProfileProperty.SSO_REGION),
            ssoSessionSection.requiredProperty(ProfileProperty.SSO_START_URL),
            // default to a sane scope; we need this anyways for the credential provider to have the correct permissions
            ssoSessionSection.property(SsoSessionConstants.SSO_REGISTRATION_SCOPES)
                .map { it.trim().split(",") }
                .orElse(listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE))
        )

        ssoClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(mySsoSection.ssoRegion))
        ssoOidcClient = clientManager.createUnmanagedClient(AnonymousCredentialsProvider.create(), Region.of(mySsoSection.ssoRegion))

        val ssoAccessTokenProvider = SsoAccessTokenProvider(
            mySsoSection.ssoStartUrl,
            mySsoSection.ssoRegion,
            ssoCache,
            ssoOidcClient,
            mySsoSection.ssoRegistrationScopes
        )

        credentialsProvider = SsoCredentialProvider(
            profile.requiredProperty(ProfileProperty.SSO_ACCOUNT_ID),
            profile.requiredProperty(ProfileProperty.SSO_ROLE_NAME),
            ssoClient,
            ssoAccessTokenProvider
        )
    }

    override fun resolveCredentials(): AwsCredentials = credentialsProvider.resolveCredentials()

    override fun close() {
        credentialsProvider.close()
        ssoClient.close()
        ssoOidcClient.close()
    }
}

data class SsoMetadata(
    val ssoRegion: String,
    val ssoStartUrl: String,
    val ssoRegistrationScopes: List<String>
)

object SsoSessionConstants {
    const val PROFILE_SSO_SESSION_PROPERTY = "sso_session"
    const val SSO_SESSION_SECTION_NAME = "sso-session"
    const val SSO_REGISTRATION_SCOPES: String = "sso_registration_scopes"
}
