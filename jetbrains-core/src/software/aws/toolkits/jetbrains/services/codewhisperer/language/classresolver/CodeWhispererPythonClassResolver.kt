// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.language.classresolver

import com.intellij.openapi.application.runReadAction
import com.intellij.psi.PsiFile
import com.jetbrains.python.psi.PyFile

class CodeWhispererPythonClassResolver : CodeWhispererClassResolver {
    override fun resolveClassAndMembers(psiFile: PsiFile): Map<ClassResolverKey, List<String>> {
        if (psiFile !is PyFile) {
            return emptyMap()
        }
        val classNames = runReadAction {
            psiFile.topLevelClasses.mapNotNull { it.name }
        }

        val methodNames = runReadAction {
            psiFile.topLevelClasses.mapNotNull { clazz ->
                clazz.methods.mapNotNull { method ->
                    method.name
                }
            }
        }.flatten()

        return mapOf(
            ClassResolverKey.ClassName to classNames,
            ClassResolverKey.MethodName to methodNames
        )
    }

    override fun resolveTopLevelFunction(psiFile: PsiFile): List<String> {
        if (psiFile !is PyFile) {
            return emptyList()
        }

        val functionNames = runReadAction {
            psiFile.topLevelFunctions.mapNotNull { it.name }
        }

        return functionNames
    }
}
