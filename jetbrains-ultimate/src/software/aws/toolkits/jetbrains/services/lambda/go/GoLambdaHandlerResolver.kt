// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class GoLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(project: Project, handler: String, searchScope: GlobalSearchScope): Array<NavigatablePsiElement> {
        TODO("Not yet implemented")
    }

    override fun determineHandler(element: PsiElement): String? {
        TODO("Not yet implemented")
    }

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> {
        TODO("Not yet implemented")
    }
}
