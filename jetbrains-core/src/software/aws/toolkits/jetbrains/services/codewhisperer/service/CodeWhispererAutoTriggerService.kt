// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
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

class CodeWhispererAutoTriggerService : CodeWhispererAutoTriggerHandler, Disposable {
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val previousUserTriggerDecisions = CircularFifoQueue<CodewhispererPreviousSuggestionState>(5)

    private var lastInvocationTime: Instant? = null
    private var lastInvocationLineNum: Int? = null

    init {
        scheduleReset()
    }

    fun addPreviousDecision(decision: CodewhispererPreviousSuggestionState) {
        previousUserTriggerDecisions.add(decision)
    }

    // a util wrapper
    fun tryInvokeAutoTrigger(editor: Editor, triggerType: CodeWhispererAutomatedTriggerType): Job? {
        // only needed for Classifier group, thus calculate it lazily
        val classifierResult: ClassifierResult by lazy { shouldTriggerClassifier(editor, triggerType.telemetryType) }
        val language = runReadAction {
            FileDocumentManager.getInstance().getFile(editor.document)?.programmingLanguage()
        } ?: CodeWhispererUnknownLanguage.INSTANCE

        // we need classifier result for any type of triggering for classifier group for supported languages
        return if (
            (language.isClassifierSupported() && CodeWhispererUserGroupSettings.getInstance().getUserGroup() == CodeWhispererUserGroup.Classifier) ||
            language.isAllClassifier()
        ) {
            triggerType.calculationResult = classifierResult.calculatedResult

            when (triggerType) {
                // only invoke service if result > threshold for classifier trigger
                is CodeWhispererAutomatedTriggerType.Classifier -> run {
                    if (classifierResult.shouldTrigger) {
                        invoke(editor, triggerType)
                    } else {
                        null
                    }
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

        // tryClassifier with only the supported language
        if (!language.isClassifierSupported()) {
            return ClassifierResult(false)
        }

        val leftContextLines = caretContext.leftFileContext.split(Regex("\r?\n"))
        val leftContextLength = caretContext.leftFileContext.length
        val leftContextAtCurrentLine = if (leftContextLines.size - 1 >= 0) leftContextLines[leftContextLines.size - 1] else ""
        var keyword = ""
        val lastToken = leftContextAtCurrentLine.trim().split(" ").let { tokens ->
            if (tokens.size - 1 >= 0) tokens[tokens.size - 1] else ""
        }
        if (lastToken.length > 1) keyword = lastToken

        val lengthOfLeftCurrent = leftContextAtCurrentLine.length
        val lengthOfLeftPrev = if (leftContextLines.size - 2 >= 0) {
            leftContextLines[leftContextLines.size - 2].length.toDouble()
        } else {
            0.0
        }

        val rightContext = caretContext.rightFileContext
        val lengthOfRight = rightContext.trim().length

        val isExperimentGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup() == CodeWhispererUserGroup.Classifier

        val triggerTypeCoefficient = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.triggerTypeCoefficientMapExp[automatedTriggerType] ?: 0.0
        } else CodeWhispererClassifierConstants.triggerTypeCoefficientMap[automatedTriggerType] ?: 0.0

        val osCoefficient: Double = if (SystemInfo.isMac) {
            if (isExperimentGroup) {
                CodeWhispererClassifierConstants.osMapExp["Mac OS X"] ?: 0.0
            } else CodeWhispererClassifierConstants.osMap["Mac OS X"] ?: 0.0
        } else if (SystemInfo.isWindows) {
            val osVersion = SystemInfo.OS_VERSION
            if (osVersion.contains("11", true) || osVersion.contains("10", true)) {
                if (isExperimentGroup) {
                    CodeWhispererClassifierConstants.osMapExp["Windows 10"]
                } else {
                    CodeWhispererClassifierConstants.osMap["Windows 10"]
                }
            } else if (osVersion.contains("7", true)) {
                if (isExperimentGroup) {
                    CodeWhispererClassifierConstants.osMapExp["Windows"]
                } else {
                    CodeWhispererClassifierConstants.osMap["Windows 7"]
                }
            } else {
                if (isExperimentGroup) CodeWhispererClassifierConstants.osMapExp["Windows"] else 0.0
            }
        } else {
            0.0
        } ?: 0.0

        val lastCharCoefficient = if (leftContextAtCurrentLine.length - 1 >= 0) {
            if (isExperimentGroup) {
                CodeWhispererClassifierConstants.coefficientsMapExp[leftContextAtCurrentLine[leftContextAtCurrentLine.length - 1].toString()] ?: 0.0
            } else CodeWhispererClassifierConstants.coefficientsMap[leftContextAtCurrentLine[leftContextAtCurrentLine.length - 1].toString()] ?: 0.0
        } else {
            0.0
        }

        val keywordCoefficient = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.coefficientsMapExp[keyword] ?: 0.0
        } else CodeWhispererClassifierConstants.coefficientsMap[keyword] ?: 0.0
        val languageCoefficient = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.languageMapExp[language] ?: 0.0
        } else CodeWhispererClassifierConstants.languageMap[language] ?: 0.0
        val ideCoefficient = 0.0

        val lineDiff = if (isExperimentGroup) 0.0 else lastInvocationLineNum?.let { (caretPosition.line.toDouble() - it) } ?: 0.0

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
                if (previousOneDecision == CodewhispererPreviousSuggestionState.Accept) {
                    if (isExperimentGroup) {
                        CodeWhispererClassifierConstants.prevDecisionAcceptCoefficientExp
                    } else CodeWhispererClassifierConstants.prevDecisionAcceptCoefficient
                } else {
                    0.0
                }
            previousOneReject =
                if (previousOneDecision == CodewhispererPreviousSuggestionState.Reject) {
                    if (isExperimentGroup) {
                        CodeWhispererClassifierConstants.prevDecisionRejectCoefficientExp
                    } else CodeWhispererClassifierConstants.prevDecisionRejectCoefficient
                } else {
                    0.0
                }
            previousOneOther =
                if (
                    previousOneDecision != CodewhispererPreviousSuggestionState.Accept &&
                    previousOneDecision != CodewhispererPreviousSuggestionState.Reject
                ) {
                    if (isExperimentGroup) {
                        CodeWhispererClassifierConstants.prevDecisionOtherCoefficientExp
                    } else CodeWhispererClassifierConstants.prevDecisionOtherCoefficient
                } else {
                    0.0
                }
        }

