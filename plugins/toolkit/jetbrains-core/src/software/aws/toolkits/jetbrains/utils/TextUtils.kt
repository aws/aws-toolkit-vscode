// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.lang.Language
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.diff.impl.patch.PatchReader
import com.intellij.openapi.diff.impl.patch.TextFilePatch
import com.intellij.openapi.diff.impl.patch.apply.GenericPatchApplier
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.SuggestedFix

fun formatText(project: Project, language: Language, content: String): String {
    var result = content
    CommandProcessor.getInstance().runUndoTransparentAction {
        PsiFileFactory.getInstance(project)
            .createFileFromText("foo.bar", language, content, false, true)?.let {
                result = CodeStyleManager.getInstance(project).reformat(it).text
            }
    }

    return result
}

/**
 * Designed to convert underscore separated words (e.g. UPDATE_COMPLETE) into title cased human readable text
 * (e.g. Update Complete)
 */
fun String.toHumanReadable() = StringUtil.toTitleCase(toLowerCase().replace('_', ' '))

fun generateUnifiedPatch(patch: String, filePath: String): TextFilePatch {
    val unifiedPatch = "--- $filePath\n+++ $filePath\n$patch"
    val patchReader = PatchReader(unifiedPatch)
    val patches = patchReader.readTextPatches()
    return patches[0]
}

fun applyPatch(patch: String, fileContent: String, filePath: String): String {
    val unifiedPatch = generateUnifiedPatch(patch, filePath)
    return GenericPatchApplier.applySomehow(fileContent, unifiedPatch.hunks).patchedText
}

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
