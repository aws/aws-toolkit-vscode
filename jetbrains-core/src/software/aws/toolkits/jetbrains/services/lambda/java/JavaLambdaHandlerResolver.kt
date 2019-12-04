// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.lang.jvm.JvmModifier
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.ModuleUtilCore
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.JavaPsiFacade
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiIdentifier
import com.intellij.psi.PsiMethod
import com.intellij.psi.PsiModifierListOwner
import com.intellij.psi.PsiParameter
import com.intellij.psi.PsiType
import com.intellij.psi.search.GlobalSearchScope
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver

class JavaLambdaHandlerResolver : LambdaHandlerResolver {
    override fun version(): Int = 1

    override fun findPsiElements(
        project: Project,
        handler: String,
        searchScope: GlobalSearchScope
    ): Array<NavigatablePsiElement> {
        val split = handler.split("::")
        val className = split[0]
        val methodName = if (split.size >= 2) split[1] else null

        val psiFacade = JavaPsiFacade.getInstance(project)
        return DumbService.getInstance(project).computeWithAlternativeResolveEnabled<Array<NavigatablePsiElement>, Exception> {
            ApplicationManager.getApplication().runReadAction<Array<NavigatablePsiElement>> {
                val classes = psiFacade.findClasses(className, searchScope).toList()
                return@runReadAction if (methodName.isNullOrEmpty()) {
                    classes.filterIsInstance<NavigatablePsiElement>().toTypedArray()
                } else {
                    val handlerMethod = classes.asSequence()
                        .map { it.findMethodsByName(methodName, true) }
                        .flatMap { it.asSequence() }
                        .filter { it.body != null } // Filter out interfaces
                        .pickMostSpecificHandler()
                    handlerMethod?.let {
                        arrayOf(it)
                    } ?: NavigatablePsiElement.EMPTY_NAVIGATABLE_ELEMENT_ARRAY
                }
            }
        }
    }

    override fun determineHandler(element: PsiElement): String? =
        DumbService.getInstance(element.project).computeWithAlternativeResolveEnabled<String, Exception> {
            when (element) {
                is PsiClass -> findByClass(element)
                is PsiMethod -> findByMethod(element)
                is PsiIdentifier -> determineHandler(element.parent)
                else -> null
            }
        }

    override fun determineHandlers(element: PsiElement, file: VirtualFile): Set<String> =
        DumbService.getInstance(element.project).computeWithAlternativeResolveEnabled<Set<String>, Exception> {
            when (element) {
                is PsiClass -> findHandlersByClass(element, file)
                is PsiMethod -> findHandlersByMethod(element, file)
                is PsiIdentifier -> determineHandlers(element.parent, file)
                else -> emptySet()
            }
        }

    /**
     * Always show line marker for handler if it is a class which means it implements Lambda interface.
     */
    override fun shouldShowLineMarker(handler: String): Boolean = !handler.contains("::")

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

    private fun findByMethod(method: PsiMethod): String? {
        val file = method.containingFile.virtualFile ?: return null
        return findByMethod(method, file)
    }

    private fun findHandlersByMethod(method: PsiMethod, file: VirtualFile): Set<String> = findByMethod(method, file)?.let { setOf(it) }.orEmpty()

    private fun findByMethod(method: PsiMethod, file: VirtualFile): String? {
        val parentClass = method.parent as? PsiClass ?: return null
        return if (method.isValidHandler(parentClass, file)) {
            "${parentClass.qualifiedName}::${method.name}"
        } else {
            null
        }
    }

    override fun handlerDisplayName(handler: String): String = handler.substringAfterLast('.').replace("::", ".")

    private fun findByClass(clz: PsiClass): String? =
        if (clz.canBeInstantiatedByLambda() &&
            clz.containingFile.virtualFile != null &&
            clz.implementsLambdaHandlerInterface(clz.containingFile.virtualFile)) {
            clz.qualifiedName
        } else {
            null
        }

