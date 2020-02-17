// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion

class MockCredentialsManager : CredentialManager() {
    init {
        reset()
    }

    fun reset() {
        getCredentialIdentifiers().filterNot { it.id == DUMMY_PROVIDER_IDENTIFIER.id }.forEach { removeProvider(it) }

        addProvider(DUMMY_PROVIDER_IDENTIFIER)
    }

    fun addCredentials(
        id: String,
        credentials: AwsCredentials = AwsBasicCredentials.create("Access", "Secret")
    ): ToolkitCredentialsIdentifier {
        val credentialIdentifier = MockCredentialIdentifier(id, StaticCredentialsProvider.create(credentials))

        addProvider(credentialIdentifier)

        return credentialIdentifier
    }

    override fun factoryMapping(): Map<String, CredentialProviderFactory> = mapOf(MockCredentialProviderFactory.id to MockCredentialProviderFactory)

    companion object {
        fun getInstance(): MockCredentialsManager = ServiceManager.getService(CredentialManager::class.java) as MockCredentialsManager

        val DUMMY_PROVIDER_IDENTIFIER: ToolkitCredentialsIdentifier = MockCredentialIdentifier(
            "DUMMY_CREDENTIALS",
            StaticCredentialsProvider.create(AwsBasicCredentials.create("DummyAccess", "DummySecret"))
        )
    }

    private class MockCredentialIdentifier(override val displayName: String, val credentials: AwsCredentialsProvider) :
        ToolkitCredentialsIdentifier() {
        override val id: String = displayName
        override val factoryId: String = "mockCredentialProviderFactory"
    }

    private object MockCredentialProviderFactory :
        CredentialProviderFactory {
        override val id: String = "mockCredentialProviderFactory"

        override fun setUp(credentialLoadCallback: CredentialsChangeListener) {}

        override fun createAwsCredentialProvider(
            providerId: ToolkitCredentialsIdentifier,
            region: AwsRegion,
            sdkClient: SdkHttpClient
        ): ToolkitCredentialsProvider = ToolkitCredentialsProvider(providerId, (providerId as MockCredentialIdentifier).credentials)
    }
}
