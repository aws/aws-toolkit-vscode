// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.telemetry

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.util.Alarm
import com.intellij.util.AlarmFactory
import info.debatty.java.stringsimilarity.Levenshtein
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererUserGroupSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.getConnectionStartUrl
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.InsertedCodeModificationEntry
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.getStartUrl
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererLanguage
import software.aws.toolkits.telemetry.CodewhispererRuntime
import software.aws.toolkits.telemetry.CodewhispererTelemetry
import software.aws.toolkits.telemetry.CodewhispererTriggerType
import java.time.Duration
import java.time.Instant
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

interface UserModificationTrackingEntry {
    val time: Instant
}

data class AcceptedSuggestionEntry(
    override val time: Instant,
    val vFile: VirtualFile?,
    val range: RangeMarker,
    val suggestion: String,
    val sessionId: String,
    val requestId: String,
    val index: Int,
    val triggerType: CodewhispererTriggerType,
    val completionType: CodewhispererCompletionType,
    val codewhispererLanguage: CodewhispererLanguage,
    val codewhispererRuntime: CodewhispererRuntime?,
    val codewhispererRuntimeSource: String?,
    val connection: ToolkitConnection?
) : UserModificationTrackingEntry

class CodeWhispererUserModificationTracker(private val project: Project) : Disposable {
    private val acceptedSuggestions = LinkedBlockingDeque<UserModificationTrackingEntry>(DEFAULT_MAX_QUEUE_SIZE)
    private val alarm = AlarmFactory.getInstance().create(Alarm.ThreadToUse.POOLED_THREAD, this)

    private val isShuttingDown = AtomicBoolean(false)

    init {
        scheduleCodeWhispererTracker()
    }

    private fun scheduleCodeWhispererTracker() {
        if (!alarm.isDisposed && !isShuttingDown.get()) {
            alarm.addRequest({ flush() }, DEFAULT_CHECK_INTERVAL.toMillis())
        }
    }

    private fun isTelemetryEnabled(): Boolean = AwsSettings.getInstance().isTelemetryEnabled

    fun enqueue(event: UserModificationTrackingEntry) {
        if (!isTelemetryEnabled()) {
            return
        }

        acceptedSuggestions.add(event)
        LOG.debug { "Enqueue Accepted Suggestion on line $event.lineNumber in $event.filePath" }
    }

    private fun flush() {
        try {
            if (!isTelemetryEnabled()) {
                acceptedSuggestions.clear()
                return
            }

            val copyList = LinkedBlockingDeque<UserModificationTrackingEntry>()

            val currentTime = Instant.now()
            for (acceptedSuggestion in acceptedSuggestions) {
                if (Duration.between(acceptedSuggestion.time, currentTime).seconds > DEFAULT_MODIFICATION_INTERVAL_IN_SECONDS) {
                    LOG.debug { "Passed $DEFAULT_MODIFICATION_INTERVAL_IN_SECONDS for $acceptedSuggestion" }
                    when (acceptedSuggestion) {
                        is AcceptedSuggestionEntry -> emitTelemetryOnSuggestion(acceptedSuggestion)
                        is InsertedCodeModificationEntry -> emitTelemetryOnChatCodeInsert(acceptedSuggestion)
                        else -> {}
                    }
                } else {
                    copyList.add(acceptedSuggestion)
                }
            }

            acceptedSuggestions.clear()
            acceptedSuggestions.addAll(copyList)
        } finally {
            scheduleCodeWhispererTracker()
        }
    }

    private fun emitTelemetryOnChatCodeInsert(insertedCode: InsertedCodeModificationEntry) {
        try {
            val file = insertedCode.vFile
            if (file == null || (!file.isValid)) throw Exception("Record OnChatCodeInsert - invalid file")

            val document = runReadAction {
                FileDocumentManager.getInstance().getDocument(file)
            }
            val currentString = document?.getText(
                TextRange(insertedCode.range.startOffset, insertedCode.range.endOffset)
            )
            val modificationPercentage = checkDiff(currentString?.trim(), insertedCode.originalString.trim())
            sendModificationWithChatTelemetry(insertedCode, modificationPercentage)
        } catch (e: Exception) {
            sendModificationWithChatTelemetry(insertedCode, 1.0)
        }
    }

