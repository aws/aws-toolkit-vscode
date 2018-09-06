// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.aws.toolkits.core.credentials.CredentialProviderNotFound
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider

class MockCredentialsManager : CredentialManager {
    private val providers = mutableMapOf<String, ToolkitCredentialsProvider>()

    override fun getCredentialProviders(): List<ToolkitCredentialsProvider> {
        return providers.values.toList()
    }

    override fun getCredentialProvider(providerId: String): ToolkitCredentialsProvider {
        return providers[providerId] ?: throw CredentialProviderNotFound("$providerId not found")
    }

    fun reset() {
        providers.clear()
    }

    fun addCredentials(id: String, credentials: AwsCredentials): ToolkitCredentialsProvider {
        return MockCredentialsProvider(id, id, credentials).also {
            providers[id] = it
        }
    }

    private inner class MockCredentialsProvider(
        override val id: String,
        override val displayName: String,
        private val credentials: AwsCredentials
    ) : ToolkitCredentialsProvider() {
        override fun resolveCredentials(): AwsCredentials {
            return credentials
        }
    }
}