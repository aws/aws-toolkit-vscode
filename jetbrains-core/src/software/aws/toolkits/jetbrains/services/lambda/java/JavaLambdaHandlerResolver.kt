// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.execution.JavaExecutionUtil
import com.intellij.lang.jvm.JvmModifier
import com.intellij.openapi.project.Project
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiIdentifier
import com.intellij.psi.PsiImportList
import com.intellij.psi.PsiImportStatement
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifierListOwner
import com.intellij.psi.PsiParameter
import com.intellij.psi.impl.source.PsiClassReferenceType
import com.intellij.psi.search.GlobalSearchScope
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class JavaLambdaHandlerResolver : LambdaHandlerResolver {
    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val split = handler.split("::")
        val className = split[0]
        val methodName = if (split.size >= 2) split[1] else null

        val psiFacade = JavaPsiFacade.getInstance(project)
        val classes = psiFacade.findClasses(className, searchScope).toList()
        return if (methodName.isNullOrEmpty()) {
            classes.filterIsInstance<NavigatablePsiElement>()
                .toTypedArray()
        } else {
            val handlerMethod = classes.asSequence()
                .map { it.findMethodsByName(methodName, true) }
                .flatMap { it.asSequence() }
                .filter { it.body != null } // Filter out interfaces
                .pickMostSpecificHandler()
            return handlerMethod?.let {
                arrayOf(it)
            } ?: NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
        }
    }

    /**
     * https://docs.aws.amazon.com/lambda/latest/dg/java-programming-model-handler-types.html
     * Handler Overload Resolution
     *
     * If your Java code contains multiple methods with same name as the handler name, then AWS Lambda uses the following rules to pick a method to invoke:
     *
     * 1. Select the method with the largest number of parameters.
     *
     * 2. If two or more methods have the same number of parameters, AWS Lambda selects the method that has the Context as the last parameter.
     *
     * If none or all of these methods have the Context parameter, then the behavior is undefined.
     */
    private fun Sequence<PsiMethod>.pickMostSpecificHandler(): NavigatablePsiElement? {
        var maxWeight = -1
        val methods = this.filter { it.parameterList.parametersCount in 1..3 }
            .groupBy {
                var weight = it.parameterList.parametersCount
                if (it.parameterList.parameters.getOrNull(weight - 1)?.isContextParameter() == true) {
                    weight++
                }
                maxWeight = maxOf(maxWeight, weight)
                weight
            }.getOrDefault(maxWeight, emptyList())

        // Empty, or undefined behavior
        if (methods.isEmpty() || methods.size > 1) {
            return null
        }

        return methods[0]
    }

    override fun determineHandler(element: PsiElement): String? {
        return when (element) {
            is PsiClass -> findByClass(element)
            is PsiMethod -> findByMethod(element)
            is PsiIdentifier -> determineHandler(element.parent)
            else -> null
        }
    }

    override fun handlerDisplayName(handler: String): String = handler.substringAfterLast('.').replace("::", ".")

    private fun findByMethod(method: PsiMethod): String? {
        val parentClass = method.parent as? PsiClass ?: return null
        if (method.isPublic &&
            (method.isStatic ||
                    (parentClass.canBeInstantiatedByLambda() && !parentClass.implementsLambdaHandlerInterface())) &&
            method.hasRequiredParameters()
        ) {
            return "${parentClass.qualifiedName}::${method.name}"
        }
        return null
    }

    private fun findByClass(clz: PsiClass): String? =
        if (clz.canBeInstantiatedByLambda() && clz.implementsLambdaHandlerInterface()) {
            clz.qualifiedName
        } else {
            null
        }

    private fun PsiClass.canBeInstantiatedByLambda() =
        this.isPublic && this.isConcrete && this.hasPublicNoArgsConstructor()

    private val PsiModifierListOwner.isPublic get() = this.hasModifier(JvmModifier.PUBLIC)

    private val PsiModifierListOwner.isStatic get() = this.hasModifier(JvmModifier.STATIC)

    private val PsiClass.isConcrete get() = !this.isInterface && !this.hasModifier(JvmModifier.ABSTRACT)

    private fun PsiClass.hasPublicNoArgsConstructor() =
        this.constructors.isEmpty() || this.constructors.any { it.hasModifier(JvmModifier.PUBLIC) && it.parameters.isEmpty() }

    private fun PsiClass.implementsLambdaHandlerInterface(): Boolean {
        val module = JavaExecutionUtil.findModule(this) ?: return false
        val scope = GlobalSearchScope.moduleRuntimeScope(module, false)
        val psiFacade = JavaPsiFacade.getInstance(module.project)

        return LAMBDA_INTERFACES.any { interfaceName ->
            psiFacade.findClass(interfaceName, scope)?.let { interfacePsi ->
                this.isInheritor(interfacePsi, true)
            } == true
        }
    }

    private fun PsiMethod.hasRequiredParameters(): Boolean =
        this.parameters.size in 1..2 && this.parameterList.parameters.getOrNull(1)?.isContextParameter() ?: true

    private fun PsiParameter.isContextParameter(): Boolean {
        val className = (this.type as? PsiClassReferenceType)?.className ?: return false
        val imports = containingFile.children.filterIsInstance<PsiImportList>()
            .flatMap { it.children.filterIsInstance<PsiImportStatement>() }
            .asSequence()
            .mapNotNull { it.qualifiedName }
            .map { it.substringAfterLast(".") to it }
            .toMap()
        return imports[className] == LAMBDA_CONTEXT
    }

    private companion object {
        val LAMBDA_INTERFACES = setOf(
            "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
            "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
        const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"
    }
}