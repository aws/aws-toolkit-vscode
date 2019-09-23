// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.lang.Language
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager

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
