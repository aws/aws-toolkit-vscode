// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource

fun Project.refreshAwsTree(resource: Resource<*>? = null) {
    val cache = AwsResourceCache.getInstance(this)
    if (resource == null) {
        cache.clear()
    } else {
        cache.clear(resource)
    }
    runInEdt {
        // redraw explorer
        ExplorerToolWindow.getInstance(this).invalidateTree()
    }
}
