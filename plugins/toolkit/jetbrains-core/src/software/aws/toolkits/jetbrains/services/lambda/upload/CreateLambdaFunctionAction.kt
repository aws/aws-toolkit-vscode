// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.actionSystem.UpdateInBackground
import com.intellij.psi.PsiElement
import com.intellij.psi.SmartPsiElementPointer
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplateIndex
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.runtime
import software.aws.toolkits.jetbrains.utils.notifyNoActiveCredentialsError
import software.aws.toolkits.resources.message

class CreateLambdaFunctionAction(
    private val handlerName: String?,
    private val elementPointer: SmartPsiElementPointer<PsiElement>?,
    private val lambdaHandlerResolver: LambdaHandlerResolver?
) : AnAction(message("lambda.create_new"), null, AwsIcons.Actions.LAMBDA_FUNCTION_NEW), UpdateInBackground {

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

        if (!AwsConnectionManager.getInstance(project).isValidConnectionSettings()) {
            notifyNoActiveCredentialsError(project = project)
            return
        }

        CreateFunctionDialog(project = project, initialRuntime = runtime?.toSdkRuntime(), handlerName = handlerName).show()
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        super.update(e)

        val element: PsiElement? = elementPointer?.element
        if (handlerName == null || element == null || lambdaHandlerResolver == null) {
            // It was created from ActionManager, so only show it if we have supported runtime groups
            e.presentation.isVisible = LambdaHandlerResolver.supportedRuntimeGroups().isNotEmpty()
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
