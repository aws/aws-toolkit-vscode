// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.SuggestedFix

fun offsetSuggestedFix(suggestedFix: SuggestedFix, lines: Int): SuggestedFix {
    val updatedCode = suggestedFix.code.replace(
        Regex("""(@@ -)(\d+)(,\d+ \+)(\d+)(,\d+ @@)""")
    ) { result ->
        val prefix = result.groupValues[1]
        val startLine = result.groupValues[2].toInt() + lines
        val middle = result.groupValues[3]
        val endLine = result.groupValues[4].toInt() + lines
        val suffix = result.groupValues[5]
        "$prefix$startLine$middle$endLine$suffix"
    }

    return suggestedFix.copy(code = updatedCode)
}
