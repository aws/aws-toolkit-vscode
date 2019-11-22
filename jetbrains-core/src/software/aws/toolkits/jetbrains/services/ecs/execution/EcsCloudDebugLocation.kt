// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.execution.Location
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.ecs.model.Service
import software.aws.toolkits.jetbrains.core.DummyPsiElement

class EcsCloudDebugLocation(private val project: Project, val service: Service) : Location<DummyPsiElement>() {
    private val element = DummyPsiElement(project)

    override fun getProject(): Project = project

    override fun getModule(): Module? = null

    override fun <T : PsiElement?> getAncestors(
        ancestorClass: Class<T>?,
        strict: Boolean
    ): MutableIterator<Location<T>> = mutableListOf<Location<T>>().iterator()

    override fun getPsiElement(): DummyPsiElement = element
}
