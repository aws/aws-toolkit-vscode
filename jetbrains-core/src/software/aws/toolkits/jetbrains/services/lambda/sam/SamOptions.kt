// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.Tag

@Tag("sam")
class SamOptions : BaseState() {
    var dockerNetwork by string()
    var buildInContainer by property(false)
    var skipImagePull by property(false)

    fun patchCommandLine(commandLine: GeneralCommandLine) {
        if (buildInContainer) {
            commandLine.withParameters("--use-container")
        }

        if (skipImagePull) {
            commandLine.withParameters("--skip-pull-image")
        }

        dockerNetwork?.let {
            if (it.isNotBlank()) {
                commandLine.withParameters("--docker-network")
                    .withParameters(it.trim())
            }
        }
    }
}