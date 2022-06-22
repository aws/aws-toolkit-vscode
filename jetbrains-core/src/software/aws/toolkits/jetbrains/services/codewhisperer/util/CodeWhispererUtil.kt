// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.util

import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.aws.toolkits.telemetry.CodewhispererCompletionType

object CodeWhispererUtil {

    fun checkCompletionType(
        results: List<Recommendation>,
        noRecommendation: Boolean
    ): CodewhispererCompletionType {
        if (noRecommendation) {
            return CodewhispererCompletionType.Unknown
        }
        return if (results[0].content().contains("\n")) {
            CodewhispererCompletionType.Block
        } else {
            CodewhispererCompletionType.Line
        }
    }

    // return true if every recommendation is empty
    fun checkEmptyRecommendations(recommendations: List<Recommendation>): Boolean =
        recommendations.all { it.content().isEmpty() }
}

enum class CaretMovement {
    NO_CHANGE, MOVE_FORWARD, MOVE_BACKWARD
}
