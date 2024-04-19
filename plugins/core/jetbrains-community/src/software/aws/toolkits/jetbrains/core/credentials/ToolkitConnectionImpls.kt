// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.ProfileSdkTokenProviderWrapper
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

/**
 * An SSO bearer connection created through a `sso-session` declaration in a user's ~/.aws/config
 */
class ProfileSsoManagedBearerSsoConnection(
    id: String,
    val configSessionName: String,
    startUrl: String,
    region: String,
    scopes: List<String>,
    cache: DiskCache = diskCache,
) : ManagedBearerSsoConnection(
    configSessionName,
    startUrl,
    region,
    scopes,
    cache,
    id,
    ToolkitBearerTokenProvider.diskSessionDisplayName(configSessionName)
)

/**
 * An SSO bearer connection created through [loginSso]
 */
class LegacyManagedBearerSsoConnection(
    startUrl: String,
    region: String,
    scopes: List<String>,
    cache: DiskCache = diskCache,
) : ManagedBearerSsoConnection(
    "",
    startUrl,
    region,
    scopes,
    cache,
    ToolkitBearerTokenProvider.ssoIdentifier(startUrl, region),
    ToolkitBearerTokenProvider.ssoDisplayName(startUrl)
)

sealed class ManagedBearerSsoConnection(
    override val sessionName: String,
    override val startUrl: String,
    override val region: String,
    override val scopes: List<String>,
    cache: DiskCache = diskCache,
    override val id: String,
    override val label: String
) : AwsBearerTokenConnection, Disposable {

    private val provider =
        tokenConnection(
            InteractiveBearerTokenProvider(
                startUrl,
                region,
                scopes,
                id,
                cache
            ),
            region
        )

    override fun getConnectionSettings(): TokenConnectionSettings = provider

    override fun dispose() {
        disposeProviderIfRequired(provider)
    }
}

class DetectedDiskSsoSessionConnection(
    override val sessionName: String,
    override val startUrl: String,
    override val region: String,
    override val scopes: List<String>,
    displayNameOverride: String? = null
) : AwsBearerTokenConnection, Disposable {
    override val id = ToolkitBearerTokenProvider.diskSessionIdentifier(sessionName)
    override val label = displayNameOverride ?: ToolkitBearerTokenProvider.diskSessionDisplayName(sessionName)

    private val provider =
        tokenConnection(
            ProfileSdkTokenProviderWrapper(
                sessionName = sessionName,
                region = region
            ),
            region
        )

    override fun getConnectionSettings(): TokenConnectionSettings = provider

    override fun dispose() {
        disposeProviderIfRequired(provider)
    }
}

private fun tokenConnection(provider: BearerTokenProvider, region: String) =
    TokenConnectionSettings(
        ToolkitBearerTokenProvider(provider),
        AwsRegionProvider.getInstance().get(region) ?: error("Partition data is missing for $region")
    )

private fun disposeProviderIfRequired(settings: TokenConnectionSettings) {
    val delegate = settings.tokenProvider.delegate
    if (delegate is Disposable) {
        Disposer.dispose(delegate)
    }
}
