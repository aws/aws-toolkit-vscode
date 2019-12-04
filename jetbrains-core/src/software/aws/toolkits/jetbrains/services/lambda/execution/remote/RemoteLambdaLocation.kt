// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.Location
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.core.DummyPsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction

/**
 * Custom [Location] to represent the Lambda elements in the explorer so the Remote rune configurations work. A fake
 * PSI element is also used since no valid PSI can exist to represent a remote Lambda
 */
class RemoteLambdaLocation(private val project: Project, val lambdaFunction: LambdaFunction) : Location<DummyPsiElement>() {
    private val element = DummyPsiElement(project)

    override fun getProject(): Project = project

    override fun getModule(): Module? = null

    override fun <T : PsiElement?> getAncestors(
        ancestorClass: Class<T>?,
        strict: Boolean
    ): MutableIterator<Location<T>> = mutableListOf<Location<T>>().iterator()

    override fun getPsiElement(): DummyPsiElement = element
}
