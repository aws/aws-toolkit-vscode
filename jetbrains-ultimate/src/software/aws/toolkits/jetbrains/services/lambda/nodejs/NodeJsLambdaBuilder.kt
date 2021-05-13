// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.lang.javascript.DialectDetector
import com.intellij.lang.typescript.compiler.TypeScriptCompilerService
import com.intellij.lang.typescript.tsconfig.TypeScriptConfig
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.psi.PsiElement
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.HandlerRunSettings
import software.aws.toolkits.jetbrains.services.lambda.steps.BuildLambdaRequest
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.MessageEmitter
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.resources.message
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

class NodeJsLambdaBuilder : LambdaBuilder() {
    private open class JsLambdaBuilder : LambdaBuilder() {
        override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path =
            getSourceRoot(handlerElement)
    }

    private class TsLambdaBuilder : JsLambdaBuilder() {
        override fun handlerForDummyTemplate(settings: HandlerRunSettings, handlerElement: PsiElement): String {
            val handler = super.handlerForDummyTemplate(settings, handlerElement)

            return "$TS_BUILD_DIR/$handler"
        }

        override fun buildFromHandler(project: Project, settings: HandlerRunSettings): BuildLambdaRequest {
            val buildRequest = super.buildFromHandler(project, settings)
            val handlerElement = Lambda.findPsiElementsForHandler(project, settings.runtime, settings.handler).first()
            val sourceRoot = getSourceRoot(handlerElement)

            val buildWithTsStep = object : Step() {
                override val stepName = message("lambda.build.typescript.compiler.step")

                override fun execute(context: Context, messageEmitter: MessageEmitter, ignoreCancellation: Boolean) {
                    // relative to source root so that SAM build can copy it over to the correct place
                    val tsOutput = sourceRoot.resolve(TS_BUILD_DIR).normalize().toAbsolutePath().toString()
                    // relative to existing tsconfig because there is no other option https://github.com/microsoft/TypeScript/issues/25430
                    val tsConfig = sourceRoot.resolve(TS_CONFIG_FILE)
                    if (!tsConfig.exists()) {
                        Files.createFile(tsConfig)
                    }

                    // TODO: if there's an existing tsconfig file, should we use it as a base?
                    tsConfig.writeText(
                        // language=JSON
                        """
                        {
                            "compilerOptions": {
                                "${TypeScriptConfig.TYPE_ROOTS}": [
                                  "${sourceRoot.resolve(TypeScriptConfig.DEFAULT_TYPES_DIRECTORY)}"
                                ],
                                "${TypeScriptConfig.TYPES}": [
                                  "node"
                                ],
                                "${TypeScriptConfig.TARGET_OPTION}": "${TypeScriptConfig.LanguageTarget.ES6.libName}",
                                "${TypeScriptConfig.MODULE}": "${TypeScriptConfig.MODULE_COMMON_JS}",
                                "${TypeScriptConfig.OUT_DIR}": "$tsOutput",
                                "${TypeScriptConfig.ROOT_DIR}": ".",
                                "sourceRoot": "$sourceRoot",
                                "${TypeScriptConfig.SOURCE_MAP}": true
                            }
                        }
                        """.trimIndent()
                    )

                    val tsConfigVirtualFile = VfsUtil.findFile(tsConfig, true) ?: throw RuntimeException("Could not find temporary tsconfig file using VFS")
                    val tsService = TypeScriptCompilerService.getServiceForFile(project, handlerElement.containingFile.virtualFile)

                    messageEmitter.emitMessageLine(message("lambda.build.typescript.compiler.running", tsConfig), false)
                    val compilerFuture = tsService.compileConfigProjectAndGetErrors(tsConfigVirtualFile)
                    val results = compilerFuture?.get()
                        ?: throw RuntimeException(message("lambda.build.typescript.compiler.ide_error"))

                    messageEmitter.emitMessageLine(message("lambda.build.typescript.compiler.processed_files"), false)
                    results.processedFiles.forEach {
                        messageEmitter.emitMessageLine(it, false)
                    }

                    messageEmitter.emitMessageLine(message("lambda.build.typescript.compiler.emitted_files"), false)
                    results.emittedFiles.forEach {
                        messageEmitter.emitMessageLine(it, false)
                    }

                    // errors, warnings, etc
                    messageEmitter.emitMessageLine(message("lambda.build.typescript.compiler.annotation_results"), false)
                    results.annotationResults.forEach {
                        val isError = it.severity >= HighlightSeverity.WARNING
                        val location = "${it.absoluteFilePath ?: '?'}:${it.line + 1}:"
                        messageEmitter.emitMessageLine(location + it.description, isError)
                    }
                }
            }

            return buildRequest.copy(
                preBuildSteps = buildRequest.preBuildSteps + listOf(buildWithTsStep)
            )
        }
    }

    private val jsLambdaBuilder = JsLambdaBuilder()
    private val tsLambdaBuilder = TsLambdaBuilder()

    private fun determineBuilder(handlerElement: PsiElement) =
        runReadAction {
            if (DialectDetector.isTypeScript(handlerElement)) {
                tsLambdaBuilder
            } else {
                jsLambdaBuilder
            }
        }

    override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement) =
        determineBuilder(handlerElement).handlerBaseDirectory(module, handlerElement)

    override fun handlerForDummyTemplate(settings: HandlerRunSettings, handlerElement: PsiElement) =
        determineBuilder(handlerElement).handlerForDummyTemplate(settings, handlerElement)

    override fun buildFromHandler(project: Project, settings: HandlerRunSettings): BuildLambdaRequest {
        val handlerElement = Lambda.findPsiElementsForHandler(project, settings.runtime, settings.handler).first()

        return determineBuilder(handlerElement).buildFromHandler(project, settings)
    }

    companion object {
        private const val TS_BUILD_DIR = "aws-toolkit-ts-output"
        private const val TS_CONFIG_FILE = "aws-toolkit-tsconfig.json"

        private fun getSourceRoot(handlerElement: PsiElement): Path {
            val handlerVirtualFile = runReadAction { handlerElement.containingFile?.virtualFile }
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
            val sourceRootVirtualFile = inferSourceRoot(handlerVirtualFile)
                ?: throw IllegalStateException("Cannot locate package.json for $handlerVirtualFile")
            return Paths.get(sourceRootVirtualFile.path)
        }
    }
}
