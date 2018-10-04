// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.codeHighlighting.Pass
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProviderDescriptor
import com.intellij.execution.lineMarker.ExecutorAction
import com.intellij.execution.lineMarker.LineMarkerActionWrapper
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.psi.PsiElement
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.execution.local.LambdaLocalRunProvider
import software.aws.toolkits.jetbrains.services.lambda.runtimeGroup
import software.aws.toolkits.resources.message
import javax.swing.Icon

class LambdaLineMarker : LineMarkerProviderDescriptor() {

    override fun getName(): String? = message("lambda.service_name")

    override fun getIcon(): Icon? = AwsIcons.Resources.LAMBDA_FUNCTION

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Only process leaf elements
        if (element.firstChild != null) {
            return null
        }

        val handlerResolver = element.language.runtimeGroup?.let {
            LambdaHandlerResolver.getInstance(it)
        } ?: return null

        val handler = handlerResolver.determineHandler(element) ?: return null

        val actionGroup = DefaultActionGroup()

        if (element.language in LambdaLocalRunProvider.supportedLanguages) {
            val executorActions = ExecutorAction.getActions(1)
            executorActions.forEach {
                actionGroup.add(LineMarkerActionWrapper(element, it))
            }
        }

        if (element.language in LambdaPackager.supportedLanguages) {
            actionGroup.add(UploadLambdaFunction(handler))
        }

        return object : LineMarkerInfo<PsiElement>(
            element, element.textRange, icon, Pass.LINE_MARKERS,
            null, null,
            GutterIconRenderer.Alignment.CENTER
        ) {
            override fun createGutterRenderer(): GutterIconRenderer? {
                return LambdaGutterIcon(this, actionGroup)
            }
        }
    }

    override fun collectSlowLineMarkers(
        elements: MutableList<PsiElement>,
        result: MutableCollection<LineMarkerInfo<PsiElement>>
    ) {
    }

    class LambdaGutterIcon(markerInfo: LineMarkerInfo<PsiElement>, private val actionGroup: ActionGroup) :
        LineMarkerInfo.LineMarkerGutterIconRenderer<PsiElement>(markerInfo) {
        override fun getClickAction(): AnAction? = null

        override fun isNavigateAction(): Boolean = true

        override fun getPopupMenuActions(): ActionGroup = actionGroup
    }
}