    private fun emitTelemetryOnSuggestion(acceptedSuggestion: AcceptedSuggestionEntry) {
        val file = acceptedSuggestion.vFile

        if (file == null || (!file.isValid)) {
            sendModificationTelemetry(acceptedSuggestion, 1.0)
            // temp remove event sent as further discussion needed for metric calculation
            // sendUserModificationTelemetryToServiceAPI(acceptedSuggestion, 1.0)
        } else {
            try {
                /**
                 * this try-catch is to check if the offsets are valid since the method does not return null
                 */
                val document = runReadAction {
                    FileDocumentManager.getInstance().getDocument(file)
                }
                val currentString = document?.getText(
                    TextRange(acceptedSuggestion.range.startOffset, acceptedSuggestion.range.endOffset)
                )
                val modificationPercentage = checkDiff(currentString?.trim(), acceptedSuggestion.suggestion.trim())
                sendModificationTelemetry(acceptedSuggestion, modificationPercentage)
                // temp remove event sent as further discussion needed for metric calculation
                // sendUserModificationTelemetryToServiceAPI(acceptedSuggestion, modificationPercentage)
            } catch (e: Exception) {
                sendModificationTelemetry(acceptedSuggestion, 1.0)
                // temp remove event sent as further discussion needed for metric calculation
                // sendUserModificationTelemetryToServiceAPI(acceptedSuggestion, 1.0)
            }
        }
    }

    /**
     * Use Levenshtein distance to check how
     * Levenshtein distance was preferred over Jaro–Winkler distance for simplicity
     */
    private fun checkDiff(currString: String?, acceptedString: String?): Double {
        if (currString == null || acceptedString == null || acceptedString.isEmpty() || currString.isEmpty()) {
            return 1.0
        }

        val diff = checker.distance(currString, acceptedString)
        val percentage = diff / acceptedString.length

        return min(1.0, percentage)
    }

    private fun sendModificationTelemetry(suggestion: AcceptedSuggestionEntry, percentage: Double) {
        LOG.debug { "Sending user modification telemetry. Request Id: ${suggestion.requestId}" }
        val startUrl = getConnectionStartUrl(suggestion.connection)
        CodewhispererTelemetry.userModification(
            project = project,
            codewhispererCompletionType = suggestion.completionType,
            codewhispererLanguage = suggestion.codewhispererLanguage,
            codewhispererModificationPercentage = percentage,
            codewhispererRequestId = suggestion.requestId,
            codewhispererRuntime = suggestion.codewhispererRuntime,
            codewhispererRuntimeSource = suggestion.codewhispererRuntimeSource,
            codewhispererSessionId = suggestion.sessionId,
            codewhispererSuggestionIndex = suggestion.index,
            codewhispererTriggerType = suggestion.triggerType,
            credentialStartUrl = startUrl,
            codewhispererUserGroup = CodeWhispererUserGroupSettings.getInstance().getUserGroup().name
        )
    }

    private fun sendModificationWithChatTelemetry(insertedCode: InsertedCodeModificationEntry, percentage: Double) {
        AmazonqTelemetry.modifyCode(
            cwsprChatConversationId = insertedCode.conversationId,
            cwsprChatMessageId = insertedCode.messageId,
            cwsprChatModificationPercentage = percentage,
            credentialStartUrl = getStartUrl(project)
        )
        CodeWhispererClientAdaptor.getInstance(project).sendChatUserModificationTelemetry(insertedCode.conversationId, insertedCode.messageId, null, percentage)
    }

// temp disable user modfication event for further discussion on metric calculation
//    private fun sendUserModificationTelemetryToServiceAPI(
//        suggestion: AcceptedSuggestionEntry,
//        modificationPercentage: Double
//    ) {
//        calculateIfIamIdentityCenterConnection(project) {
//            val response = try {
//                CodeWhispererClientAdaptor.getInstance(project)
//                    .sendUserModificationTelemetry(
//                        suggestion.sessionId,
//                        suggestion.requestId,
//                        suggestion.vFile?.let { CodeWhispererLanguageManager.getInstance().getLanguage(suggestion.vFile) },
//                        CodeWhispererModelConfigurator.getInstance().activeCustomization(project)?.arn.orEmpty(),
//                        modificationPercentage
//                    )
//            } catch (e: Exception) {
//                when (e) {
//                    is CodeWhispererRuntimeException -> {
//                        LOG.info(e) {
//                            "Failed to send code scan telemetry with Code Whisperer Runtime Exception"
//                        }
//                    }
//
//                    is CodeWhispererException -> {
//                        LOG.info(e) {
//                            "Failed to send code scan telemetry with Code Whisperer Exception"
//                        }
//                    }
//
//                    else -> {
//                        LOG.info(e) { "Failed to send user modification telemetry." }
//                    }
//                }
//                null
//            }
//
//            response?.let {
//                LOG.debug { "Successfully sent user modification telemetry. RequestId: ${it.responseMetadata().requestId()}" }
//            }
//        }
//    }

    companion object {
        private val DEFAULT_CHECK_INTERVAL = Duration.ofMinutes(1)
        private const val DEFAULT_MAX_QUEUE_SIZE = 10000
        private const val DEFAULT_MODIFICATION_INTERVAL_IN_SECONDS = 300 // 5 minutes

        private val checker = Levenshtein()

        private val LOG = getLogger<CodeWhispererUserModificationTracker>()

        fun getInstance(project: Project) = project.service<CodeWhispererUserModificationTracker>()
    }

    override fun dispose() {
        if (isShuttingDown.getAndSet(true)) {
            return
        }

        flush()
    }
}
