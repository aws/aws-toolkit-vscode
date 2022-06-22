// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.experiment

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentManager
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentStateChangedListener
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.AwsToolkitExplorerToolWindow
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

object CodeWhispererExperiment : ToolkitExperiment(
    "codeWhisperer",
    { message("codewhisperer.experiment") },
    { message("codewhisperer.experiment.description") },
    default = true
) {
    init {
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(
            ToolkitExperimentManager.EXPERIMENT_CHANGED,
            object : ToolkitExperimentStateChangedListener {
                override fun enableSettingsStateChanged(toolkitExperiment: ToolkitExperiment) {
                    if (toolkitExperiment is CodeWhispererExperiment) {
                        DataManager.getInstance().dataContextFromFocusAsync.onSuccess { dataContext ->
                            val project = dataContext.getData(CommonDataKeys.PROJECT) ?: return@onSuccess
                            CodeWhispererExplorerActionManager.getInstance().reset()
                            project.refreshDevToolTree()
                            AwsToolkitExplorerToolWindow.getInstance(project).setDevToolsTabVisible(toolkitExperiment.isEnabled())
                        }
                    }
                }
            }
        )
    }
}
