// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.psi.PsiElement
import software.aws.toolkits.resources.message

class ArnReferenceDocumentationProvider : AbstractDocumentationProvider() {
    override fun getQuickNavigateInfo(element: PsiElement?, originalElement: PsiElement?): String? {
        if (element is ArnReference.MyFakePsiElement) {
            return message("general.open_in_aws_console")
        }

        return null
    }
}
