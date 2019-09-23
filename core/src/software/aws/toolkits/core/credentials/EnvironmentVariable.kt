// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.aws.toolkits.core.credentials.EnvironmentVariableToolkitCredentialsProviderFactory.Companion.TYPE
import software.aws.toolkits.resources.message

class EnvironmentVariableToolkitCredentialsProvider : ToolkitCredentialsProvider() {
    private val awsCredentialsProvider = EnvironmentVariableCredentialsProvider.create()

    /**
     * Uses the factory ID as the ID for the provider as there is only one instance for Environment Variable Credentials Provider
     */
    override val id = TYPE
    override val displayName get() = message("credentials.env_vars.name")

    override fun resolveCredentials(): AwsCredentials = awsCredentialsProvider.resolveCredentials()
}

class EnvironmentVariableToolkitCredentialsProviderFactory(credentialsProviderManager: ToolkitCredentialsProviderManager) :
    ToolkitCredentialsProviderFactory<EnvironmentVariableToolkitCredentialsProvider>(TYPE, credentialsProviderManager) {
    init {
        val credentialsProvider = EnvironmentVariableToolkitCredentialsProvider()
        try {
            credentialsProvider.resolveCredentials()
            add(credentialsProvider)
        } catch (_: Exception) {
            // We can't create creds from env vars, so dont add it
        }
    }

    companion object {
        const val TYPE = "envVars"
    }
}
