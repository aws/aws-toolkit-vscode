// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.messages.MessageBus
import com.intellij.util.text.SemVer
import com.intellij.util.text.nullize
import software.aws.toolkits.core.lambda.LambdaArchitecture
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.services.lambda.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerEvaluationListener
import software.aws.toolkits.jetbrains.services.lambda.validation.SamCliVersionEvaluationListener
import software.aws.toolkits.resources.message

fun registerConfigValidationListeners(messageBus: MessageBus, parentDisposable: Disposable, validationCompleteCallback: (() -> Unit)) {
    val connect = messageBus.connect(parentDisposable)
    connect.subscribe(
        LambdaHandlerEvaluationListener.TOPIC,
        object : LambdaHandlerEvaluationListener {
            override fun handlerValidationFinished(handlerName: String, isHandlerExists: Boolean) {
                validationCompleteCallback()
            }
        }
    )

    connect.subscribe(
        SamCliVersionEvaluationListener.TOPIC,
        object : SamCliVersionEvaluationListener {
            override fun samVersionValidationFinished(path: String, version: SemVer) {
                validationCompleteCallback()
            }
        }
    )
}

fun resolveLambdaFromHandler(handler: String?, runtime: String?, architecture: String?): ResolvedFunction {
    handler ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))
    return ResolvedFunction(handler, runtime.validateSupportedRuntime(), architecture.validateSupportedArchitecture())
}

fun resolveLambdaFromTemplate(project: Project, templatePath: String?, functionName: String?): ResolvedFunction {
    val (templateFile, logicalName) = validateSamTemplateDetails(templatePath, functionName)

    val function = SamTemplateUtils.findFunctionsFromTemplate(project, templateFile)
        .find { it.logicalName == functionName }
        ?: throw RuntimeConfigurationError(
            message(
                "lambda.run_configuration.sam.no_such_function",
                logicalName,
                templateFile.path
            )
        )

    val handler = tryOrNull { function.handler() }
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_handler_specified"))

    val runtimeString = try {
        function.runtime()
    } catch (e: Exception) {
        throw RuntimeConfigurationError(message("cloudformation.missing_property", "Runtime", logicalName))
    }

    val runtime = runtimeString.validateSupportedRuntime()
    val architecture = function.architectures().validateSupportedArchitectures()

    return ResolvedFunction(handler, runtime, architecture)
}

fun validateSamTemplateDetails(templatePath: String?, functionName: String?): Pair<VirtualFile, String> {
    templatePath?.takeUnless { it.isEmpty() }
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_template_specified"))

    functionName ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_function_specified"))

    val templateFile = LocalFileSystem.getInstance().refreshAndFindFileByPath(templatePath)
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.template_file_not_found"))

    return templateFile to functionName
}

fun String?.validateSupportedRuntime(): LambdaRuntime {
    val runtimeString = this.nullize() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))
    val runtime = LambdaRuntime.fromValue(runtimeString)
    if (runtime?.runtimeGroup == null) {
        throw RuntimeConfigurationError(message("lambda.run_configuration.unsupported_runtime", runtimeString))
    }

    return runtime
}

fun List<String>?.validateSupportedArchitectures(): LambdaArchitecture = this?.firstOrNull()?.validateSupportedArchitecture() ?: LambdaArchitecture.DEFAULT

fun String?.validateSupportedArchitecture(): LambdaArchitecture {
    val architectureString = this.nullize() ?: return LambdaArchitecture.DEFAULT
    return LambdaArchitecture.fromValue(architectureString)
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.unsupported_architecture", architectureString))
}

data class ResolvedFunction(
    var handler: String,
    var runtime: LambdaRuntime,
    var architecture: LambdaArchitecture
)
