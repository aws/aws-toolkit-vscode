// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.startup

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindow
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager

class AmazonQStartupActivity : ProjectActivity {
    override suspend fun execute(project: Project) {
        // initialize html contents in BGT so users don't have to wait when they open the tool window
        AmazonQToolWindow.getInstance(project)

        if (CodeWhispererExplorerActionManager.getInstance().getIsFirstRestartAfterQInstall()) {
            runInEdt {
                val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(AmazonQToolWindowFactory.WINDOW_ID) ?: return@runInEdt
                toolWindow.show()
                CodeWhispererExplorerActionManager.getInstance().setIsFirstRestartAfterQInstall(false)
            }
        }
    }
}
