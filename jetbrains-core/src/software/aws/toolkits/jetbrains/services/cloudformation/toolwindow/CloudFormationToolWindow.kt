// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.toolwindow

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow

class CloudFormationToolWindow(override val project: Project) : ToolkitToolWindow {
    override val toolWindowId = "aws.cloudformation"

    companion object {
        fun getInstance(project: Project) = ServiceManager.getService(project, CloudFormationToolWindow::class.java)
    }
}
