// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider

class ProfileCredentialProviderFactory : CredentialProviderFactory {
    override fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory {
        return ProfileToolkitCredentialsProviderFactory(
            AwsSdkClient.getInstance().sdkHttpClient,
            AwsRegionProvider.getInstance()
        )
    }
}