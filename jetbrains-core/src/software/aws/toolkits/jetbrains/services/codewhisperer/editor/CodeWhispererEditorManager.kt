// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiDocumentManager
import software.aws.toolkits.jetbrains.services.codewhisperer.model.CaretPosition
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CaretMovement
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PAIRED_BRACKETS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.PAIRED_QUOTES
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererMetadata
import java.time.Instant
import java.util.Stack

class CodeWhispererEditorManager {
    fun updateEditorWithRecommendation(states: InvocationContext, sessionContext: SessionContext) {
        val (requestContext, responseContext, recommendationContext) = states
        val (project, editor) = requestContext
        val document = editor.document
        val primaryCaret = editor.caretModel.primaryCaret
        val selectedIndex = sessionContext.selectedIndex
        val typeahead = sessionContext.typeahead
        val reformatted = CodeWhispererPopupManager.getInstance().getReformattedRecommendation(
            recommendationContext.details[selectedIndex], recommendationContext.userInputSinceInvocation
        )
        val remainingRecommendation = reformatted.substring(typeahead.length)
        val originalOffset = primaryCaret.offset - typeahead.length

        val endOffset = primaryCaret.offset + remainingRecommendation.length

        val codewhispererMetadata = editor.getUserData(CodeWhispererService.KEY_CODEWHISPERER_METADATA)
        val endOffsetToReplace = codewhispererMetadata?.insertEnd ?: primaryCaret.offset

        WriteCommandAction.runWriteCommandAction(project) {
            document.replaceString(originalOffset, endOffsetToReplace, reformatted)
            PsiDocumentManager.getInstance(project).commitDocument(document)
            val rangeMarker = document.createRangeMarker(originalOffset, endOffset, true)
            primaryCaret.moveToOffset(endOffset)

            CodeWhispererTelemetryService.getInstance().enqueueAcceptedSuggestionEntry(
                recommendationContext.details[selectedIndex].requestId,
                requestContext,
                responseContext,
                Instant.now(),
                PsiDocumentManager.getInstance(project).getPsiFile(document)?.virtualFile,
                rangeMarker,
                remainingRecommendation,
                selectedIndex
            )
            ApplicationManager.getApplication().messageBus.syncPublisher(
                CodeWhispererPopupManager.CODEWHISPERER_USER_ACTION_PERFORMED,
            ).afterAccept(states, sessionContext, rangeMarker)
        }
    }

    private fun isMatchingSymbol(symbol: Char): Boolean =
        PAIRED_BRACKETS.containsKey(symbol) || PAIRED_BRACKETS.containsValue(symbol) || PAIRED_QUOTES.contains(symbol) ||
            symbol.isWhitespace()

    fun getUserInputSinceInvocation(editor: Editor, invocationOffset: Int): String {
        val currentOffset = editor.caretModel.primaryCaret.offset
        return editor.document.getText(TextRange(invocationOffset, currentOffset))
    }

    fun getCaretMovement(editor: Editor, caretPosition: CaretPosition): CaretMovement {
        val oldOffset = caretPosition.offset
        val newOffset = editor.caretModel.primaryCaret.offset
        return when {
            oldOffset < newOffset -> CaretMovement.MOVE_FORWARD
            oldOffset > newOffset -> CaretMovement.MOVE_BACKWARD
            else -> CaretMovement.NO_CHANGE
        }
    }

