// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamTemplateUtils.writeDummySamTemplate
import java.io.File
import java.nio.file.Path

class SamRunningState(
    environment: ExecutionEnvironment,
    val settings: SamRunSettings
) : CommandLineState(environment) {
    internal lateinit var lambdaPackage: LambdaPackage
    internal lateinit var runner: SamRunner

    override fun startProcess(): ProcessHandler {
        val totalEnvVars = settings.environmentVariables.toMutableMap()
        settings.credentials?.let {
            totalEnvVars += it.toEnvironmentVariables()
        }

        totalEnvVars["AWS_REGION"] = settings.regionId
        totalEnvVars["AWS_DEFAULT_REGION"] = settings.regionId

        val template = lambdaPackage.templateLocation ?: samTemplate()

        val commandLine = SamCommon.getSamCommandLine()
            .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
            .withParameters("local")
            .withParameters("invoke")
            .withParameters("--skip-pull-image")
            .withParameters("--template")
            .withParameters(template.toString())
            .withParameters("--event")
            .withParameters(createEventFile())
            .apply { settings.templateDetails?.run { withParameters(logicalName) } }
            .withEnvironment(totalEnvVars)
            .withEnvironment("PYTHONUNBUFFERED", "1") // Force SAM to not buffer stdout/stderr so it gets shown in IDE

        runner.patchCommandLine(this, commandLine)

        return ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
    }

    private fun samTemplate(): Path {
        val tempFile = FileUtil.createTempFile("${environment.runProfile.name}-template", ".yaml", true)
        when {
            settings.templateDetails != null -> substituteCodeUri(tempFile, settings.templateDetails)
            else -> writeDummySamTemplate(
                tempFile,
                settings.runtime,
                lambdaPackage.codeLocation.toString(),
                settings.handler,
                settings.environmentVariables
            )
        }

        return tempFile.toPath()
    }

    private fun substituteCodeUri(tempFile: File, templateDetails: SamTemplateDetails) {
        val file = LocalFileSystem.getInstance().refreshAndFindFileByPath(templateDetails.templateFile)
                ?: throw IllegalStateException("Failed to load the template file: ${templateDetails.templateFile}")
        val template = CloudFormationTemplate.parse(environment.project, file)
        val function = template.getResourceByName(templateDetails.logicalName) as? Function
                ?: throw IllegalStateException("Failed to locate the resource: ${templateDetails.logicalName}")
        function.setCodeLocation(lambdaPackage.codeLocation.toString())

        template.saveTo(tempFile)
    }

    private fun createEventFile(): String {
        val eventFile = FileUtil.createTempFile("${environment.runProfile.name}-event", ".json", true)
        eventFile.writeText(settings.input)
        return eventFile.absolutePath
    }
}