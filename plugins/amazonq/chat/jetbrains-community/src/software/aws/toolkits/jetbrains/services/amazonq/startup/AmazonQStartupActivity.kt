// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.startup

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.jetbrains.core.gettingstarted.emitUserState
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindow
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import java.util.concurrent.atomic.AtomicBoolean

class AmazonQStartupActivity : ProjectActivity {
    private val runOnce = AtomicBoolean(false)

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

        if (runOnce.get()) return
        emitUserState(project)
        runOnce.set(true)
    }
}
