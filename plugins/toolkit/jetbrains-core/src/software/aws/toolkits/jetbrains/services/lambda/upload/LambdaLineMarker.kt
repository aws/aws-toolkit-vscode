// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProviderDescriptor
import com.intellij.execution.lineMarker.ExecutorAction
import com.intellij.execution.lineMarker.LineMarkerActionWrapper
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.SmartPointerManager
import icons.AwsIcons
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.cloudformation.CloudFormationTemplateIndex.Companion.listFunctions
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.jetbrains.settings.LambdaSettings
import software.aws.toolkits.jetbrains.utils.isTestOrInjectedText
import software.aws.toolkits.resources.message
import javax.swing.Icon

class LambdaLineMarker : LineMarkerProviderDescriptor() {

    override fun getName(): String = message("lambda.service_name")

    override fun getIcon(): Icon = AwsIcons.Resources.LAMBDA_FUNCTION

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Only process leaf elements
        if (element.firstChild != null) {
            return null
        }

        val runtimeGroup = element.language.runtimeGroup ?: return null

        if (element.isTestOrInjectedText()) {
            return null
        }

        val handlerResolver = LambdaHandlerResolver.getInstanceOrNull(runtimeGroup) ?: return null
        val handler = handlerResolver.determineHandler(element) ?: return null

        return if (handlerResolver.shouldShowLineMarker(handler) || shouldShowLineMarker(element.containingFile, handler, runtimeGroup)) {
            val actionGroup = DefaultActionGroup()

            val smartPsiElementPointer = SmartPointerManager.createPointer(element)

            if (element.language in LambdaBuilder.supportedLanguages()) {
                val executorActions = ExecutorAction.getActions(1)
                executorActions.forEach {
                    actionGroup.add(LineMarkerActionWrapper(element, it))
                }

                actionGroup.add(CreateLambdaFunctionAction(handler, smartPsiElementPointer, handlerResolver))
            }

            object : LineMarkerInfo<PsiElement>(
                element,
                element.textRange,
                icon,
                null,
                null,
                GutterIconRenderer.Alignment.CENTER
            ) {
                override fun createGutterRenderer(): GutterIconRenderer = LambdaGutterIcon(this, actionGroup)
            }
        } else {
            null
        }
    }

    private fun shouldShowLineMarker(psiFile: PsiFile, handler: String, runtimeGroup: RuntimeGroup): Boolean {
        val project = psiFile.project
        return LambdaSettings.getInstance(project).showAllHandlerGutterIcons ||
            handlerInTemplate(project, handler, runtimeGroup)
    }

    // Handler defined in template with the same runtime group is valid
    private fun handlerInTemplate(project: Project, handler: String, runtimeGroup: RuntimeGroup): Boolean =
        listFunctions(project).any {
            Runtime.fromValue(it.runtime())?.runtimeGroup == runtimeGroup &&
                // if user has a custom makefile, assume they know what they're doing with the handler since we don't have enough information
                (it.handler() == handler || it.buildMethod() == "makefile")
        }

    class LambdaGutterIcon(markerInfo: LineMarkerInfo<PsiElement>, private val actionGroup: ActionGroup) :
        LineMarkerInfo.LineMarkerGutterIconRenderer<PsiElement>(markerInfo) {
        override fun getClickAction(): AnAction? = null

        override fun isNavigateAction(): Boolean = true

        override fun getPopupMenuActions(): ActionGroup = actionGroup
    }
}
