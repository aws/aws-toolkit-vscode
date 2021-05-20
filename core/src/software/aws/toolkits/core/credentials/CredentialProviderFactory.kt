// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
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
     * ID used to indicate where credentials are stored or retrieved from
     */
    val credentialSourceId: CredentialSourceId

    /**
     * Invoked on creation of the factory to update the credential system with what [CredentialIdentifier] this factory
     * is capable of creating. The provided [credentialLoadCallback] is capable of being invoked multiple times in the case that
     * the credentials this factory creates is modified in some way.
     */
    fun setUp(credentialLoadCallback: CredentialsChangeListener)

    /**
     * Creates an [AwsCredentialsProvider] for the specified [CredentialIdentifier] scoped to the specified [region]
     */
    fun createAwsCredentialProvider(
        providerId: CredentialIdentifier,
        region: AwsRegion
    ): AwsCredentialsProvider
}
