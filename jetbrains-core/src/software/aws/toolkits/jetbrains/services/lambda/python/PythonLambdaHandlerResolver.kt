// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.Project
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.search.GlobalSearchScope
import com.intellij.psi.util.QualifiedName
import com.jetbrains.python.PyTokenTypes
import com.jetbrains.python.psi.PyFile
import com.jetbrains.python.psi.PyFunction
import com.jetbrains.python.psi.PyPsiFacade
import com.jetbrains.python.psi.resolve.fromModule
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class PythonLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val psiFacade = PyPsiFacade.getInstance(project)
        val lambdaModule = handler.substringBeforeLast(".")
        val function = handler.substringAfterLast(".")
        return ModuleManager.getInstance(project).modules.flatMap { module ->
            psiFacade.resolveQualifiedName(
                QualifiedName.fromDottedString(lambdaModule),
                fromModule(module)
            )
                .filterIsInstance<PyFile>()
                .flatMap { pyFile ->
                    pyFile.children.filterIsInstance<NavigatablePsiElement>()
                        .filter { psiFunction -> psiFunction.name == function }
                }
        }.toTypedArray()
    }

    override fun determineHandler(element: PsiElement): String? {
        if (element.node?.elementType != PyTokenTypes.IDENTIFIER) {
            return null
        }
        val function = element.parent as? PyFunction ?: return null
        if (function.parent is PyFile && function.parameterList.parameters?.size == 2) {
            return function.qualifiedName
        }
        return null
    }
}