// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamInvokeRunner.SamRunner
import software.aws.toolkits.jetbrains.settings.SamSettings

class SamRunningState(
    environment: ExecutionEnvironment,
    val settings: SamRunSettings
) : CommandLineState(environment) {
    internal lateinit var codeLocation: String
    internal lateinit var runner: SamRunner

    override fun startProcess(): ProcessHandler {
        val samCliExecutable = SamSettings.getInstance().executablePath
        val commandLine = GeneralCommandLine(samCliExecutable)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.NONE)
            .withParameters("local")
            .withParameters("invoke")
            .withParameters("--template")
            .withParameters(createSamTemplate())
            .withParameters("--event")
            .withParameters(createEventFile())
            .withEnvironment(settings.environmentVariables)

        runner.patchSamCommand(this, commandLine)

        return ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
    }

    private fun createSamTemplate(): String {
        val template = """
            Resources:
              Function:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: ${settings.handler}
                  CodeUri: $codeLocation
                  Runtime: ${settings.runtime}
                  Timeout: 900
        """.trimIndent()

        val templateFile = FileUtil.createTempFile("${environment.runProfile.name}-template", ".yaml", true)
        templateFile.writeText(template)
        return templateFile.absolutePath
    }

    private fun createEventFile(): String {
        val eventFile = FileUtil.createTempFile("${environment.runProfile.name}-event", ".json", true)
        eventFile.writeText(settings.input)
        return eventFile.absolutePath
    }
}