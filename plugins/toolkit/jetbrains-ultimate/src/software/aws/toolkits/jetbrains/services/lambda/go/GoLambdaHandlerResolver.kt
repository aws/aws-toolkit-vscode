// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.goide.execution.testing.GoTestFinder
import com.goide.psi.GoFunctionDeclaration
import com.goide.psi.GoTokenType
import com.goide.psi.GoType
import com.goide.psi.GoTypeList
import com.goide.psi.impl.GoLightType
import com.goide.psi.impl.GoPsiUtil
import com.goide.stubs.index.GoFunctionIndex
import com.goide.stubs.index.GoIdFilter
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.util.elementType
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class GoLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(project: Project, handler: String, searchScope: GlobalSearchScope): Array<NavigatablePsiElement> =
        // GoFunctionDeclarationImpl is a NavigatablePsiElement
        GoFunctionIndex.find(handler, project, searchScope, GoIdFilter.getFilesFilter(searchScope))
            .filter { it.isValidHandlerIdentifier() }
            .filterIsInstance<NavigatablePsiElement>()
            .toTypedArray()

    override fun determineHandler(element: PsiElement): String? {
        // Go PSI is different, go function declarations are not leaf's like in some other
        // languages, they are CompositeElements
        val parent = element.parent
        if (parent !is GoFunctionDeclaration) {
            return null
        }

        // we only want to pick up the identifier otherwise we will get 4 gutter icons
        // `func` is also a GoTokenType and we don't have any way to extract
        // that information (without using the internal name for debug)
        if (element.elementType !is GoTokenType || element.text == "func") {
            return null
        }

        if (!parent.isValidHandlerIdentifier()) {
            return null
        }

        return parent.name
    }

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> = determineHandler(element)?.let { setOf(it) }.orEmpty()

    // see https://docs.aws.amazon.com/lambda/latest/dg/golang-handler.html for what is valid
    private fun GoFunctionDeclaration.isValidHandlerIdentifier(): Boolean {
        // disable on test files
        if (GoTestFinder.isTestFile(this.containingFile)) {
            return false
        }

        // make sure it's a top level function
        if (!GoPsiUtil.isTopLevelDeclaration(this)) {
            return false
        }

        val params = signature?.parameters?.parameterDeclarationList ?: listOf()

        // 0, 1 or 2 parameters
        if (params.size > 2) {
            return false
        }

        // if 2 parameters, first must be context.Context
        if (params.size == 2 && params.first().type?.textMatches("context.Context") != true) {
            return false
        }

        val returnType = signature?.resultType
        // 0, 1, or 2 returned values. 0 is always valid so check 1 and 2
        if (returnType is GoTypeList) {
            val types = returnType.typeList
            if ((types.size > 2) || (types.size == 2 && !types[1].textMatches("error"))) {
                return false
            }
        } else if (returnType is GoType && returnType !is GoLightType.LightVoidType && !returnType.textMatches("error")) {
            return false
        }
        return true
    }
}
