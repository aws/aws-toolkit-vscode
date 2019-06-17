// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import java.util.concurrent.ConcurrentHashMap

interface AwsAccountCache {
    /**
     * Return the underlying AWS account for the given credential provider. Return null if the credential provider is invalid
     */
    fun awsAccount(credentialProvider: ToolkitCredentialsProvider): String?

    companion object {
        fun getInstance(): AwsAccountCache = ServiceManager.getService(AwsAccountCache::class.java)
    }
}

class DefaultAwsAccountCache(private val stsClient: StsClient) : AwsAccountCache, ToolkitCredentialsChangeListener {
    constructor() : this(ToolkitClientManager.createNewClient(
        StsClient::class,
        AwsSdkClient.getInstance().sdkHttpClient,
        Region.US_EAST_1,
        AnonymousCredentialsProvider.create(),
        AwsClientManager.userAgent
    ))

    init {
        ApplicationManager.getApplication().messageBus.connect().subscribe(CredentialManager.CREDENTIALS_CHANGED, this)
    }

    private val accountCache: ConcurrentHashMap<String, String> = ConcurrentHashMap()

    override fun awsAccount(credentialProvider: ToolkitCredentialsProvider): String? =
        accountCache[credentialProvider.id] ?: tryOrNull {
            credentialProvider.getAwsAccount(stsClient)
        }?.also {
            accountCache[credentialProvider.id] = it
        }

    override fun providerModified(provider: ToolkitCredentialsProvider) {
        accountCache.remove(provider.id)
    }

    override fun providerRemoved(providerId: String) {
        accountCache.remove(providerId)
    }
}