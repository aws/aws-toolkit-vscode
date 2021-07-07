// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager.Companion.getConnectionSettings
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings

fun Project.refreshAwsTree(resource: Resource<*>? = null, connectionSettings: ConnectionSettings = getConnectionSettings()) {
    if (resource == null) {
        AwsResourceCache.getInstance().clear(connectionSettings)
    } else {
        AwsResourceCache.getInstance().clear(resource, connectionSettings)
    }

    runInEdt {
        // redraw explorer
        ExplorerToolWindow.getInstance(this).invalidateTree()
    }
}
