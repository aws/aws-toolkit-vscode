// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.gateway.connection.GitSettings
import software.aws.toolkits.jetbrains.gateway.connection.caws.CawsCommandExecutor
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.resources.message

class CloneCode(
    private val remoteScriptPath: String,
    private val gitSettings: GitSettings.CloneGitSettings,
    private val remoteCommandExecutor: CawsCommandExecutor,
) : PtyCliBasedStep() {
    override val stepName: String = message("gateway.connection.workflow.git_clone")

    override fun constructCommandLine(context: Context): GeneralCommandLine = remoteCommandExecutor.buildGitCloneCommand(remoteScriptPath, gitSettings)
}
