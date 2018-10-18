// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.settings.SamSettings
import java.io.File

class SamRunningState(
    environment: ExecutionEnvironment,
    val settings: SamRunSettings
) : CommandLineState(environment) {
    internal lateinit var lambdaPackage: LambdaPackage
    internal lateinit var runner: SamRunner

    override fun startProcess(): ProcessHandler {
        val samCliExecutable = SamSettings.getInstance().executablePath
        val commandLine = GeneralCommandLine(samCliExecutable)
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            .withParameters("local")
            .withParameters("invoke")
            .withParameters("--template")
            .withParameters(samTemplate())
            .withParameters("--event")
            .withParameters(createEventFile())
            .apply { settings.templateDetails?.run { withParameters(logicalName) } }
            .withEnvironment(settings.environmentVariables)
            .withEnvironment("PYTHONUNBUFFERED", "1") // Force SAM to not buffer stdout/stderr so it gets shown in IDE

        runner.patchCommandLine(this, commandLine)

        return ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
    }

    private fun samTemplate(): String {
        val tempFile = FileUtil.createTempFile("${environment.runProfile.name}-template", ".yaml", true)
        when {
            settings.templateDetails != null -> substituteCodeUri(tempFile, settings.templateDetails)
            else -> writeDummySamTemplate(tempFile)
        }

        return tempFile.absolutePath
    }

    private fun substituteCodeUri(tempFile: File, templateDetails: SamTemplateDetails) {
        File(templateDetails.templateFile).copyTo(tempFile, overwrite = true)
        updateCodeUriForFunctions(tempFile, lambdaPackage.location.toString())
    }

    private fun writeDummySamTemplate(tempFile: File) {
        val template = """
            Resources:
              Function:
                Type: AWS::Serverless::Function
                Properties:
                  Handler: ${settings.handler}
                  CodeUri: ${lambdaPackage.location}
                  Runtime: ${settings.runtime}
                  Timeout: 900
        """.trimIndent()

        tempFile.writeText(template)
    }

    private fun createEventFile(): String {
        val eventFile = FileUtil.createTempFile("${environment.runProfile.name}-event", ".json", true)
        eventFile.writeText(settings.input)
        return eventFile.absolutePath
    }
}