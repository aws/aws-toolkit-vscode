// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.Tag

@Tag("sam")
class SamOptions : BaseState() {
    var dockerNetwork by string()
    var buildInContainer by property(false)
    var skipImagePull by property(false)
}