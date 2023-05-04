// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.service

import software.aws.toolkits.telemetry.CodewhispererAutomatedTriggerType

sealed class CodeWhispererAutomatedTriggerType(
    val telemetryType: CodewhispererAutomatedTriggerType,
    var calculationResult: Double?
) {
    class Classifier(calculationResult: Double?) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Classifier, calculationResult)
    class SpecialChar(val specialChar: Char, calculationResult: Double? = null) :
        CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.SpecialCharacters, calculationResult)

    class Enter(calculationResult: Double? = null) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Enter, calculationResult)

    class IntelliSense(calculationResult: Double? = null) :
        CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IntelliSenseAcceptance, calculationResult)

    class IdleTime(calculationResult: Double? = null) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.IdleTime, calculationResult)

    class Unknown(calculationResult: Double? = null) : CodeWhispererAutomatedTriggerType(CodewhispererAutomatedTriggerType.Unknown, calculationResult)
}
