// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.ktlint.rules

import com.pinterest.ktlint.core.Rule
import org.jetbrains.kotlin.com.intellij.lang.ASTNode
import org.jetbrains.kotlin.psi.KtImportDirective

class BannedImportsRule : Rule("banned-imports") {
    override fun visit(
        node: ASTNode,
        autoCorrect: Boolean,
        emit: (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit
    ) {
        val element = node.psi ?: return
        if (element is KtImportDirective) {
            if (element.importedFqName?.asString() == "org.assertj.core.api.Assertions") {
                emit(node.startOffset, "Import the assertion you want to use directly instead of importing the top level Assertions", false)
            }

            if (element.importedFqName?.asString()?.startsWith("org.hamcrest") == true) {
                emit(node.startOffset, "Use AssertJ instead of Hamcrest assertions", false)
            }
        }
    }
}
