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
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

open class AwsClientManager : ToolkitClientManager(), Disposable {
    init {
        val busConnection = ApplicationManager.getApplication().messageBus.connect(this)
        busConnection.subscribe(
            CredentialManager.CREDENTIALS_CHANGED,
            object : ToolkitCredentialsChangeListener {
                override fun providerRemoved(identifier: CredentialIdentifier) {
                    invalidateSdks(identifier.id)
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

    override fun clientCustomizer(credentialProvider: AwsCredentialsProvider, regionId: String, builder: AwsClientBuilder<*, *>) {
        CUSTOMIZER_EP.extensionList.forEach { it.customize(credentialProvider, regionId, builder) }
    }

    companion object {
        @JvmStatic
        fun getInstance(): ToolkitClientManager = service()

        val userAgent: String by lazy {
            val platformName = tryOrNull { ApplicationNamesInfo.getInstance().fullProductNameWithEdition.replace(' ', '-') }
            val platformVersion = tryOrNull { ApplicationInfoEx.getInstanceEx().fullVersion.replace(' ', '-') }
            "AWS-Toolkit-For-JetBrains/${AwsToolkit.PLUGIN_VERSION} $platformName/$platformVersion"
        }

        internal val CUSTOMIZER_EP = ExtensionPointName<AwsClientCustomizer>("aws.toolkit.sdk.clientCustomizer")
    }
}

inline fun <reified T : SdkClient> Project.awsClient(): T {
    val accountSettingsManager = AwsConnectionManager.getInstance(this)

    return AwsClientManager
        .getInstance()
        .getClient(accountSettingsManager.activeCredentialProvider, accountSettingsManager.activeRegion)
}

inline fun <reified T : SdkClient> ConnectionSettings.awsClient(): T = AwsClientManager.getInstance().getClient(credentials, region)

/**
 * Used to override/add behavior during AWS SDK Client creation.
 *
 * Example usage to add a local development endpoint for a particular service:
 *
 * ```
 * class MyDevEndpointCustomizer : AwsClientCustomizer {
 *   override fun customize(credentialProvider: AwsCredentialsProvider, regionId: String, builder: AwsClientBuilder<*, *>) {
 *     if (builder is LambdaClientBuilder && connection.region.id == "us-west-2") {
 *       builder.endpointOverride(URI.create("http://localhost:8888"))
 *     }
 *   }
 * }
 * ```
 */
fun interface AwsClientCustomizer {
    fun customize(credentialProvider: AwsCredentialsProvider, regionId: String, builder: AwsClientBuilder<*, *>)
}
