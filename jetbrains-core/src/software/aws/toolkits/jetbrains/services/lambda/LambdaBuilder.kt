// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.process.ProcessAdapter
import com.intellij.execution.process.ProcessEvent
import com.intellij.execution.process.ProcessHandlerFactory
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.openapi.util.Key
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import com.intellij.util.io.Compressor
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.services.lambda.execution.PathMapping
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

abstract class LambdaBuilder {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     */
    abstract fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String> = emptyMap(),
        useContainer: Boolean = false
    ): CompletionStage<BuiltLambda>

    open fun buildLambdaFromTemplate(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        useContainer: Boolean = false
    ): CompletionStage<BuiltLambda> {
        val future = CompletableFuture<BuiltLambda>()
        val codeLocation = SamTemplateUtils.findFunctionsFromTemplate(
            module.project,
            templateLocation.toFile()
        ).find { it.logicalName == logicalId }
            ?.codeLocation()
            ?: throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.sam.no_such_function",
                    logicalId,
                    templateLocation
                )
            )

        ApplicationManager.getApplication().executeOnPooledThread {
            val buildDir = FileUtil.createTempDirectory("lambdaBuild", null, true).toPath()

            val commandLine = SamCommon.getSamCommandLine()
                .withParameters("build")
                .withParameters("--template")
                .withParameters(templateLocation.toString())
                .withParameters("--build-dir")
                .withParameters(buildDir.toString())

            if (useContainer) {
                commandLine.withParameters("--use-container")
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

            processHandler.startNotify()
        }

        return future
    }

    open fun packageLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        useContainer: Boolean = false
    ): CompletionStage<Path> = buildLambda(module, handlerElement, handler, runtime, emptyMap(), useContainer)
        .thenApply { lambdaLocation ->
            val zipLocation = FileUtil.createTempFile("builtLambda", "zip", true)
            Compressor.Zip(zipLocation).use {
                it.addDirectory(lambdaLocation.codeLocation.toFile())
            }
            zipLocation.toPath()
        }

    companion object : RuntimeGroupExtensionPointObject<LambdaBuilder>(
        ExtensionPointName("aws.toolkit.lambda.builder")
    ) {
        private val LOG = getLogger<LambdaBuilder>()
    }
}

/**
 * Represents the result of building a Lambda
 *
 * @param templateLocation The path to the build generated template TODO: Currently nullable during the sam build migration
 * @param codeLocation The path to the built lambda directory
 * @param mappings Source mappings from original codeLocation to the path inside of the archive
 */
data class BuiltLambda(
    val templateLocation: Path?,
    val codeLocation: Path,
    val mappings: List<PathMapping> = emptyList()
)