        var leftContextLengthCoefficient: Double = 0.0
        if (isExperimentGroup) {
            leftContextLengthCoefficient = when (leftContextLength) {
                in 0..4 -> CodeWhispererClassifierConstants.lengthLeft0To5Exp
                in 5..9 -> CodeWhispererClassifierConstants.lengthLeft5To10Exp
                in 10..19 -> CodeWhispererClassifierConstants.lengthLeft10To20Exp
                in 20..29 -> CodeWhispererClassifierConstants.lengthLeft20To30Exp
                in 30..39 -> CodeWhispererClassifierConstants.lengthLeft30To40Exp
                in 40..49 -> CodeWhispererClassifierConstants.lengthLeft40To50Exp
                else -> 0.0
            }
        }

        val normalizedLengthOfRight = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.lengthofRightCoefficientExp * VariableTypeNeedNormalize.LenRight.normalizeExp(lengthOfRight.toDouble())
        } else CodeWhispererClassifierConstants.lengthofRightCoefficient * VariableTypeNeedNormalize.LenRight.normalize(lengthOfRight.toDouble())

        val normalizedLengthOfLeftCurrent = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.lengthOfLeftCurrentCoefficientExp *
                VariableTypeNeedNormalize.LenLeftCur.normalizeExp(lengthOfLeftCurrent.toDouble())
        } else CodeWhispererClassifierConstants.lengthOfLeftCurrentCoefficient * VariableTypeNeedNormalize.LenLeftCur.normalize(lengthOfLeftCurrent.toDouble())

        val normalizedLengthOfPrev = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.lengthOfLeftPrevCoefficientExp * VariableTypeNeedNormalize.LenLeftPrev.normalizeExp(lengthOfLeftPrev)
        } else CodeWhispererClassifierConstants.lengthOfLeftPrevCoefficient * VariableTypeNeedNormalize.LenLeftPrev.normalize(lengthOfLeftPrev)

        val normalizedLineNum = if (isExperimentGroup) {
            CodeWhispererClassifierConstants.lineNumCoefficientExp * VariableTypeNeedNormalize.LineNum.normalizeExp(caretPosition.line.toDouble())
        } else CodeWhispererClassifierConstants.lineNumCoefficient * VariableTypeNeedNormalize.LineNum.normalize(caretPosition.line.toDouble())

        val normalizedCursor = if (isExperimentGroup) {
            0.0
        } else CodeWhispererClassifierConstants.cursorOffsetCoefficient * VariableTypeNeedNormalize.Cursor.normalize(caretPosition.offset.toDouble())

        val normalizedLineDiff = if (isExperimentGroup) {
            0.0
        } else CodeWhispererClassifierConstants.lineDiffCoefficient * VariableTypeNeedNormalize.LineDiff.normalize(lineDiff)

        val intercept = if (isExperimentGroup) CodeWhispererClassifierConstants.interceptExp else CodeWhispererClassifierConstants.intercept

        val resultBeforeSigmoid =
            normalizedLengthOfRight +
                normalizedLengthOfLeftCurrent +
                normalizedLengthOfPrev +
                normalizedLineNum +
                normalizedCursor +
                normalizedLineDiff +
                languageCoefficient +
                osCoefficient +
                triggerTypeCoefficient +
                lastCharCoefficient +
                keywordCoefficient +
                ideCoefficient +
                previousOneAccept +
                previousOneReject +
                previousOneOther +
                leftContextLengthCoefficient +
                intercept

        val shouldTrigger = sigmoid(resultBeforeSigmoid) > getThreshold()
        return ClassifierResult(shouldTrigger, sigmoid(resultBeforeSigmoid))
    }

    override fun dispose() {}

    companion object {
        private const val triggerThreshold: Double = 0.4
        private const val triggerThresholdExp: Double = 0.43

        fun getInstance(): CodeWhispererAutoTriggerService = service()

        fun getThreshold(): Double = if (CodeWhispererUserGroupSettings.getInstance().getUserGroup() == CodeWhispererUserGroup.Classifier) {
            triggerThresholdExp
        } else {
            triggerThreshold
        }

        fun sigmoid(x: Double): Double = 1 / (1 + exp(-x))
    }
}

