// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.clients

import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.profiles.ProfileFile
import java.io.InputStream

fun ClientOverrideConfiguration.Builder.nullDefaultProfileFile() = defaultProfileFile(
    ProfileFile.builder()
        .content(InputStream.nullInputStream())
        .type(ProfileFile.Type.CONFIGURATION)
        .build()
)
