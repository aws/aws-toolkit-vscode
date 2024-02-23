// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.clients

import software.amazon.awssdk.core.client.builder.SdkClientBuilder
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.profiles.ProfileFile
import java.io.InputStream

fun ClientOverrideConfiguration.Builder.nullDefaultProfileFile() = defaultProfileFile(
    ProfileFile.builder()
        .content(InputStream.nullInputStream())
        .type(ProfileFile.Type.CONFIGURATION)
        .build()
)

/**
 * Only use if this is the only [overrideConfiguration] block used by the [SdkClientBuilder]
 */
fun<C> SdkClientBuilder<*, C>.nullDefaultProfileFile() = apply {
    overrideConfiguration {
        it.nullDefaultProfileFile()
    }
}
