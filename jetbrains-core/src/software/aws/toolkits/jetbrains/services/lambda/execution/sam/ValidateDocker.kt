// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.GeneralCommandLine
import software.aws.toolkits.jetbrains.utils.execution.steps.CliBasedStep
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.resources.message

class ValidateDocker : CliBasedStep() {
    override val stepName: String = "Validate Docker"

    override fun constructCommandLine(context: Context): GeneralCommandLine = GeneralCommandLine("docker", "ps")

    override fun handleErrorResult(exitCode: Int, output: String, messageEmitter: MessageEmitter): Nothing? {
        throw Exception(message("lambda.debug.docker.not_connected"))
    }
}