private enum class VariableTypeNeedNormalize {
    Cursor {
        override fun normalize(value: Double): Double = (value - minn.cursor) / (maxx.cursor - minn.cursor)
        override fun normalizeExp(value: Double): Double = 0.0
    },
    LineNum {
        override fun normalize(value: Double): Double = (value - minn.lineNum) / (maxx.lineNum - minn.lineNum)
        override fun normalizeExp(value: Double): Double = (value - minnExp.lineNum) / (maxxExp.lineNum - minnExp.lineNum)
    },
    LenLeftCur {
        override fun normalize(value: Double): Double = (value - minn.lenLeftCur) / (maxx.lenLeftCur - minn.lenLeftCur)
        override fun normalizeExp(value: Double): Double = (value - minnExp.lenLeftCur) / (maxxExp.lenLeftCur - minnExp.lenLeftCur)
    },
    LenLeftPrev {
        override fun normalize(value: Double): Double = (value - minn.lenLeftPrev) / (maxx.lenLeftPrev - minn.lenLeftPrev)
        override fun normalizeExp(value: Double): Double = (value - minnExp.lenLeftPrev) / (maxxExp.lenLeftPrev - minnExp.lenLeftPrev)
    },
    LenRight {
        override fun normalize(value: Double): Double = (value - minn.lenRight) / (maxx.lenRight - minn.lenRight)
        override fun normalizeExp(value: Double): Double = (value - minnExp.lenRight) / (maxxExp.lenRight - minnExp.lenRight)
    },
    LineDiff {
        override fun normalize(value: Double): Double = (value - minn.lineDiff) / (maxx.lineDiff - minn.lineDiff)
        override fun normalizeExp(value: Double): Double = 0.0
    };

    abstract fun normalize(value: Double): Double
    abstract fun normalizeExp(toDouble: Double): Double

    data class NormalizedCoefficients(
        val cursor: Double,
        val lineNum: Double,
        val lenLeftCur: Double,
        val lenLeftPrev: Double,
        val lenRight: Double,
        val lineDiff: Double,
    )

    data class NormalizedCoefficientsExp(
        val lineNum: Double,
        val lenLeftCur: Double,
        val lenLeftPrev: Double,
        val lenRight: Double,
    )

    companion object {
        private val maxx = NormalizedCoefficients(
            cursor = 84716.0,
            lineNum = 2033.0,
            lenLeftCur = 157.0,
            lenLeftPrev = 157.0,
            lenRight = 10239.0,
            lineDiff = 270.0,
        )

        private val maxxExp = NormalizedCoefficientsExp(
            lineNum = 4631.0,
            lenLeftCur = 157.0,
            lenLeftPrev = 176.0,
            lenRight = 10239.0,
        )

        private val minn = NormalizedCoefficients(
            cursor = 1.0,
            lineNum = 0.0,
            lenLeftCur = 0.0,
            lenLeftPrev = 0.0,
            lenRight = 0.0,
            lineDiff = -28336.0,
        )

        private val minnExp = NormalizedCoefficientsExp(
            lineNum = 0.0,
            lenLeftCur = 0.0,
            lenLeftPrev = 0.0,
            lenRight = 0.0,
        )
    }
}
