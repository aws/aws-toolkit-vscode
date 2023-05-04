// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.apache.commons.collections4.queue.CircularFifoQueue
import software.aws.toolkits.jetbrains.core.coroutines.applicationCoroutineScope
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.language.CodeWhispererProgrammingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererJava
import software.aws.toolkits.jetbrains.services.codewhisperer.language.languages.CodeWhispererUnknownLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.language.programmingLanguage
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.CodeWhispererTelemetryService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType
import software.aws.toolkits.telemetry.CodewhispererPreviousSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import java.time.Duration
import java.time.Instant
import kotlin.math.exp

data class ClassifierResult(val shouldTrigger: Boolean, val calculatedResult: Double = 0.0)

data class CodeWhispererAutotriggerState(
    var isClassifierGroup: Boolean? = null,
    var isExpThreshold: Boolean? = null
)

@State(name = "codewhispererAutotriggerStates", storages = [Storage("aws.xml")])
class CodeWhispererAutoTriggerService : CodeWhispererAutoTriggerHandler, PersistentStateComponent<CodeWhispererAutotriggerState>, Disposable {
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val previousUserTriggerDecisions = CircularFifoQueue<CodewhispererPreviousSuggestionState>(5)

    private var isClassifierGroup: Boolean? = null
    private var isExpThreshold: Boolean? = null
    private var lastInvocationTime: Instant? = null
    private var lastInvocationLineNum: Int? = null

    init {
        scheduleReset()
    }

    fun addPreviousDecision(decision: CodewhispererPreviousSuggestionState) {
        previousUserTriggerDecisions.add(decision)
    }

    fun determineUserGroupIfNeeded() {
        if (isClassifierGroup == null) {
            isClassifierGroup = Math.random() <= 0.40
        }
    }

    fun determineThresholdGroupIfNeeded() {
        if (isExpThreshold == null) {
            isExpThreshold = Math.random() <= 0.50
        }
    }

    fun isClassifierGroup() = isClassifierGroup ?: run {
        determineUserGroupIfNeeded()
        return false
    }

    fun isExpThreshold() = isExpThreshold ?: run {
        determineThresholdGroupIfNeeded()
        return false
    }

    // a util wrapper
    fun tryInvokeAutoTrigger(editor: Editor, triggerType: CodeWhispererAutomatedTriggerType): Job? {
        // only needed for Classifier group, thus calculate it lazily
        val classifierResult: ClassifierResult by lazy { shouldTriggerClassifier(editor, triggerType.telemetryType) }
        val language = runReadAction {
            FileDocumentManager.getInstance().getFile(editor.document)?.programmingLanguage()
        } ?: CodeWhispererUnknownLanguage.INSTANCE
        return if (language is CodeWhispererJava) {
            // we need classifier result for any type of triggering for java
            triggerType.calculationResult = classifierResult.calculatedResult

            when (triggerType) {
                // only invoke service if result > threshold for classifier trigger
                is CodeWhispererAutomatedTriggerType.Classifier -> run {
                    if (classifierResult.shouldTrigger) { invoke(editor, triggerType) } else null
                }

                // invoke whatever the result is for char / enter based trigger
                else -> run {
                    invoke(editor, triggerType)
                }
            }
        } else {
            invoke(editor, triggerType)
        }
    }

    // real auto trigger logic
    fun invoke(editor: Editor, triggerType: CodeWhispererAutomatedTriggerType): Job? {
        if (!CodeWhispererService.getInstance().canDoInvocation(editor, CodewhispererTriggerType.AutoTrigger)) {
            return null
        }

        lastInvocationTime = Instant.now()
        lastInvocationLineNum = runReadAction { editor.caretModel.visualPosition.line }

        val latencyContext = LatencyContext().apply {
            codewhispererPreprocessingStart = System.nanoTime()
            codewhispererEndToEndStart = System.nanoTime()
        }

        val coroutineScope = applicationCoroutineScope()

        return when (triggerType) {
            is CodeWhispererAutomatedTriggerType.IdleTime -> run {
                coroutineScope.launch {
                    // TODO: potential race condition between hasExistingInvocation and entering edt
                    // but in that case we will just return in performAutomatedTriggerAction
                    while (!CodeWhispererInvocationStatus.getInstance().hasEnoughDelayToInvokeCodeWhisperer() ||
                        CodeWhispererInvocationStatus.getInstance().hasExistingInvocation()
                    ) {
                        if (!isActive) return@launch
                        delay(CodeWhispererConstants.IDLE_TIME_CHECK_INTERVAL)
                    }
                    runInEdt {
                        if (CodeWhispererInvocationStatus.getInstance().isPopupActive()) return@runInEdt
                        performAutomatedTriggerAction(editor, CodeWhispererAutomatedTriggerType.IdleTime(), latencyContext)
                    }
                }
            }

            else -> run {
                coroutineScope.launch {
                    performAutomatedTriggerAction(editor, triggerType, latencyContext)
                }
            }
        }
    }

