// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.lang.javascript.DialectDetector
import com.intellij.lang.typescript.compiler.TypeScriptService
import com.intellij.lang.typescript.tsconfig.TypeScriptConfig
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.psi.PsiElement
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.inputStream
import software.aws.toolkits.core.utils.writeText
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.HandlerRunSettings
import software.aws.toolkits.jetbrains.services.lambda.steps.BuildLambdaRequest
import software.aws.toolkits.jetbrains.utils.execution.steps.Context
import software.aws.toolkits.jetbrains.utils.execution.steps.Step
import software.aws.toolkits.jetbrains.utils.execution.steps.StepEmitter
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

                override fun execute(context: Context, stepEmitter: StepEmitter, ignoreCancellation: Boolean) {
                    // relative to source root so that SAM build can copy it over to the correct place
                    val tsOutput = sourceRoot.resolve(TS_BUILD_DIR).normalize().toAbsolutePath().toString()
                    // relative to existing tsconfig because there is no other option https://github.com/microsoft/TypeScript/issues/25430
                    val tsConfig = sourceRoot.resolve(TS_CONFIG_FILE)

                    // read base ts config into mutable map
                    fun loadBaseConfig(tsConfig: Path): MutableMap<String, Any>? {
                        if (!tsConfig.exists()) {
                            return null
                        }

                        try {
                            val tsConfigMap: MutableMap<String, Any> = MAPPER.readValue(tsConfig.inputStream())
                            stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.using_base", tsConfig), false)
                            return tsConfigMap
                        } catch (e: JsonProcessingException) {
                            stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.using_base_error", tsConfig), true)
                        }

                        return null
                    }
                    val tsConfigMap = loadBaseConfig(tsConfig)
                        ?: loadBaseConfig(sourceRoot.resolve(TS_CONFIG_INITIAL_BASE_FILE))
                        ?: mutableMapOf()

                    // will create config from scratch if no base config has been loaded
                    if (tsConfigMap.isEmpty()) {
                        stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.creating_config"), false)
                    }

                    // use initial skeleton for compilerOptions if it does not exist
                    val compilerOptions = tsConfigMap[TypeScriptConfig.COMPILER_OPTIONS_PROPERTY] as? MutableMap<String, Any>
                        ?: mutableMapOf<String, Any>(
                            TypeScriptConfig.TARGET_OPTION to TypeScriptConfig.LanguageTarget.ES6.libName,
                            TypeScriptConfig.MODULE to TypeScriptConfig.MODULE_COMMON_JS,
                            TypeScriptConfig.SOURCE_MAP to true
                        )
                    tsConfigMap[TypeScriptConfig.COMPILER_OPTIONS_PROPERTY] = compilerOptions

                    // overwrite outDir, rootDir, sourceRoot
                    compilerOptions[TypeScriptConfig.OUT_DIR] = tsOutput
                    compilerOptions[TypeScriptConfig.ROOT_DIR] = "."
                    compilerOptions["sourceRoot"] = sourceRoot.toString()

                    // ensure typeRoots has resolved path
                    val typeRoots = compilerOptions[TypeScriptConfig.TYPE_ROOTS] as? MutableList<String> ?: mutableListOf()
                    typeRoots.add(sourceRoot.resolve(TypeScriptConfig.DEFAULT_TYPES_DIRECTORY).toString())
                    compilerOptions[TypeScriptConfig.TYPE_ROOTS] = typeRoots.toSet().toList()

                    // ensure types has node
                    val types = compilerOptions[TypeScriptConfig.TYPES] as? MutableList<String> ?: mutableListOf()
                    types.add("node")
                    compilerOptions[TypeScriptConfig.TYPES] = types.toSet().toList()

                    // pretty print the merged result
                    if (!tsConfig.exists()) {
                        Files.createFile(tsConfig)
                    }
                    tsConfig.writeText(MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(tsConfigMap))

                    val tsConfigVirtualFile = VfsUtil.findFile(tsConfig, true) ?: throw RuntimeException("Could not find temporary tsconfig file using VFS")
                    val tsService = TypeScriptService.getCompilerServiceForFile(project, handlerElement.containingFile.virtualFile)

                    stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.running", tsConfig), false)
                    val compilerFuture = tsService?.compileConfigProjectAndGetErrors(tsConfigVirtualFile)
                    val results = compilerFuture?.get()
                        ?: throw RuntimeException(message("lambda.build.typescript.compiler.ide_error"))

                    stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.processed_files"), false)
                    results.processedFiles.forEach {
                        stepEmitter.emitMessageLine(it, false)
                    }

                    stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.emitted_files"), false)
                    results.emittedFiles.forEach {
                        stepEmitter.emitMessageLine(it, false)
                    }

                    // errors, warnings, etc
                    stepEmitter.emitMessageLine(message("lambda.build.typescript.compiler.annotation_results"), false)
                    results.annotationResults.forEach {
                        val isError = it.severity >= HighlightSeverity.WARNING
                        val location = "${it.absoluteFilePath ?: '?'}:${it.line + 1}:"
                        stepEmitter.emitMessageLine(location + it.description, isError)
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

        // use project tsconfig.json as initial base - if unable to parse existing config
        private const val TS_CONFIG_INITIAL_BASE_FILE = "tsconfig.json"

        private val MAPPER = jacksonObjectMapper()

        private fun getSourceRoot(handlerElement: PsiElement): Path {
            val handlerVirtualFile = runReadAction { handlerElement.containingFile?.virtualFile }
                ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")
            val sourceRootVirtualFile = inferSourceRoot(handlerVirtualFile)
                ?: throw IllegalStateException("Cannot locate package.json for $handlerVirtualFile")
            return Paths.get(sourceRootVirtualFile.path)
        }
    }
}
