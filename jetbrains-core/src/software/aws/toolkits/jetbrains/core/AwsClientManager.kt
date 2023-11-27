// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.application.ex.ApplicationInfoEx
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.ToolkitClientCustomizer
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.settings.AwsSettings

open class AwsClientManager : ToolkitClientManager(), Disposable {
    init {
        val busConnection = ApplicationManager.getApplication().messageBus.connect(this)
        busConnection.subscribe(
            CredentialManager.CREDENTIALS_CHANGED,
            object : ToolkitCredentialsChangeListener {
                override fun providerRemoved(identifier: CredentialIdentifier) {
                    invalidateSdks(identifier.id)
                }

                override fun providerRemoved(providerId: String) {
                    invalidateSdks(providerId)
                }
            }
        )

        busConnection.subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String) {
                    // otherwise we potentially cache the provider with the wrong token
                    invalidateSdks(providerId)
                }

                override fun invalidate(providerId: String) {
                    invalidateSdks(providerId)
                }
            }
        )
    }

    override val userAgent = AwsClientManager.userAgent

    override fun dispose() {
        shutdown()
    }

    override fun sdkHttpClient(): SdkHttpClient = AwsSdkClient.getInstance().sharedSdkClient()

    override fun getRegionProvider(): ToolkitRegionProvider = AwsRegionProvider.getInstance()

    override fun globalClientCustomizer(
        credentialProvider: AwsCredentialsProvider?,
        tokenProvider: SdkTokenProvider?,
        regionId: String,
        builder: AwsClientBuilder<*, *>,
        clientOverrideConfiguration: ClientOverrideConfiguration.Builder
    ) {
        CUSTOMIZER_EP.extensionList.forEach { it.customize(credentialProvider, tokenProvider, regionId, builder, clientOverrideConfiguration) }
    }

    companion object {
        @JvmStatic
        fun getInstance(): ToolkitClientManager = service()

        val userAgent: String by lazy {
            val platformName = tryOrNull { ApplicationNamesInfo.getInstance().fullProductNameWithEdition.replace(' ', '-') }
            val platformVersion = tryOrNull { ApplicationInfoEx.getInstanceEx().fullVersion.replace(' ', '-') }
            "AWS-Toolkit-For-JetBrains/${AwsToolkit.PLUGIN_VERSION} $platformName/$platformVersion ClientId/${AwsSettings.getInstance().clientId}"
        }

        internal val CUSTOMIZER_EP = ExtensionPointName<ToolkitClientCustomizer>("aws.toolkit.sdk.clientCustomizer")
    }
}

inline fun <reified T : SdkClient> Project.awsClient(): T {
    val accountSettingsManager = AwsConnectionManager.getInstance(this)

    return AwsClientManager
        .getInstance()
        .getClient(accountSettingsManager.activeCredentialProvider, accountSettingsManager.activeRegion)
}

inline fun <reified T : SdkClient> ConnectionSettings.awsClient(): T = AwsClientManager.getInstance().getClient(credentials, region)

inline fun <reified T : SdkClient> TokenConnectionSettings.awsClient(): T = AwsClientManager.getInstance().getClient(this)

inline fun <reified T : SdkClient> ClientConnectionSettings<*>.awsClient(): T = when (this) {
    is ConnectionSettings -> awsClient<T>()
    is TokenConnectionSettings -> awsClient<T>()
}
