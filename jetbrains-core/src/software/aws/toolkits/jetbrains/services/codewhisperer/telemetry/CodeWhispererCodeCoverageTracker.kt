// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.impl.event.DocumentEventImpl
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.SessionContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererUserActionListener
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_SECONDS_IN_MINUTE
import software.aws.toolkits.telemetry.CodewhispererLanguage
import software.aws.toolkits.telemetry.CodewhispererTelemetry
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.roundToInt

abstract class CodeWhispererCodeCoverageTracker(
    private val timeWindowInSec: Long,
    private val language: CodewhispererLanguage,
    private val acceptedTokens: AtomicInteger,
    private val totalTokens: AtomicInteger,
    private val rangeMarkers: MutableList<RangeMarker>
) : Disposable {
    val percentage: Int
        get() = if (totalTokensSize != 0) calculatePercentage(acceptedTokensSize, totalTokensSize) else 0
    val acceptedTokensSize: Int
        get() = acceptedTokens.get()
    val totalTokensSize: Int
        get() = totalTokens.get()
    val acceptedRecommendationsCount: Int
        get() = rangeMarkers.size
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val isShuttingDown = AtomicBoolean(false)
    private var startTime: Instant = Instant.now()

    init {
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(
            CodeWhispererPopupManager.CODEWHISPERER_USER_ACTION_PERFORMED,
            object : CodeWhispererUserActionListener {
                override fun afterAccept(states: InvocationContext, sessionContext: SessionContext, rangeMarker: RangeMarker) {
                    if (states.requestContext.fileContextInfo.programmingLanguage.toCodeWhispererLanguage() != language) return
                    rangeMarkers.add(rangeMarker)
                }
            }
        )
        scheduleCodeWhispererCodeCoverageTracker()
    }

    fun documentChanged(event: DocumentEvent) {
        // When open a file for the first time, IDE will also emit DocumentEvent for loading with `isWholeTextReplaced = true`
        // Added this condition to filter out those events
        if (event.isWholeTextReplaced) {
            LOG.debug { "event with isWholeTextReplaced flag: $event" }
            (event as? DocumentEventImpl)?.let {
                if (it.initialStartOffset == 0 && it.initialOldLength == event.document.textLength) return
            }
        }
        addAndGetTotalTokens(event.newLength - event.oldLength)
    }

    private fun flush() {
        try {
            if (isTelemetryEnabled()) emitCodeWhispererCodeContribution()
        } finally {
            reset()
            scheduleCodeWhispererCodeCoverageTracker()
        }
    }

    private fun scheduleCodeWhispererCodeCoverageTracker() {
        if (!alarm.isDisposed && !isShuttingDown.get()) {
            alarm.addRequest({ flush() }, Duration.ofSeconds(timeWindowInSec).toMillis())
        }
    }

    private fun addAndGetAcceptedTokens(delta: Int): Int =
        if (!isTelemetryEnabled()) acceptedTokensSize
        else acceptedTokens.addAndGet(delta)

    private fun addAndGetTotalTokens(delta: Int): Int =
        if (!isTelemetryEnabled()) totalTokensSize
        else {
            val result = totalTokens.addAndGet(delta)
            if (result < 0) totalTokens.set(0)
            result
        }

    private fun reset() {
        startTime = Instant.now()
        totalTokens.set(0)
        acceptedTokens.set(0)
        rangeMarkers.clear()
    }

    private fun emitCodeWhispererCodeContribution() {
        rangeMarkers.forEach {
            if (!it.isValid) return@forEach
            addAndGetAcceptedTokens(it.endOffset - it.startOffset)
        }

        CodewhispererTelemetry.codePercentage(
            project = null,
            acceptedTokensSize,
            language,
            percentage,
            startTime.toString(),
            totalTokensSize
        )
    }

    @TestOnly
    fun forceTrackerFlush() {
        alarm.drainRequestsInTest()
    }

    @TestOnly
    fun activeRequestCount() = alarm.activeRequestCount

    override fun dispose() {
        if (isShuttingDown.getAndSet(true)) {
            return
        }
        flush()
    }

    companion object {
        private val LOG = getLogger<CodeWhispererCodeCoverageTracker>()
        private val instances: MutableMap<CodewhispererLanguage, CodeWhispererCodeCoverageTracker> = mutableMapOf()

        fun calculatePercentage(acceptedTokens: Int, totalTokens: Int): Int = ((acceptedTokens.toDouble() * 100) / totalTokens).roundToInt()
        fun getInstance(language: CodewhispererLanguage): CodeWhispererCodeCoverageTracker = when (val instance = instances[language]) {
            null -> {
                val newTracker = DefaultCodeWhispererCodeCoverageTracker(language)
                instances[language] = newTracker
                newTracker
            }
            else -> instance
        }

        @TestOnly
        fun getInstancesMap(): MutableMap<CodewhispererLanguage, CodeWhispererCodeCoverageTracker> {
            assert(ApplicationManager.getApplication().isUnitTestMode)
            return instances
        }
    }
}

class DefaultCodeWhispererCodeCoverageTracker(language: CodewhispererLanguage) : CodeWhispererCodeCoverageTracker(
    5 * TOTAL_SECONDS_IN_MINUTE,
    language,
    acceptedTokens = AtomicInteger(0),
    totalTokens = AtomicInteger(0),
    mutableListOf()
)
