// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.clearResourceForCurrentConnection

fun Project.refreshAwsTree(resource: Resource<*>? = null) {
    if (resource == null) {
        this.clearResourceForCurrentConnection()
    } else {
        this.clearResourceForCurrentConnection(resource)
    }
    runInEdt {
        // redraw explorer
        ExplorerToolWindow.getInstance(this).invalidateTree()
    }
}
