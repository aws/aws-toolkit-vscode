// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.codewhisperer.importadder

import com.intellij.lang.ecmascript6.psi.impl.ES6CreateImportUtil
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile

object CodeWhispererJSImportUtil {
    fun insert(psiFile: PsiFile, element: PsiElement) {
        ES6CreateImportUtil.findPlaceAndInsertAnyImport(psiFile, element)
    }
}
