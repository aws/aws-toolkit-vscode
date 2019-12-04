// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import java.time.Clock
import java.time.LocalDate

class CopyrightHeaderRule(clock: Clock = Clock.systemUTC()) : Rule("copyright-header"), Rule.Modifier.RestrictToRoot {
    private val header = """
            // Copyright ${LocalDate.now(clock).year} Amazon.com, Inc. or its affiliates. All Rights Reserved.
            // SPDX-License-Identifier: Apache-2.0
        """.trimIndent()

    override fun visit(
        node: ASTNode,
        autoCorrect: Boolean,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit
    ) {
        if (!node.text.startsWith(header)) {
            emit(node.startOffset, "Missing or incorrect file header", false)
        }
    }
}
