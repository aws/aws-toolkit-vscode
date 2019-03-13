// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplate
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils.writeDummySamTemplate
import java.io.File
import java.nio.file.Path

class SamRunningState(
    environment: ExecutionEnvironment,
    val settings: SamRunSettings
) : CommandLineState(environment) {
    internal lateinit var builtLambda: BuiltLambda
    internal lateinit var runner: SamRunner

    override fun startProcess(): ProcessHandler {
        val totalEnvVars = settings.environmentVariables.toMutableMap()
        totalEnvVars += settings.credentials.resolveCredentials().toEnvironmentVariables()
        totalEnvVars += settings.region.toEnvironmentVariables()

        val template = builtLambda.templateLocation ?: samTemplate()

        val commandLine = SamCommon.getSamCommandLine()
            .withParameters("local")
            .withParameters("invoke")
            .withParameters("--template")
            .withParameters(template.toString())
            .withParameters("--event")
            .withParameters(createEventFile())
            .apply { settings.templateDetails?.run { withParameters(logicalName) } }
            .withEnvironment(totalEnvVars)
            .withEnvironment("PYTHONUNBUFFERED", "1") // Force SAM to not buffer stdout/stderr so it gets shown in IDE

        val samOptions = settings.samOptions
        if (samOptions.skipImagePull) {
            commandLine.withParameters("--skip-pull-image")
        }

        samOptions.dockerNetwork?.let {
            if (it.isNotBlank()) {
                commandLine.withParameters("--docker-network")
                    .withParameters(it.trim())
            }
        }

        runner.patchCommandLine(this, commandLine)

        return ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
    }

    private fun samTemplate(): Path {
        val tempFile = FileUtil.createTempFile("${environment.runProfile.name}-template", ".yaml", true)
        when {
            settings.templateDetails != null -> substituteCodeUri(tempFile, settings.templateDetails)
            else -> writeDummySamTemplate(
                tempFile,
                "Function",
                settings.runtime,
                builtLambda.codeLocation.toString(),
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
        function.setCodeLocation(builtLambda.codeLocation.toString())

        template.saveTo(tempFile)
    }

    private fun createEventFile(): String {
        val eventFile = FileUtil.createTempFile("${environment.runProfile.name}-event", ".json", true)
        eventFile.writeText(settings.input)
        return eventFile.absolutePath
    }
}