// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.region.AwsRegion

/**
 * Factory for adding new credential providers to the central credential management system
 */
interface CredentialProviderFactory {
    /**
     * ID used to uniquely identify this factory
     */
    val id: String

    /**
     * Invoked on creation of the factory to update the credential system with what [ToolkitCredentialsIdentifier] this factory
     * is capable of creating. The provided [credentialLoadCallback] is capable of being invoked multiple times in the case that
     * the credentials this factory creates is modified in some way.
     */
    fun setUp(credentialLoadCallback: CredentialsChangeListener)

    /**
     * Creates an [AwsCredentialsProvider] for the specified [ToolkitCredentialsIdentifier] scoped to the specified [region]
     */
    fun createAwsCredentialProvider(
        providerId: ToolkitCredentialsIdentifier,
        region: AwsRegion,
        sdkHttpClientSupplier: () -> SdkHttpClient
    ): AwsCredentialsProvider
}
