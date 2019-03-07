// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.compiler.CompilerManager
import com.intellij.openapi.compiler.CompilerMessageCategory
import com.intellij.openapi.module.Module
import com.intellij.openapi.roots.OrderEnumerator
import com.intellij.openapi.util.io.FileUtil
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.lambda.BuiltLambda
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Path
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class JavaLambdaBuilder : LambdaBuilder() {
    // TODO: Remove override when we switch to sam build
    override fun buildLambdaFromTemplate(
        module: Module,
        templateLocation: Path,
        logicalId: String,
        useContainer: Boolean
    ): CompletionStage<BuiltLambda> {

        val function = SamTemplateUtils.findFunctionsFromTemplate(
            module.project,
            templateLocation.toFile()
        ).find { it.logicalName == logicalId }
            ?: throw RuntimeConfigurationError(
                message(
                    "lambda.run_configuration.sam.no_such_function",
                    logicalId,
                    templateLocation
                )
            )

        val handler = function.handler()
        val runtime = Runtime.fromValue(function.runtime())
        val element =
            Lambda.findPsiElementsForHandler(module.project, runtime, handler).firstOrNull()
                ?: throw RuntimeConfigurationError(message("lambda.run_configuration.handler_not_found", handler))

        return buildLambda(module, element, handler, runtime, emptyMap(), useContainer)
    }

    override fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String>,
        useContainer: Boolean
    ): CompletionStage<BuiltLambda> {
        val buildDir = FileUtil.createTempDirectory("lambdaBuild", null, true)

        val future = CompletableFuture<BuiltLambda>()
        val compilerManager = CompilerManager.getInstance(module.project)
        val compileScope = compilerManager.createModulesCompileScope(arrayOf(module), true, true)

        compilerManager.make(compileScope) { aborted, errors, _, context ->
            if (!aborted && errors == 0) {
                try {
                    copyLibraries(module, buildDir)
                    copyClasses(module, buildDir)
                    future.complete(BuiltLambda(null, buildDir.toPath()))
                } catch (e: Exception) {
                    future.completeExceptionally(RuntimeException(message("lambda.package.zip_fail"), e))
                }
            } else if (aborted) {
                future.completeExceptionally(RuntimeException(message("lambda.package.compilation_aborted")))
            } else {
                val errorMessages = context.getMessages(CompilerMessageCategory.ERROR).joinToString("\n")
                future.completeExceptionally(
                    RuntimeException(
                        message(
                            "lambda.package.compilation_errors",
                            errorMessages
                        )
                    )
                )
            }
        }
        return future
    }

    private fun copyLibraries(module: Module, buildDir: File) {
        val libDir = File(buildDir, "lib")
        productionRuntimeEntries(module)
            .librariesOnly()
            .pathsList.pathList
            .map { File(it) }
            .filter { it.exists() }
            .forEach { copyFileOrDir(it, libDir) }
    }

    private fun copyClasses(module: Module, buildDir: File) {
        productionRuntimeEntries(module)
            .withoutLibraries()
            .classes()
            .pathsList.pathList
            .map { File(it) }
            .filter { it.exists() }
            .forEach { copyFileOrDir(it, buildDir) }
    }

    private fun productionRuntimeEntries(module: Module) = OrderEnumerator.orderEntries(module)
        .recursively()
        .productionOnly()
        .runtimeOnly()
        .withoutSdk()

    private fun copyFileOrDir(source: File, dest: File) {
        if (source.isDirectory) {
            FileUtil.copyDir(source, dest, false)
        } else {
            FileUtil.copy(source, File(dest, source.name))
        }
    }

    companion object {
        val LOG = getLogger<JavaLambdaBuilder>()
    }
}