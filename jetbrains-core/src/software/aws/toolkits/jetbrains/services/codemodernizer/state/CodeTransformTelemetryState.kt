// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.state

import com.intellij.openapi.components.BaseState
import com.intellij.util.xmlb.annotations.Property
import java.time.Instant
import java.util.UUID

class CodeTransformTelemetryState {
    private var mainState = CodeModernizerTelemetryStateBase()

    fun getSessionId() = mainState.sessionId
    fun setSessionId() {
        mainState.sessionId = UUID.randomUUID().toString()
    }

    fun getStartTime() = mainState.sessionStartTime
    fun setStartTime() {
        mainState.sessionStartTime = Instant.now()
    }

    // Companion object to hold the singleton instance
    companion object {
        // Lazy initialization of the singleton instance
        val instance: CodeTransformTelemetryState by lazy { CodeTransformTelemetryState() }
    }
}

class CodeModernizerTelemetryStateBase : BaseState() {
    @get:Property
    var sessionId: String = UUID.randomUUID().toString()

    @get:Property
    var sessionStartTime: Instant = Instant.now()
}
