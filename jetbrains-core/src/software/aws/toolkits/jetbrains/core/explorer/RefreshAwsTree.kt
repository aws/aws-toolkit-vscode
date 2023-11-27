// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.explorer.cwqTab.CodewhispererQToolWindow
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.DevToolsToolWindow

fun Project.refreshAwsTree(resource: Resource<*>? = null, connectionSettings: ConnectionSettings = getConnectionSettingsOrThrow()) {
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

fun Project.refreshDevToolTree() {
    runInEdt {
        if (this.isDisposed) return@runInEdt
        DevToolsToolWindow.getInstance(this).redrawContent()
    }
}

fun Project.refreshCwQTree() {
    runInEdt {
        if (this.isDisposed) return@runInEdt
        CodewhispererQToolWindow.getInstance(this).redrawContent()
    }
}
