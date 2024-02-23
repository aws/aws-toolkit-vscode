// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation.psireferences

import com.intellij.openapi.paths.WebReference
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.SyntheticElement
import com.intellij.psi.impl.FakePsiElement
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.services.federation.AwsConsoleUrlFactory

class ArnReference(element: PsiElement, textRange: TextRange, private val arn: String) : WebReference(element, textRange) {
    inner class MyFakePsiElement : FakePsiElement(), SyntheticElement {
        override fun getName() = arn
        override fun getParent() = element
        override fun getPresentableText() = arn

        override fun navigate(requestFocus: Boolean) {
            val project = element.project

            AwsConsoleUrlFactory.openArnInConsole(project, ToolkitPlaces.EDITOR_PSI_REFERENCE, arn)
        }
    }
    override fun resolve() = MyFakePsiElement()
}
