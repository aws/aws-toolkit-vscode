// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.utils

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.ContainerCredentialsProvider
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.amazon.awssdk.utils.SdkAutoCloseable
import java.util.UUID

/**
 * Creates an [AwsCredentialsProvider] meant to be used in integration tests
 *
 * If the environment variable `ASSUME_ROLE_ARN` is set, it will be assumed using the default credential chain as the source credentials.
 * If it is not set, we will just use the default credential provider chain
 */
fun createIntegrationTestCredentialProvider(): AwsCredentialsProvider {
    // TODO: Finish https://github.com/aws/aws-toolkit-jetbrains/pull/2193 and revert back to Default Chain
    val defaultCredentials = ContainerCredentialsProvider.builder().build()

    return System.getenv("ASSUME_ROLE_ARN")?.takeIf { it.isNotEmpty() }?.let { role ->
        val sessionName = UUID.randomUUID().toString()
        val stsClient = StsClient.builder().credentialsProvider(defaultCredentials).build()
        val credentialsProvider = StsAssumeRoleCredentialsProvider.builder()
            .stsClient(stsClient)
            .refreshRequest(AssumeRoleRequest.builder().roleArn(role).roleSessionName(sessionName).build())
            .build()

        // Wrap this in SdkAutoClosable so we have a hook to close this STS client else IntelliJ will say we thread leak
        return object : AwsCredentialsProvider by credentialsProvider, SdkAutoCloseable {
            override fun close() {
                stsClient.close()
            }
        }
    } ?: defaultCredentials
}
