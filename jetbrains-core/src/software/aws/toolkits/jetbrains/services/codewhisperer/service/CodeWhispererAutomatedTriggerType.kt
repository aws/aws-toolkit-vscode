// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType

sealed class CodeWhispererAutomatedTriggerType(val telemetryType: CodewhispererAutomatedTriggerType) {
    data class Classifier(val calculationResult: Double = 0.0) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Classifier)
    data class SpecialChar(val specialChar: Char) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.SpecialCharacters)

    object Enter : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Enter)

    object IntelliSense : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IntelliSenseAcceptance)

    object IdleTime : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IdleTime)

    object Unknown : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Unknown)
}
