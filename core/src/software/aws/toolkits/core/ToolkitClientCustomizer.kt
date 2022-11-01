// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration

/**
 * Used to override/add behavior during AWS SDK Client creation.
 *
 * Example usage to add a local development endpoint for a particular service:
 *
 * ```
 * class MyDevEndpointCustomizer : AwsClientCustomizer {
 *   override fun customize(credentialProvider: AwsCredentialsProvider, regionId: String, builder: AwsClientBuilder<*, *>) {
 *     if (builder is LambdaClientBuilder && connection.region.id == "us-west-2") {
 *       builder.endpointOverride(URI.create("http://localhost:8888"))
 *     }
 *   }
 * }
 * ```
 */
fun interface ToolkitClientCustomizer {
    fun customize(
        credentialProvider: AwsCredentialsProvider?,
        tokenProvider: SdkTokenProvider?,
        regionId: String,
        builder: AwsClientBuilder<*, *>,
        clientOverrideConfiguration: ClientOverrideConfiguration.Builder
    )
}
