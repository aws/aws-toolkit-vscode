// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.util.Key
import com.intellij.refactoring.suggested.range
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import info.debatty.java.stringsimilarity.Levenshtein
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.toCodeWhispererLanguage
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
    val percentage: Int?
        get() = if (totalTokensSize != 0) calculatePercentage(acceptedTokensSize, totalTokensSize) else null
    val acceptedTokensSize: Int
        get() = acceptedTokens.get()
    val totalTokensSize: Int
        get() = totalTokens.get()
    val acceptedRecommendationsCount: Int
        get() = rangeMarkers.size
    private val isActive: AtomicBoolean = AtomicBoolean(false)
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)
    private val isShuttingDown = AtomicBoolean(false)
    private var startTime: Instant = Instant.now()

    @Synchronized
    fun activateTrackerIfNotActive() {
        if (!isTelemetryEnabled() || isActive.get()) return
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(
            CodeWhispererPopupManager.CODEWHISPERER_USER_ACTION_PERFORMED,
            object : CodeWhispererUserActionListener {
                override fun afterAccept(states: InvocationContext, sessionContext: SessionContext, rangeMarker: RangeMarker) {
                    if (states.requestContext.fileContextInfo.programmingLanguage.toCodeWhispererLanguage() != language) return
                    rangeMarkers.add(rangeMarker)
                    val originalRecommendation = extractRangeMarkerString(rangeMarker)
                    originalRecommendation?.let {
                        rangeMarker.putUserData(KEY_REMAINING_RECOMMENDATION, it)
                    }
                }
            }
        )
        startTime = Instant.now()
        isActive.set(true)
        scheduleCodeWhispererCodeCoverageTracker()
    }

    internal fun documentChanged(event: DocumentEvent) {
        // When open a file for the first time, IDE will also emit DocumentEvent for loading with `isWholeTextReplaced = true`
        // Added this condition to filter out those events
        if (event.isWholeTextReplaced) {
            LOG.debug { "event with isWholeTextReplaced flag: $event" }
            if (event.oldTimeStamp == 0L) return
        }
        addAndGetTotalTokens(event.newLength - event.oldLength)
    }

    internal fun extractRangeMarkerString(rangeMarker: RangeMarker): String? = runReadAction {
        rangeMarker.range?.let { myRange -> rangeMarker.document.getText(myRange) }
    }

    // With edit distance, complicate usermodification can be considered as simple edit(add, delete, replace),
    // and thus the unmodified part of recommendation length can be deducted/approximated
    // ex. (modified > original): originalRecom: foo -> modifiedRecom: fobarbarbaro, distance = 9, delta = 12 - 9 = 3
    // ex. (modified == original): originalRecom: helloworld -> modifiedRecom: HelloWorld, distance = 2, delta = 10 - 2 = 8
    // ex. (modified < original): originalRecom: CodeWhisperer -> modifiedRecom: CODE, distance = 12, delta = 13 - 12 = 1
    internal fun getAcceptedTokensDelta(originalRecommendation: String, modifiedRecommendation: String): Int {
        val editDistance = getEditDistance(modifiedRecommendation, originalRecommendation).toInt()
        return maxOf(originalRecommendation.length, modifiedRecommendation.length) - editDistance
    }

    protected open fun getEditDistance(modifiedString: String, originalString: String): Double =
        levenshteinChecker.distance(modifiedString, originalString)

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
        rangeMarkers.forEach { rangeMarker ->
            if (!rangeMarker.isValid) return@forEach
            // if users add more code upon the recommendation generated from CodeWhisperer, we consider those added part as userToken but not CwsprTokens
            val originalRecommendation = rangeMarker.getUserData(KEY_REMAINING_RECOMMENDATION)
            val modifiedRecommendation = extractRangeMarkerString(rangeMarker)
            if (originalRecommendation == null || modifiedRecommendation == null) {
                LOG.debug {
                    "failed to get accepted recommendation. " +
                        "OriginalRecommendation is null: ${originalRecommendation == null}; " +
                        "ModifiedRecommendation is null: ${modifiedRecommendation == null}"
                }
                return@forEach
            }
            val delta = getAcceptedTokensDelta(originalRecommendation, modifiedRecommendation)
            addAndGetAcceptedTokens(delta)
        }

        // percentage == null means totalTokens == 0 and users are not editing the document, thus we shouldn't emit telemetry for this
        percentage?.let { percentage ->
            CodewhispererTelemetry.codePercentage(
                project = null,
                acceptedTokensSize,
                language,
                percentage,
                startTime.toString(),
                totalTokensSize
            )
        }
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
        @JvmStatic
        protected val levenshteinChecker = Levenshtein()
        private const val REMAINING_RECOMMENDATION = "remainingRecommendation"
        private val KEY_REMAINING_RECOMMENDATION = Key<String>(REMAINING_RECOMMENDATION)
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
