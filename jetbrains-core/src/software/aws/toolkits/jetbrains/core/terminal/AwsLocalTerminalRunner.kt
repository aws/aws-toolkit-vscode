// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.terminal

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.terminal.JBTerminalWidget
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner

class AwsLocalTerminalRunner(
    project: Project,
    private val termName: String,
    private val applyConnection: (MutableMap<String, String>) -> Unit
) : LocalTerminalDirectRunner(project) {
    override fun getInitialCommand(envs: MutableMap<String, String>): MutableList<String> = super.getInitialCommand(envs.apply(applyConnection))
    override fun createTerminalWidget(parent: Disposable, currentWorkingDirectory: String?, deferSessionStartUntilUiShown: Boolean): JBTerminalWidget {
        val widget = super.createTerminalWidget(parent, currentWorkingDirectory, deferSessionStartUntilUiShown)
        return widget.apply {
            terminalTitle.change {
                tag = termName
            }
        }
    }
}
