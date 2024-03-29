// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.SelectionModel
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.webview.FqnWebviewAdapter
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.CodeNames
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.CodeNamesImpl
import software.aws.toolkits.jetbrains.services.cwc.controller.ChatController
import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.util.LanguageExtractor
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import java.awt.Point
import kotlin.math.min

class FocusAreaContextExtractor(private val fqnWebviewAdapter: FqnWebviewAdapter, private val project: Project) {

    private val languageExtractor: LanguageExtractor = LanguageExtractor()
    suspend fun extract(): FocusAreaContext? {
        val editor = computeOnEdt {
            FileEditorManager.getInstance(project).selectedTextEditor
        } ?: return null

        if (editor.document.text.isBlank()) return null

        // Get 10k characters around the cursor
        val (trimmedFileText, trimmedFileTextSelection) = computeOnEdt {
            val (start, end) = getOffsetRangeAtCursor(MAX_LENGTH, editor)
            val fileTextStartPos = editor.offsetToLogicalPosition(start)
            val fileTextEndPos = editor.offsetToLogicalPosition(end)
            val trimmedFileText = getTextAtOffsets(fileTextStartPos, fileTextEndPos, editor)
            val trimmedFileTextSelection = UICodeSelectionRange(
                start = UICodeSelectionLineRange(
                    row = fileTextStartPos.line,
                    column = fileTextStartPos.column,
                ),
                end = UICodeSelectionLineRange(
                    row = fileTextEndPos.line,
                    column = fileTextEndPos.column,
                ),
            )
            Pair(trimmedFileText, trimmedFileTextSelection)
        }

        // Get user selected code or visible text area
        val (codeSelection, codeSelectionRange) = computeOnEdt {
            val selectionModel: SelectionModel = editor.selectionModel
            val selectedText = selectionModel.selectedText
            if (selectedText == null) {
                // Get visible area text
                val visibleArea = editor.scrollingModel.visibleArea
                val startOffset = editor.xyToLogicalPosition(Point(visibleArea.x, visibleArea.y))
                val endOffset = editor.xyToLogicalPosition(Point(visibleArea.x + visibleArea.width, visibleArea.y + visibleArea.height))

                // Get text of visible area
                val visibleAreaText = getTextAtOffsets(startOffset, endOffset, editor)

                // If visible area text too big use trimmedSurroundingText
                if (visibleAreaText.length > MAX_LENGTH) {
                    Pair(trimmedFileText, trimmedFileTextSelection)
                } else {
                    // Ensure end line isn't beyond the end of the document
                    val endLine = min(endOffset.line, editor.document.lineCount - 1)
                    val endColumn = min(endOffset.column, visibleAreaText.lengthOfLastLine() - 1)

                    val codeSelectionRange = UICodeSelectionRange(
                        start = UICodeSelectionLineRange(
                            row = startOffset.line,
                            column = startOffset.column,
                        ),
                        end = UICodeSelectionLineRange(
                            row = endLine,
                            column = endColumn,
                        ),
                    )
                    Pair(visibleAreaText, codeSelectionRange)
                }
            } else if (selectedText.length > MAX_LENGTH) {
                Pair(trimmedFileText, trimmedFileTextSelection)
            } else {
                // Use selected text ranges
                val selectedStartPos = editor.offsetToLogicalPosition(selectionModel.selectionStart)
                val selectedEndPos = editor.offsetToLogicalPosition(selectionModel.selectionEnd)

                val codeSelectionRange = UICodeSelectionRange(
                    start = UICodeSelectionLineRange(
                        row = selectedStartPos.line,
                        column = selectedStartPos.column,
                    ),
                    end = UICodeSelectionLineRange(
                        row = selectedEndPos.line,
                        column = selectedEndPos.column,
                    ),
                )
                Pair(selectedText, codeSelectionRange)
            }
        }

        // Retrieve <codeNames> from  trimmedFileText
        val fileLanguage = computeOnEdt {
            languageExtractor.extractLanguageNameFromCurrentFile(editor, project)
        }
        val fileText = editor.document.text
        val fileName = FileEditorManager.getInstance(project).selectedFiles.first().name

        // Offset the selection range to the start of the trimmedFileText
        val selectionInsideTrimmedFileTextRange = codeSelectionRange.let {
            UICodeSelectionRange(
                start = UICodeSelectionLineRange(
                    row = it.start.row - trimmedFileTextSelection.start.row,
                    column = it.start.column
                ),
                end = UICodeSelectionLineRange(
                    row = it.end.row - trimmedFileTextSelection.start.row,
                    column = it.end.column
                ),
            )
        }

        var codeNames: CodeNames? = null
        if (fileLanguage != null) {
            val extractNamesRequest = ExtractNamesRequest(
                language = fileLanguage,
                fileContent = fileText,
                codeSelection = UICodeSelection(
                    selectedCode = trimmedFileText,
                    file = UICodeSelectionFile(
                        name = fileName,
                        range = selectionInsideTrimmedFileTextRange,
                    ),
                ),
            )
            val requestString = ChatController.objectMapper.writeValueAsString(extractNamesRequest)

            codeNames = try {
                val namesString = fqnWebviewAdapter.extractNames(requestString)
                ChatController.objectMapper.readValue(namesString, CodeNamesImpl::class.java)
            } catch (e: Exception) {
                getLogger<FocusAreaContextExtractor>().warn(e) { "Failed to extract names from file" }
                null
            }
        }

        return FocusAreaContext(
            codeSelection = codeSelection,
            codeSelectionRange = selectionInsideTrimmedFileTextRange,
            trimmedSurroundingFileText = trimmedFileText,
            codeNames = codeNames,
        )
    }

    private fun getTextAtOffsets(startOffset: LogicalPosition, endOffset: LogicalPosition, editor: Editor): String {
        val startInt = editor.logicalPositionToOffset(startOffset)
        val endInt = editor.logicalPositionToOffset(endOffset)

        return editor.document.getText(TextRange(startInt, endInt))
    }

    // Get 10k characters range around the cursor
    private fun getOffsetRangeAtCursor(maxCharacters: Int, editor: Editor): Pair<Int, Int> {
        // Get cursor position
        val caretModel = editor.caretModel
        val offset = caretModel.offset

        // Get entire file text
        val document = editor.document
        val fileText = document.text

        // Calculate the start and end offsets
        val halfMaxCharacters = maxCharacters / 2
        val startOffset = 0.coerceAtLeast(offset - halfMaxCharacters)
        val endOffset = fileText.length.coerceAtMost(offset + halfMaxCharacters)

        // Adjust the start and end offsets if necessary to ensure a total of 10k characters
        val excessCharacters = maxCharacters - (endOffset - startOffset)
        val adjustedStartOffset = 0.coerceAtLeast(startOffset - excessCharacters)
        val adjustedEndOffset = fileText.length.coerceAtMost(endOffset + excessCharacters)

        return Pair(adjustedStartOffset, adjustedEndOffset)
    }

    private fun String.lengthOfLastLine(): Int {
        for (i in length - 1 downTo 0) {
            if (this[i] == '\n') {
                return length - i
            }
        }
        return length
    }

    companion object {
        const val MAX_LENGTH = 10000
    }
}

data class ExtractNamesRequest(
    val fileContent: String,
    val language: String,
    val codeSelection: UICodeSelection,
)
