// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType

sealed class CodeWhispererAutomatedTriggerType(
    val telemetryType: CodewhispererAutomatedTriggerType,
    var calculationResult: Double? = null
) {
    class Classifier : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Classifier)
    class SpecialChar(val specialChar: Char) :
        CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.SpecialCharacters)

    class Enter : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Enter)

    class IntelliSense :
        CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IntelliSenseAcceptance)

    class IdleTime : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IdleTime)

    class Unknown : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Unknown)
}