    private fun findHandlersByClass(clz: PsiClass, file: VirtualFile): Set<String> {
        if (!clz.canBeInstantiatedByLambda()) {
            return emptySet()
        }

        val handlers = mutableSetOf<String>()
        if (clz.implementsLambdaHandlerInterface(file)) {
            clz.qualifiedName?.let { handlers.add(it) }
        }

        handlers.addAll(clz.allMethods
            .asSequence()
            .filter { it.isValidHandler(clz, file) }
            .map { "${clz.qualifiedName}::${it.name}" }
            .toSet())

        return handlers
    }

    private fun PsiClass.canBeInstantiatedByLambda() = this.isPublic && this.isConcrete && this.hasPublicNoArgsConstructor()

    private val PsiModifierListOwner.isPublic get() = this.hasModifier(JvmModifier.PUBLIC)

    private val PsiModifierListOwner.isStatic get() = this.hasModifier(JvmModifier.STATIC)

    private val PsiClass.isConcrete get() = !this.isInterface && !this.hasModifier(JvmModifier.ABSTRACT)

    private fun PsiClass.hasPublicNoArgsConstructor() =
        this.constructors.isEmpty() || this.constructors.any { it.hasModifier(JvmModifier.PUBLIC) && it.parameters.isEmpty() }

    private fun PsiClass.implementsLambdaHandlerInterface(file: VirtualFile): Boolean {
        val module = ModuleUtilCore.findModuleForFile(file, this.project) ?: return false
        val scope = GlobalSearchScope.moduleRuntimeScope(module, false)
        val psiFacade = JavaPsiFacade.getInstance(module.project)

        return LAMBDA_INTERFACES.any { interfaceName ->
            psiFacade.findClass(interfaceName, scope)?.let { interfacePsi ->
                this.isInheritor(interfacePsi, true)
            } == true
        }
    }

    private fun PsiMethod.isValidHandler(parentClass: PsiClass, file: VirtualFile) = this.isPublic &&
        this.hasRequiredParameters() &&
        (!this.isStatic || this.name != "main") &&
        !this.isConstructor &&
        (this.isStatic || parentClass.canBeInstantiatedByLambda()) &&
        !(parentClass.implementsLambdaHandlerInterface(file) && this.name == HANDLER_NAME)

    private fun PsiMethod.hasRequiredParameters(): Boolean = when (this.parameters.size) {
            1 -> true
            2 -> (this.parameterList.parameters[0].isInputStreamParameter() &&
                    this.parameterList.parameters[1].isOutputStreamParameter()) ||
                    this.parameterList.parameters[1].isContextParameter()
            3 -> this.parameterList.parameters[0].isInputStreamParameter() &&
                    this.parameterList.parameters[1].isOutputStreamParameter() &&
                    this.parameterList.parameters[2].isContextParameter()
            else -> false
        }

    private fun PsiParameter.isContextParameter(): Boolean = isClass(LAMBDA_CONTEXT)
    private fun PsiParameter.isInputStreamParameter(): Boolean = isClass(INPUT_STREAM)
    private fun PsiParameter.isOutputStreamParameter(): Boolean = isClass(OUTPUT_STREAM)

    private fun PsiParameter.isClass(classFullName: String): Boolean =
        PsiType.getTypeByName(
            classFullName,
            project,
            GlobalSearchScope.projectScope(project)
        ).isAssignableFrom(this.type)

    private companion object {
        val LAMBDA_INTERFACES = setOf(
            "com.amazonaws.services.lambda.runtime.RequestStreamHandler",
            "com.amazonaws.services.lambda.runtime.RequestHandler"
        )
        const val LAMBDA_CONTEXT = "com.amazonaws.services.lambda.runtime.Context"
        const val INPUT_STREAM = "java.io.InputStream"
        const val OUTPUT_STREAM = "java.io.OutputStream"
        const val HANDLER_NAME = "handleRequest"
    }
}
