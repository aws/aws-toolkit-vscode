// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.cwqTab

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.explorer.AbstractExplorerTreeToolWindow

class CodewhispererQToolWindow(project: Project) : AbstractExplorerTreeToolWindow(
    CwQTreeStructure(project)
) {
    override val actionPlace = ToolkitPlaces.CWQ_TOOL_WINDOW

    companion object {
        fun getInstance(project: Project) = project.service<CodewhispererQToolWindow>()
    }
}
