// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.psi.PsiElement
import com.intellij.psi.SmartPsiElementPointer
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplateIndex
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.runtime
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.upload.EditFunctionMode.NEW
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.resources.message

class CreateLambdaFunction(
    private val handlerName: String?,
    private val elementPointer: SmartPsiElementPointer<PsiElement>?,
    private val lambdaHandlerResolver: LambdaHandlerResolver?
) : AnAction(message("lambda.create_new"), null, AwsIcons.Actions.LAMBDA_FUNCTION_NEW) {

    @Suppress("unused") // Used by ActionManager in plugin.xml
    constructor() : this(null, null, null)

    init {
        if (handlerName != null) {
            elementPointer ?: throw IllegalArgumentException("elementPointer must be provided if handlerName is provided")
            lambdaHandlerResolver
                ?: throw IllegalArgumentException("lambdaHandlerResolver must be provided if handlerName is provided")
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val runtime = e.runtime()

        if (!ProjectAccountSettingsManager.getInstance(project).isValidConnectionSettings()) {
            notifyNoActiveCredentialsError(project = project)
            return
        }

        val dialog = if (handlerName != null) {
            EditFunctionDialog(project = project, mode = NEW, runtime = runtime, handlerName = handlerName)
        } else {
            EditFunctionDialog(project = project, mode = NEW, runtime = runtime)
        }

        dialog.show()
    }

    override fun update(e: AnActionEvent) {
        super.update(e)

        val element: PsiElement? = elementPointer?.element
        if (handlerName == null || element == null || lambdaHandlerResolver == null) {
            e.presentation.isVisible = true
            return
        }

        val templateFunctionHandlers = CloudFormationTemplateIndex.listFunctions(element.project)
            .mapNotNull { it.handler() }
            .toSet()

        val allowAction = lambdaHandlerResolver.determineHandlers(element, element.containingFile.virtualFile)
            .none { it in templateFunctionHandlers }

        e.presentation.isVisible = allowAction
    }
}

data class FunctionUploadDetails(
    val name: String,
    val handler: String,
    val iamRole: IamRole,
    val runtime: Runtime,
    val description: String?,
    val envVars: Map<String, String>,
    val timeout: Int,
    val memorySize: Int,
    val xrayEnabled: Boolean,
    val samOptions: SamOptions
) {
    val tracingMode: TracingMode =
        if (xrayEnabled) {
            TracingMode.ACTIVE
        } else {
            TracingMode.PASS_THROUGH
        }
}
