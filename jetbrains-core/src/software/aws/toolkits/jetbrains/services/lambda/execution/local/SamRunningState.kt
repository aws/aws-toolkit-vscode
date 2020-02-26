// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.CommandLineState
import com.intellij.execution.executors.DefaultDebugExecutor
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.util.io.FileUtil
import software.aws.toolkits.jetbrains.core.credentials.toEnvironmentVariables
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutableIfPresent
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable

class SamRunningState(
    environment: ExecutionEnvironment,
    val settings: LocalLambdaRunSettings
) : CommandLineState(environment) {
    lateinit var builtLambda: BuiltLambda

    val runner = if (environment.executor.id == DefaultDebugExecutor.EXECUTOR_ID) {
        SamDebugger(settings.runtimeGroup)
    } else {
        SamRunner()
    }

    override fun startProcess(): ProcessHandler {
        val totalEnvVars = settings.environmentVariables.toMutableMap()
        totalEnvVars += settings.credentials.resolveCredentials().toEnvironmentVariables()
        totalEnvVars += settings.region.toEnvironmentVariables()

        val samExecutable = ExecutableManager.getInstance().getExecutableIfPresent<SamExecutable>().let {
            when (it) {
                is ExecutableInstance.Executable -> it
                else -> throw RuntimeException((it as? ExecutableInstance.BadExecutable)?.validationError ?: "")
            }
        }
        val commandLine = samExecutable.getCommandLine()
            .withParameters("local")
            .withParameters("invoke")
            .apply { settings.templateDetails?.run { withParameters(logicalName) } }
            .withParameters("--template")
            .withParameters(builtLambda.templateLocation.toString())
            .withParameters("--event")
            .withParameters(createEventFile())
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

        samOptions.additionalLocalArgs?.let {
            if (it.isNotBlank()) {
                commandLine.withParameters(*it.split(" ").toTypedArray())
            }
        }

        runner.patchCommandLine(commandLine)

        return ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
    }

    private fun createEventFile(): String {
        val eventFile = FileUtil.createTempFile("${environment.runProfile.name}-event", ".json", true)
        eventFile.writeText(settings.input)
        return eventFile.absolutePath
    }
}
