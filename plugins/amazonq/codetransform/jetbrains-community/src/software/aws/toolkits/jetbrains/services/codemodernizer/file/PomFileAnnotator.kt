// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.file

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.impl.DocumentMarkupModel.forDocument
import com.intellij.openapi.editor.markup.EffectType
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.editor.markup.HighlighterLayer
import com.intellij.openapi.editor.markup.HighlighterTargetArea
import com.intellij.openapi.editor.markup.MarkupModel
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants.Companion.getLightYellowThemeBackgroundColor
import software.aws.toolkits.resources.AwsToolkitBundle.message
import java.awt.Font
import javax.swing.Icon

class PomFileAnnotator(private val project: Project, private var virtualFile: VirtualFile, private var lineNumberToHighlight: Int?) {
    // If corresponding model doesn't exist, create it for that document
    private fun getMarkupModelForDocument(document: Document): MarkupModel =
        forDocument(document, project, false) ?: forDocument(document, project, true)

    private fun openVirtualFile() {
        val fileEditorManager = FileEditorManager.getInstance(project)
        val openFileDescription = OpenFileDescriptor(project, virtualFile)
        fileEditorManager.openTextEditor(openFileDescription, true)
    }

    private fun addGutterIconToLine(markupModel: MarkupModel, document: Document, lineNumberToHighlight: Int) {
        val highlighterAttributes = TextAttributes(
            null,
            getLightYellowThemeBackgroundColor(),
            getLightYellowThemeBackgroundColor(),
            EffectType.STRIKEOUT,
            Font.BOLD
        )

        // Define your action availability hint
        val startOffset = document.getLineStartOffset(lineNumberToHighlight)
        val endOffset = document.getLineEndOffset(lineNumberToHighlight)

        markupModel.apply {
            val highlighter = addRangeHighlighter(
                startOffset,
                endOffset,
                HighlighterLayer.SYNTAX, // like z-index
                highlighterAttributes,
                HighlighterTargetArea.EXACT_RANGE
            )

            // Optionally, you can customize the range highlighter further
            highlighter.errorStripeMarkColor = JBColor.RED
            highlighter.errorStripeTooltip = message("codemodernizer.file.invalid_pom_version")
            highlighter.gutterIconRenderer = HilGutterIconRenderer(AllIcons.General.BalloonWarning)
        }
    }

    fun showCustomEditor() {
        val document = runReadAction {
            FileDocumentManager.getInstance().getDocument(virtualFile)
        } ?: throw Error("No document found")

        // User should not be able to edit the file
        document.setReadOnly(true)

        runInEdt {
            val markupModel = getMarkupModelForDocument(document)
            markupModel.removeAllHighlighters()
            openVirtualFile()
            // We apply the editor changes to file
            addGutterIconToLine(markupModel, document, lineNumberToHighlight ?: 1)
        }
    }
}

private class HilGutterIconRenderer(private val icon: Icon) : GutterIconRenderer() {
    override fun equals(other: Any?): Boolean {
        if (other is HilGutterIconRenderer) {
            return icon == other.icon
        }
        return false
    }

    override fun hashCode(): Int = javaClass.hashCode()

    override fun getIcon(): Icon = icon

    override fun getTooltipText(): String = message("codemodernizer.file.invalid_pom_version")

    override fun isNavigateAction(): Boolean = false

    // No action to be performed
    override fun getClickAction(): AnAction = object : AnAction() {
        override fun actionPerformed(e: AnActionEvent) = Unit
        override fun update(e: AnActionEvent) = Unit
    }

    override fun getPopupMenuActions(): ActionGroup? = null

    override fun getAlignment(): Alignment = Alignment.LEFT
}
