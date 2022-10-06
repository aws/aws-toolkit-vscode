// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.util.messages.Topic
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.INVOCATION_KEY_INTERVAL_THRESHOLD
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean

class CodeWhispererInvocationStatus {
    private val isInvokingCodeWhisperer: AtomicBoolean = AtomicBoolean(false)
    private var keyStrokeCount: Int = 0
    private var timeAtLastInvocationComplete: Instant? = null
    private var timeAtLastDocumentChanged: Instant = Instant.now()
    private var isPopupActive: Boolean = false

    fun checkExistingInvocationAndSet(): Boolean =
        if (isInvokingCodeWhisperer.getAndSet(true)) {
            LOG.debug { "Have existing CodeWhisperer invocation" }
            true
        } else {
            ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_INVOCATION_STATE_CHANGED).invocationStateChanged(true)
            LOG.debug { "Starting CodeWhisperer invocation" }
            false
        }

    fun hasExistingInvocation(): Boolean = isInvokingCodeWhisperer.get()

    fun finishInvocation() {
        if (isInvokingCodeWhisperer.compareAndSet(true, false)) {
            ApplicationManager.getApplication().messageBus.syncPublisher(CODEWHISPERER_INVOCATION_STATE_CHANGED).invocationStateChanged(false)
            LOG.debug { "Ending CodeWhisperer invocation" }
        }
    }

    fun incrementKeyStrokeCount() {
        keyStrokeCount++
    }

    fun resetKeyStrokeCount() {
        keyStrokeCount = 0
    }

    fun checkKeyStrokeCountMeetThreshold(): Boolean = keyStrokeCount == INVOCATION_KEY_INTERVAL_THRESHOLD

    fun setInvocationComplete() {
        timeAtLastInvocationComplete = Instant.now()
    }

    fun hasMetInvocationTimeThreshold(): Boolean {
        if (!hasEverInvoked()) return true
        val timeSinceLastInvocationComplete = Duration.between(timeAtLastInvocationComplete, Instant.now())
        return timeSinceLastInvocationComplete.seconds > CodeWhispererConstants.INVOCATION_TIME_INTERVAL_THRESHOLD
    }

    private fun hasEverInvoked(): Boolean = timeAtLastInvocationComplete != null

    fun documentChanged() {
        timeAtLastDocumentChanged = Instant.now()
    }

    fun getTimeSinceDocumentChanged(): Double {
        val timeSinceDocumentChanged = Duration.between(timeAtLastDocumentChanged, Instant.now())
        val timeInDouble = timeSinceDocumentChanged.toMillis().toDouble()
        return timeInDouble
    }

    fun hasEnoughDelayToShowCodeWhisperer(): Boolean {
        val timeCanShowCodeWhisperer = timeAtLastDocumentChanged.plusMillis(CodeWhispererConstants.POPUP_DELAY)
        return timeCanShowCodeWhisperer.isBefore(Instant.now())
    }

    fun isPopupActive(): Boolean = isPopupActive

    fun setPopupActive(value: Boolean) {
        isPopupActive = value
    }

    companion object {
        private val LOG = getLogger<CodeWhispererInvocationStatus>()
        fun getInstance(): CodeWhispererInvocationStatus = service()
        val CODEWHISPERER_INVOCATION_STATE_CHANGED: Topic<CodeWhispererInvocationStateChangeListener> = Topic.create(
            "CodeWhisperer popup state changed",
            CodeWhispererInvocationStateChangeListener::class.java
        )
    }
}

interface CodeWhispererInvocationStateChangeListener {
    fun invocationStateChanged(value: Boolean) {}
}
