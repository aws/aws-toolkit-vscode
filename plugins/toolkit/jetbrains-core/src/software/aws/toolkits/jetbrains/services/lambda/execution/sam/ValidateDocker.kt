// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessListener
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
import software.aws.toolkits.resources.message

class ValidateDocker : CliBasedStep() {
    override val stepName: String = "Validate Docker"

    override fun constructCommandLine(context: Context): GeneralCommandLine = GeneralCommandLine("docker", "ps")

    override fun handleErrorResult(exitCode: Int, output: String, stepEmitter: StepEmitter) {
        throw Exception(message("lambda.debug.docker.not_connected"))
    }

    // Change logger to not log std out since we dont actually want the output of docker
    override fun createProcessEmitter(stepEmitter: StepEmitter): ProcessListener = CliOutputEmitter(stepEmitter, printStdOut = false)
}
