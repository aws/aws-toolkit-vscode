package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.codeHighlighting.Pass
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProviderDescriptor
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.psi.PsiElement
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.LambdaVirtualFile
import software.aws.toolkits.resources.message
import javax.swing.Icon

abstract class LambdaLineMarker : LineMarkerProviderDescriptor() {
    /**
     * Language specific implementations should override this to determine if the given
     * [element] is a potential Lambda handler.
     *
     * Should be done at the lowest possible level (i.e. [com.intellij.psi.PsiIdentifier]
     * for Java implementations).
     *
     * @see com.intellij.codeInsight.daemon.LineMarkerProvider.getLineMarkerInfo
     */
    abstract fun getHandlerName(element: PsiElement): String?

    override fun getName(): String? = message("lambda.service_name")

    override fun getIcon(): Icon? = AwsIcons.Logos.LAMBDA

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        val handler = getHandlerName(element) ?: return null

        val actionGroup = DefaultActionGroup()

        actionGroup.add(UploadLambdaFunction(handler))

        AwsResourceCache.getInstance(element.project).lambdaFunctions()
            .filter { it.handler == handler }
            .forEach { actionGroup.add(OpenLambda(it)) }

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

    class OpenLambda(private val function: LambdaFunction) :
        AnAction(message("lambda.open_function", function.name), null, AwsIcons.Actions.LAMBDA_FUNCTION_OPEN) {
        override fun actionPerformed(e: AnActionEvent?) {
            val event = e ?: return
            val editorManager = event.project?.let { FileEditorManager.getInstance(it) } ?: return
            val lambdaVirtualFile = LambdaVirtualFile(function)
            editorManager.openFile(lambdaVirtualFile, true)
        }
    }
}
