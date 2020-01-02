// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode

class CopyrightHeaderRule() : Rule("copyright-header"), Rule.Modifier.RestrictToRoot {
    private val header =
        """^// Copyright \d{4} Amazon.com, Inc. or its affiliates. All Rights Reserved.\n// SPDX-License-Identifier: Apache-2.0\n""".toRegex()

    override fun visit(
        node: ASTNode,
        autoCorrect: Boolean,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit
    ) {
        if (!header.containsMatchIn(node.text)) {
            emit(node.startOffset, "Missing or incorrect file header", false)
        }
    }
}
