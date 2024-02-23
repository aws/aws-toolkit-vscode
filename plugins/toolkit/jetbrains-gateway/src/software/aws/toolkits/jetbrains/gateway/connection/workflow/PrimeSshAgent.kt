// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection.workflow

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.gateway.connection.GitSettings
import software.aws.toolkits.jetbrains.gateway.connection.buildAgentPrimeCommand
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message

class PrimeSshAgent(
    private val gitSettings: GitSettings.CloneGitSettings,
) : PtyCliBasedStep() {
    override val stepName: String = message("gateway.connection.workflow.prime_ssh_agent")

    override fun constructCommandLine(context: Context): GeneralCommandLine? = buildAgentPrimeCommand(gitSettings.repo)

    override fun handleErrorResult(exitCode: Int, output: String, stepEmitter: StepEmitter) {
        if (exitCode != 255) return

        return super.handleErrorResult(exitCode, output, stepEmitter)
    }
}
