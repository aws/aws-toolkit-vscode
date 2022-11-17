// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ManagedBearerSsoConnection(
    val startUrl: String,
    val region: String,
    override val scopes: List<String>,
    private val prompt: SsoPrompt = SsoPrompt
) : BearerSsoConnection, Disposable {
    override val id: String = ToolkitBearerTokenProvider.identifier(startUrl)
    override val label: String = ToolkitBearerTokenProvider.displayName(startUrl)

    private val provider = lazy {
        tokenConnection(
            InteractiveBearerTokenProvider(
                startUrl,
                region,
                prompt,
                scopes
            ),
            region
        )
    }

    override fun getConnectionSettings(): TokenConnectionSettings = provider.value

    override fun dispose() {
        if (provider.isInitialized()) {
            disposeProviderIfRequired(provider.value)
        }
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