    fun getMatchingSymbolsFromRecommendation(
        editor: Editor,
        recommendation: String,
        isTruncatedOnRight: Boolean
    ): Pair<List<Pair<Int, Int>>, Boolean> {
        val result = mutableListOf<Pair<Int, Int>>()
        val bracketsStack = Stack<Char>()
        val quotesStack = Stack<Pair<Char, Pair<Int, Int>>>()
        val caretOffset = editor.caretModel.primaryCaret.offset
        val document = editor.document
        val lineEndOffset = document.getLineEndOffset(document.getLineNumber(caretOffset))
        val lineText = document.charsSequence.subSequence(caretOffset, lineEndOffset)

        var totalDocLengthChecked = 0
        var current = 0

        result.add(0 to caretOffset)
        result.add(recommendation.length + 1 to lineEndOffset)

        if (isTruncatedOnRight) return result to true

        while (current < recommendation.length &&
            totalDocLengthChecked < lineText.length &&
            totalDocLengthChecked < recommendation.length
        ) {
            val currentDocChar = lineText[totalDocLengthChecked]
            if (!isMatchingSymbol(currentDocChar)) break
            totalDocLengthChecked++

            // find symbol in the recommendation that will match this
            while (current < recommendation.length) {
                val char = recommendation[current]
                current++

                // if char isn't a paired symbol, or it is, but it's not the matching currentDocChar or
                // the opening version of it, then we're done
                if (!isMatchingSymbol(char) || (char != currentDocChar && PAIRED_BRACKETS[char] != currentDocChar)) {
                    continue
                }

                // if char is an opening bracket, push it to the stack
                if (PAIRED_BRACKETS[char] == currentDocChar) {
                    bracketsStack.push(char)
                    continue
                }

                // char is currentDocChar, it's one of a bracket, a quote, or a whitespace character.
                // If it's a whitespace character, directly add it to the result,
                // if it's a bracket or a quote, check if this char is already having a matching opening symbol
                // on the stack
                if (char.isWhitespace()) {
                    result.add(current to caretOffset + totalDocLengthChecked)
                    break
                } else if (bracketsStack.isNotEmpty() && PAIRED_BRACKETS[bracketsStack.peek()] == char) {
                    bracketsStack.pop()
                } else if (quotesStack.isNotEmpty() && quotesStack.peek().first == char) {
                    result.add(quotesStack.pop().second)
                    result.add(current to caretOffset + totalDocLengthChecked)
                    break
                } else {
                    // char does not have a matching opening symbol in the stack, if it's a (opening) bracket,
                    // immediately add it to the result; if it's a quote, push it to the stack
                    if (PAIRED_QUOTES.contains(char)) {
                        quotesStack.push(char to (current to caretOffset + totalDocLengthChecked))
                    } else {
                        result.add(current to caretOffset + totalDocLengthChecked)
                    }
                    break
                }
            }
        }

        // if there are any symbols left in the stack, add them to the result
        quotesStack.forEach { result.add(it.second) }
        result.sortBy { it.first }

        val isFirstLineFullMatching = result.last().second == lineEndOffset || caretOffset == lineEndOffset

        return result to isFirstLineFullMatching
    }

    // example:         recommendation:         document
    //                  line1
    //                  line2
    //                  line3                   line3
    //                                          line4
    //                                          ...
    // number of lines overlapping would be one, and it will be line 3
    fun findOverLappingLines(
        editor: Editor,
        recommendationLines: List<String>,
        isFirstLineFullMatching: Boolean,
        isTruncatedOnRight: Boolean,
        popup: JBPopup,
    ): Int {
        if (isTruncatedOnRight) {
            // insertEnd value only makes sense when there are matching closing brackets, if there's right context
            // resolution applied, set this value to null
            editor.putUserData(CodeWhispererService.KEY_CODEWHISPERER_METADATA, null)
            return 0
        }
        val text = editor.document.charsSequence
        val caretOffset = editor.caretModel.offset
        val document = editor.document
        val textLines = mutableListOf<Pair<String, Int>>()
        val caretLine = document.getLineNumber(caretOffset)
        var currentLineNum = caretLine + 1
        while (isFirstLineFullMatching && currentLineNum < document.lineCount && textLines.size < recommendationLines.size) {
            val currentLine = text.subSequence(
                document.getLineStartOffset(currentLineNum),
                document.getLineEndOffset(currentLineNum)
            )
            if (currentLine.isNotBlank()) {
                textLines.add(currentLine.toString() to document.getLineEndOffset(currentLineNum))
            }
            currentLineNum++
        }

        val numOfLinesMatching = countLinesMatching(recommendationLines, textLines)

        val metadata = CodeWhispererMetadata()
        metadata.insertEnd =
            if (numOfLinesMatching > 0) {
                textLines[numOfLinesMatching - 1].second
            } else {
                document.getLineEndOffset(caretLine)
            }
        editor.putUserData(CodeWhispererService.KEY_CODEWHISPERER_METADATA, metadata)
        Disposer.register(popup) {
            editor.putUserData(CodeWhispererService.KEY_CODEWHISPERER_METADATA, null)
        }
        return numOfLinesMatching
    }

    private fun countLinesMatching(recommendationLines: List<String>, textLines: List<Pair<String, Int>>): Int {
        // i lines we want to match
        for (i in textLines.size downTo 1) {
            val recommendationStart = recommendationLines.size - i
            var matching = true
            for (j in 0 until i) {
                if (recommendationLines[recommendationStart + j].trimEnd() != textLines[j].first.trimEnd()) {
                    matching = false
                    break
                }
            }
            if (matching) {
                return i
            }
        }
        return 0
    }

    companion object {
        fun getInstance(): CodeWhispererEditorManager = service()
    }
}