    override fun getState(): CodeWhispererAutotriggerState = CodeWhispererAutotriggerState(isClassifierGroup, isExpThreshold)

    override fun loadState(state: CodeWhispererAutotriggerState) {
        isClassifierGroup = state.isClassifierGroup
        isExpThreshold = state.isExpThreshold
    }

    private fun scheduleReset() {
        if (!alarm.isDisposed) {
            alarm.addRequest({ resetPreviousStates() }, Duration.ofSeconds(120).toMillis())
        }
    }

    private fun resetPreviousStates() {
        try {
            previousUserTriggerDecisions.clear()
            lastInvocationLineNum = null
            lastInvocationTime = null
        } finally {
            scheduleReset()
        }
    }

    fun shouldTriggerClassifier(
        editor: Editor,
        automatedTriggerType: CodewhispererAutomatedTriggerType = CodewhispererAutomatedTriggerType.Classifier // TODO: need this?
    ): ClassifierResult {
        val caretContext = runReadAction { CodeWhispererEditorUtil.extractCaretContext(editor) }
        val language = runReadAction {
            FileDocumentManager.getInstance().getFile(editor.document)?.programmingLanguage()
        } ?: CodeWhispererUnknownLanguage.INSTANCE
        val caretPosition = runReadAction { CodeWhispererEditorUtil.getCaretPosition(editor) }

        // tryClassifier with only the following language
        if (language !is CodeWhispererJava) {
            return ClassifierResult(false)
        }

        val leftContextLines = caretContext.leftFileContext.split(Regex("\r?\n"))
        val leftContextAtCurrentLine = caretContext.leftContextOnCurrentLine
        val keyword = leftContextAtCurrentLine.trim().split(" ").let { tokens ->
            if (tokens.size - 1 >= 0) tokens[tokens.size - 1] else ""
        }

        val lengthOfLeftCurrent = leftContextAtCurrentLine.length
        val lengthOfLeftPrev = if (leftContextLines.size - 2 >= 0) {
            leftContextLines[leftContextLines.size - 2].length.toDouble()
        } else {
            0.0
        }

        val rightContext = caretContext.rightFileContext
        val lengthOfRight = rightContext.trim().length
        val triggerTypeCoefficient = CodeWhispererClassifierConstants.triggerTypeCoefficientMap[automatedTriggerType] ?: 0.0

        val osCoefficient: Double = if (SystemInfo.isMac) {
            CodeWhispererClassifierConstants.osMap["Mac OS X"] ?: 0.0
        } else if (SystemInfo.isWindows) {
            val osVersion = SystemInfo.OS_VERSION
            if (osVersion.contains("11", true)) {
                CodeWhispererClassifierConstants.osMap["Windows 10"]
            } else if (osVersion.contains("10", true)) {
                CodeWhispererClassifierConstants.osMap["Windows 10"]
            } else if (osVersion.contains("7", true)) {
                CodeWhispererClassifierConstants.osMap["Windows 7"]
            } else 0.0
        } else {
            0.0
        } ?: 0.0

        val lastCharCoefficient = if (leftContextAtCurrentLine.length - 1 >= 0) {
            CodeWhispererClassifierConstants.coefficientsMap[leftContextAtCurrentLine[leftContextAtCurrentLine.length - 1].toString()] ?: 0.0
        } else {
            0.0
        }

        val keywordCoefficient = CodeWhispererClassifierConstants.coefficientsMap[keyword] ?: 0.0
        val languageCoefficient = CodeWhispererClassifierConstants.languageMap[language] ?: 0.0
        val ideCoefficient = 0

        val lineDiff = lastInvocationLineNum?.let { (caretPosition.line.toDouble() - it) } ?: 0.0

        var previousOneAccept: Double = 0.0
        var previousOneReject: Double = 0.0
        var previousOneOther: Double = 0.0
        val previousOneDecision = CodeWhispererTelemetryService.getInstance().previousUserTriggerDecision
        if (previousOneDecision == null) {
            previousOneAccept = 0.0
            previousOneReject = 0.0
            previousOneOther = 0.0
        } else {
            previousOneAccept =
                if (previousOneDecision == CodewhispererPreviousSuggestionState.Accept) CodeWhispererClassifierConstants.prevDecisionAcceptCoefficient else 0.0
            previousOneReject =
                if (previousOneDecision == CodewhispererPreviousSuggestionState.Reject) CodeWhispererClassifierConstants.prevDecisionRejectCoefficient else 0.0
            previousOneOther =
                if (
                    previousOneDecision != CodewhispererPreviousSuggestionState.Accept &&
                    previousOneDecision != CodewhispererPreviousSuggestionState.Reject
                ) CodeWhispererClassifierConstants.prevDecisionOtherCoefficient else 0.0
        }

        val resultBeforeSigmoid =
            CodeWhispererClassifierConstants.lengthofRightCoefficient * VariableTypeNeedNormalize.LenRight.normalize(lengthOfRight.toDouble()) +
                CodeWhispererClassifierConstants.lengthOfLeftCurrentCoefficient *
                VariableTypeNeedNormalize.LenLeftCur.normalize(lengthOfLeftCurrent.toDouble()) +
                CodeWhispererClassifierConstants.lengthOfLeftPrevCoefficient * VariableTypeNeedNormalize.LenLeftPrev.normalize(lengthOfLeftPrev) +
                CodeWhispererClassifierConstants.lineNumCoefficient * VariableTypeNeedNormalize.LineNum.normalize(caretPosition.line.toDouble()) +
                CodeWhispererClassifierConstants.cursorOffsetCoefficient * VariableTypeNeedNormalize.Cursor.normalize(caretPosition.offset.toDouble()) +
                CodeWhispererClassifierConstants.lineDiffCoefficient * VariableTypeNeedNormalize.LineDiff.normalize(lineDiff) +
                languageCoefficient +
                osCoefficient +
                triggerTypeCoefficient +
                lastCharCoefficient +
                keywordCoefficient +
                ideCoefficient +
                previousOneAccept +
                previousOneReject +
                previousOneOther +
                CodeWhispererClassifierConstants.intercept

        val shouldTrigger = sigmoid(resultBeforeSigmoid) > getThreshold(language)
        return ClassifierResult(shouldTrigger, sigmoid(resultBeforeSigmoid))
    }

