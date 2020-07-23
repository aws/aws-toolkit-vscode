// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.process.CapturingProcessRunner
import com.intellij.execution.process.ColoredProcessHandler
import com.intellij.execution.process.ProcessHandler
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import com.intellij.util.io.Compressor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.future.await
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.jetbrains.core.executables.ExecutableInstance
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.getExecutable
import software.aws.toolkits.jetbrains.services.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_MEMORY_SIZE
import software.aws.toolkits.jetbrains.services.lambda.LambdaLimits.DEFAULT_TIMEOUT
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.nio.file.Paths

abstract class LambdaBuilder {

    /**
     * Returns the base directory of the Lambda handler
     */
    abstract fun baseDirectory(module: Module, handlerElement: PsiElement): String

    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     */
    fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        timeout: Int,
        memorySize: Int,
        envVars: Map<String, String>,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit = {}
    ): BuiltLambda {
        val baseDir = baseDirectory(module, handlerElement)

        val customTemplate = getBuildDirectory(module).resolve("template.yaml")

        val logicalId = "Function"
        SamTemplateUtils.writeDummySamTemplate(customTemplate, logicalId, runtime, baseDir, handler, timeout, memorySize, envVars)

        return buildLambdaFromTemplate(module, customTemplate, logicalId, samOptions, onStart)
    }

    suspend fun constructSamBuildCommand(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        samOptions: SamOptions,
        buildDir: Path
    ): GeneralCommandLine {
        val executable = ExecutableManager.getInstance().getExecutable<SamExecutable>().await()
        val samExecutable = when (executable) {
            is ExecutableInstance.Executable -> executable
            else -> {
                throw RuntimeException((executable as? ExecutableInstance.BadExecutable)?.validationError ?: "")
            }
        }

        val commandLine = samExecutable.getCommandLine()
            .withParameters("build")
            .withParameters(logicalId)
            .withParameters("--template")
            .withParameters(templateLocation.toString())
            .withParameters("--build-dir")
            .withParameters(buildDir.toString())

        if (samOptions.buildInContainer) {
            commandLine.withParameters("--use-container")
        }

        if (samOptions.skipImagePull) {
            commandLine.withParameters("--skip-pull-image")
        }

        samOptions.dockerNetwork?.let { network ->
            val sanitizedNetwork = network.trim()
            if (sanitizedNetwork.isNotBlank()) {
                commandLine.withParameters("--docker-network").withParameters(sanitizedNetwork)
            }
        }

        samOptions.additionalBuildArgs?.let { buildArgs ->
            if (buildArgs.isNotBlank()) {
                commandLine.withParameters(*buildArgs.split(" ").toTypedArray())
            }
        }

        commandLine.withEnvironment(additionalEnvironmentVariables(module, samOptions))

        return commandLine
    }

    fun buildLambdaFromTemplate(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit = {}
    ): BuiltLambda {
        val functions = SamTemplateUtils.findFunctionsFromTemplate(
            module.project,
            templateLocation.toFile()
        )

        val codeLocation = ReadAction.compute<String, Throwable> {
            functions.find { it.logicalName == logicalId }
                ?.codeLocation()
                ?: throw RuntimeConfigurationError(
                    message(
                        "lambda.run_configuration.sam.no_such_function",
                        logicalId,
                        templateLocation
                    )
                )
        }

        val buildDir = getBuildDirectory(module)

        return runBlocking(Dispatchers.IO) {
            val commandLine = constructSamBuildCommand(module, templateLocation, logicalId, samOptions, buildDir)

            val pathMappings = listOf(
                PathMapping(templateLocation.parent.resolve(codeLocation).toString(), "/"),
                PathMapping(buildDir.resolve(logicalId).toString(), "/")
            )

            val processHandler = ColoredProcessHandler(commandLine)

            onStart.invoke(processHandler)

            val processOutput = CapturingProcessRunner(processHandler).runProcess()
            if (processOutput.exitCode != 0) {
                throw IllegalStateException(message("sam.build.failed"))
            }

            val builtTemplate = buildDir.resolve("template.yaml")
            if (!builtTemplate.exists()) {
                throw IllegalStateException("Failed to locate built template, $builtTemplate does not exist")
            }

            return@runBlocking BuiltLambda(builtTemplate, buildDir.resolve(logicalId), pathMappings)
        }
    }

    fun packageLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit = {}
    ): Path {
        val builtLambda = buildLambda(module, handlerElement, handler, runtime, DEFAULT_TIMEOUT, DEFAULT_MEMORY_SIZE, emptyMap(), samOptions, onStart)
        val zipLocation = FileUtil.createTempFile("builtLambda", "zip", true)
        Compressor.Zip(zipLocation).use {
            it.addDirectory(builtLambda.codeLocation.toFile())
        }
        return zipLocation.toPath()
    }

    /**
     * Returns the build directory of the project. Create this if it doesn't exist yet.
     */
    protected open fun getBuildDirectory(module: Module): Path {
        val contentRoot = module.rootManager.contentRoots.firstOrNull()
            ?: throw IllegalStateException(message("lambda.build.module_with_no_content_root", module.name))
        return Paths.get(contentRoot.path, ".aws-sam", "build")
    }

    protected open fun additionalEnvironmentVariables(module: Module, samOptions: SamOptions): Map<String, String> = emptyMap()

    companion object : RuntimeGroupExtensionPointObject<LambdaBuilder>(ExtensionPointName("aws.toolkit.lambda.builder"))
}

/**
 * Represents the result of building a Lambda
 *
 * @param templateLocation The path to the build generated template
 * @param codeLocation The path to the built lambda directory
 * @param mappings Source mappings from original codeLocation to the path inside of the archive
 */
data class BuiltLambda(
    val templateLocation: Path,
    val codeLocation: Path,
    val mappings: List<PathMapping> = emptyList()
)

// TODO Use these in this class
sealed class BuildLambdaRequest

data class BuildLambdaFromTemplate(
    val templateLocation: Path,
    val logicalId: String,
    val samOptions: SamOptions
) : BuildLambdaRequest()

data class BuildLambdaFromHandler(
    val handlerElement: PsiElement,
    val handler: String,
    val runtime: Runtime,
    val timeout: Int,
    val memorySize: Int,
    val envVars: Map<String, String>,
    val samOptions: SamOptions
) : BuildLambdaRequest()

data class PackageLambdaFromHandler(
    val handlerElement: PsiElement,
    val handler: String,
    val runtime: Runtime,
    val samOptions: SamOptions
)
