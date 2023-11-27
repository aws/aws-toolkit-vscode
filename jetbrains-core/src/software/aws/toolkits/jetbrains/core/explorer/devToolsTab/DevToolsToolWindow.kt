// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.explorer.AbstractExplorerTreeToolWindow

class DevToolsToolWindow(project: Project) : AbstractExplorerTreeToolWindow(
    DevToolsTreeStructure(project)
) {
    override val actionPlace = ToolkitPlaces.DEVTOOLS_TOOL_WINDOW

    companion object {
        fun getInstance(project: Project) = project.service<DevToolsToolWindow>()
    }
}
