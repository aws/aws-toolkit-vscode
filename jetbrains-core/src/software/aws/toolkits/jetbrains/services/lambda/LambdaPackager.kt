// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.execution.configurations.GeneralCommandLine
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
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamCommon
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

/**
 * TODO: We are mid migration of custom packager -> sam build. This class should be renamed to LambdaBuilder since sam
 * build does not create the zip
 */
abstract class LambdaPackager {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     */
    abstract fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String> = emptyMap()
    ): CompletionStage<LambdaPackage>

    open fun buildLambdaFromTemplate(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        envVars: Map<String, String>
    ): CompletionStage<LambdaPackage> {
        val future = CompletableFuture<LambdaPackage>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val buildDir = FileUtil.createTempDirectory("lambdaBuild", null, true).toPath()

            val commandLine = SamCommon.getSamCommandLine()
                .withParentEnvironmentType(GeneralCommandLine.ParentEnvironmentType.CONSOLE)
                .withParameters("build")
                .withParameters("--template")
                .withParameters(templateLocation.toString())
                .withParameters("--build-dir")
                .withParameters(buildDir.toString())

            val processHandler = ProcessHandlerFactory.getInstance().createColoredProcessHandler(commandLine)
            processHandler.addProcessListener(object : ProcessAdapter() {
                override fun onTextAvailable(event: ProcessEvent, outputType: Key<*>) {
                    // TODO: We should find a way to show the output of this in the UI
                    println(event.text)
                }

                override fun processTerminated(event: ProcessEvent) {
                    if (event.exitCode == 0) {
                        val builtTemplate = buildDir.resolve("template.yaml")

                        if (!builtTemplate.exists()) {
                            future.completeExceptionally(IllegalStateException("Failed to locate built template, $builtTemplate does not exist"))
                        }

                        future.complete(
                            LambdaPackage(
                                builtTemplate,
                                buildDir.resolve(logicalId),
                                emptyMap()
                            )
                        )
                    } else {
                        // TODO Move to message()
                        future.completeExceptionally(IllegalStateException("SAM build command failed"))
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
        runtime: Runtime
    ): CompletionStage<Path> = buildLambda(module, handlerElement, handler, runtime)
        .thenApply { lambdaLocation ->
            val zipLocation = FileUtil.createTempFile("lambdaPackage", "zip", true)
            Compressor.Zip(zipLocation).use {
                it.addDirectory(lambdaLocation.codeLocation.toFile())
            }
            zipLocation.toPath()
        }

    companion object : RuntimeGroupExtensionPointObject<LambdaPackager>(
        ExtensionPointName("aws.toolkit.lambda.packager")
    )
}

/**
 * Represents the result of the packager
 *
 * @param templateLocation The path to the build generated template TODO: Currently nullable during the sam build migration
 * @param codeLocation The path to the built lambda directory
 * @param mappings Source mappings from original codeLocation to the path inside of the archive
 */
data class LambdaPackage(
    val templateLocation: Path?,
    val codeLocation: Path,
    val mappings: Map<String, String> = emptyMap()
)