// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.util.xmlb.annotations.Tag

@Tag("sam")
data class SamOptions(
    var dockerNetwork: String? = null,
    var buildInContainer: Boolean = false,
    var skipImagePull: Boolean = false,
    var additionalBuildArgs: String? = null,
    var additionalLocalArgs: String? = null
)
