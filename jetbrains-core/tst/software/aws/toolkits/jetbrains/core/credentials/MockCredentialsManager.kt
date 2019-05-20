// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.ServiceManager
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider

class MockCredentialsManager : CredentialManager() {
    private val providers = mutableMapOf<String, ToolkitCredentialsProvider>()

    override fun getCredentialProviders(): List<ToolkitCredentialsProvider> = providers.values.toList()

    override fun getCredentialProvider(providerId: String): ToolkitCredentialsProvider = providers[providerId]
        ?: throw CredentialProviderNotFound("$providerId not found")

    fun reset() {
        incModificationCount()
        providers.clear()
    }

    fun addCredentials(id: String, credentials: AwsCredentials, isValid: Boolean = true, awsAccountId: String = "111111111111"): ToolkitCredentialsProvider =
        MockCredentialsProvider(id, id, credentials, isValid, awsAccountId).also {
            incModificationCount()
            providers[id] = it
        }

    companion object {
        fun getInstance(): MockCredentialsManager = ServiceManager.getService(CredentialManager::class.java) as MockCredentialsManager
    }

    private inner class MockCredentialsProvider(
        override val id: String,
        override val displayName: String,
        private val credentials: AwsCredentials,
        private val isValid: Boolean,
        private val awsAccountId: String
    ) : ToolkitCredentialsProvider() {
        override fun resolveCredentials(): AwsCredentials = credentials
        override fun getAwsAccount(stsClient: StsClient): String {
            if (!isValid) {
                throw IllegalStateException("$displayName is not valid")
            } else {
                return awsAccountId
            }
        }
    }
}