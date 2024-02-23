// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.psi.PsiFile

/**
 * Note the implementation of [CodeWhispererClassResolver] should live in its corresponding module if it's dependent on
 * JB's specific language support. For example [CodeWhispererPythonClassResolver] uses [PyFile] which makes it depends on python extension point
 */
interface CodeWhispererClassResolver {
    fun resolveClassAndMembers(psiFile: PsiFile): Map<ClassResolverKey, List<String>>

    fun resolveTopLevelFunction(psiFile: PsiFile): List<String>

    companion object {
        val EP_NAME = ExtensionPointName<CodeWhispererClassResolver>("aws.toolkit.codewhisperer.classResolver")
    }
}

enum class ClassResolverKey {
    ClassName,
    MethodName
}
