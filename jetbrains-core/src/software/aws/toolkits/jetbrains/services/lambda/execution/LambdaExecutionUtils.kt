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
import software.amazon.awssdk.services.lambda.model.Runtime
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

fun resolveLambdaFromTemplate(project: Project, templatePath: String?, functionName: String?): Pair<String, Runtime> {
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

    return Pair(handler, runtime)
}

fun validateSamTemplateDetails(templatePath: String?, functionName: String?): Pair<VirtualFile, String> {
    templatePath?.takeUnless { it.isEmpty() }
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_template_specified"))

    functionName ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.no_function_specified"))

    val templateFile = LocalFileSystem.getInstance().refreshAndFindFileByPath(templatePath)
        ?: throw RuntimeConfigurationError(message("lambda.run_configuration.sam.template_file_not_found"))

    return templateFile to functionName
}

fun String?.validateSupportedRuntime(): Runtime {
    val runtimeString = this.nullize() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_runtime_specified"))
    val runtime = Runtime.fromValue(runtimeString)
    if (runtime.runtimeGroup == null) {
        throw RuntimeConfigurationError(message("lambda.run_configuration.unsupported_runtime", runtimeString))
    }

    return runtime
}