    override fun dispose() {}

    companion object {
        private const val triggerThreshold: Double = 0.4
        private const val expTriggerThreshold: Double = 0.35

        fun getInstance(): CodeWhispererAutoTriggerService = service()

        fun getThreshold(language: CodeWhispererProgrammingLanguage): Double =
            if (language is CodeWhispererJava && CodeWhispererAutoTriggerService.getInstance().isExpThreshold()) expTriggerThreshold
            else triggerThreshold

        fun sigmoid(x: Double): Double = 1 / (1 + exp(-x))

        fun getClassifierResultIfNeeded(editor: Editor): Double? {
            val language = runReadAction {
                FileDocumentManager.getInstance().getFile(editor.document)?.programmingLanguage()
            } ?: CodeWhispererUnknownLanguage.INSTANCE
            return if (language is CodeWhispererJava) {
                CodeWhispererAutoTriggerService.getInstance().shouldTriggerClassifier(editor).calculatedResult
            } else null
        }
    }
}

private enum class VariableTypeNeedNormalize {
    Cursor {
        override fun normalize(value: Double): Double = (value - minn.cursor) / (maxx.cursor - minn.cursor)
    },
    LineNum {
        override fun normalize(value: Double): Double = (value - minn.lineNum) / (maxx.lineNum - minn.lineNum)
    },
    LenLeftCur {
        override fun normalize(value: Double): Double = (value - minn.lenLeftCur) / (maxx.lenLeftCur - minn.lenLeftCur)
    },
    LenLeftPrev {
        override fun normalize(value: Double): Double = (value - minn.lenLeftPrev) / (maxx.lenLeftPrev - minn.lenLeftPrev)
    },
    LenRight {
        override fun normalize(value: Double): Double = (value - minn.lenRight) / (maxx.lenRight - minn.lenRight)
    },
    LineDiff {
        override fun normalize(value: Double): Double = (value - minn.lineDiff) / (maxx.lineDiff - minn.lineDiff)
    };

    abstract fun normalize(value: Double): Double

    data class NormalizedCoefficients(
        val cursor: Double,
        val lineNum: Double,
        val lenLeftCur: Double,
        val lenLeftPrev: Double,
        val lenRight: Double,
        val lineDiff: Double,
    )

    companion object {
        private val maxx = NormalizedCoefficients(
            cursor = 90716.0,
            lineNum = 2085.0,
            lenLeftCur = 166.0,
            lenLeftPrev = 161.0,
            lenRight = 10239.0,
            lineDiff = 327.0,
        )

        private val minn = NormalizedCoefficients(
            cursor = 1.0,
            lineNum = 0.0,
            lenLeftCur = 0.0,
            lenLeftPrev = 0.0,
            lenRight = 0.0,
            lineDiff = -5157.0,
        )
    }
}
