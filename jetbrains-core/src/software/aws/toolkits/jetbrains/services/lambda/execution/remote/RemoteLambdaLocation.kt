// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.Location
import com.intellij.lang.ASTNode
import com.intellij.lang.Language
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.impl.PsiElementBase
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.lambda.execution.remote.RemoteLambdaLocation.PsiLambda

/**
 * Custom [Location] to represent the Lambda elements in the explorer so the Remote rune configurations work. A fake
 * PSI element is also used since no valid PSI can exist to represent a remote Lambda
 */
class RemoteLambdaLocation(private val project: Project, val lambdaFunction: LambdaFunction) : Location<PsiLambda>() {
    private val element = PsiLambda(project)

    override fun getProject(): Project = project

    override fun getModule(): Module? = null

    override fun <T : PsiElement?> getAncestors(
        ancestorClass: Class<T>?,
        strict: Boolean
    ): MutableIterator<Location<T>> = mutableListOf<Location<T>>().iterator()

    override fun getPsiElement(): PsiLambda = element

    class PsiLambda(private val project: Project) : PsiElementBase() {
        override fun getProject(): Project = project

        override fun getContainingFile(): PsiFile? = null

        override fun getText(): String = throw UnsupportedOperationException()

        override fun getStartOffsetInParent(): Int = throw UnsupportedOperationException()

        override fun getLanguage(): Language = Language.ANY

        override fun isValid(): Boolean = true

        override fun getTextRange(): TextRange = throw UnsupportedOperationException()

        override fun findElementAt(offset: Int): PsiElement? = throw UnsupportedOperationException()

        override fun getTextLength(): Int = throw UnsupportedOperationException()

        override fun getTextOffset(): Int = throw UnsupportedOperationException()

        override fun textToCharArray(): CharArray = throw UnsupportedOperationException()

        override fun getNode(): ASTNode? = null

        override fun getParent(): PsiElement? = null

        override fun getChildren(): Array<PsiElement> = PsiElement.EMPTY_ARRAY
    }
}
