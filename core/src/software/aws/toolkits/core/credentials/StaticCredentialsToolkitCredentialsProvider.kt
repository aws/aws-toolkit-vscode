// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentials

class StaticCredentialsToolkitCredentialsProvider(private val awsCredentials: AwsCredentials) : ToolkitCredentialsProvider() {
    /**
     * Uses the factory ID as the ID for the provider as there is only one instance for Environment Variable Credentials Provider
     */
    override val id = "Static"
    override val displayName get() = "Static Credentials: $awsCredentials"

    override fun resolveCredentials(): AwsCredentials = awsCredentials
}