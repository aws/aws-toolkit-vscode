// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandler
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import com.intellij.util.io.Compressor
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
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
import java.io.File
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException

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

        val customTemplate = File(getOrCreateBuildDirectory(module), "template.yaml")
        FileUtil.createIfDoesntExist(customTemplate)

        val logicalId = "Function"
        SamTemplateUtils.writeDummySamTemplate(customTemplate, logicalId, runtime, baseDir, handler, timeout, memorySize, envVars)

        return buildLambdaFromTemplate(module, customTemplate.toPath(), logicalId, samOptions, onStart)
    }

    open fun buildLambdaFromTemplate(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        samOptions: SamOptions,
        onStart: (ProcessHandler) -> Unit = {}
    ): BuiltLambda {
        val future = CompletableFuture<BuiltLambda>()

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

        ExecutableManager.getInstance().getExecutable<SamExecutable>().thenApply {
            val samExecutable = when (it) {
                is ExecutableInstance.Executable -> it
                else -> {
                    future.completeExceptionally(RuntimeException((it as? ExecutableInstance.BadExecutable)?.validationError ?: ""))
                    return@thenApply
                }
            }

            val buildDir = getOrCreateBuildDirectory(module).toPath()

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

            samOptions.dockerNetwork?.let {
                if (it.isNotBlank()) {
                    commandLine.withParameters("--docker-network")
                        .withParameters(it.trim())
                }
            }

            samOptions.additionalBuildArgs?.let {
                if (it.isNotBlank()) {
                    commandLine.withParameters(*it.split(" ").toTypedArray())
                }
            }

            val pathMappings = listOf(
                PathMapping(templateLocation.parent.resolve(codeLocation).toString(), "/"),
                PathMapping(buildDir.resolve(logicalId).toString(), "/")
            )

            val processHandler = ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
            processHandler.addProcessListener(object : ProcessAdapter() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    // TODO: We should find a way to show the output of this in the UI
                    LOG.info { event.text }
                }

                override fun processTerminated(event: ProcessEvent) {
                    if (event.exitCode == 0) {
                        val builtTemplate = buildDir.resolve("template.yaml")

                        if (!builtTemplate.exists()) {
                            future.completeExceptionally(IllegalStateException("Failed to locate built template, $builtTemplate does not exist"))
                        }

                        future.complete(
                            BuiltLambda(
                                builtTemplate,
                                buildDir.resolve(logicalId),
                                pathMappings
                            )
                        )
                    } else {
                        future.completeExceptionally(IllegalStateException(message("sam.build.failed")))
                    }
                }
            })

            onStart.invoke(processHandler)

            processHandler.startNotify()
        }

        return try {
            future.get()
        } catch (e: ExecutionException) {
            throw e.cause ?: e
        }
    }

    open fun packageLambda(
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
    private fun getOrCreateBuildDirectory(module: Module): File {
        val contentRoot = module.rootManager.contentRoots.firstOrNull()
            ?: throw IllegalStateException(message("lambda.build.module_with_no_content_root", module.name))
        val buildFolder = File(contentRoot.path, ".aws-sam/build")
        FileUtil.createDirectory(buildFolder)
        return buildFolder
    }

    companion object : RuntimeGroupExtensionPointObject<LambdaBuilder>(ExtensionPointName("aws.toolkit.lambda.builder")) {
        private val LOG = getLogger<LambdaBuilder>()
    }
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
