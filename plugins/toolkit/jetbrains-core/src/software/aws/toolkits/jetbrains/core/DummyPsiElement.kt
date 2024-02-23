// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.lang.Language
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiManager
import com.intellij.psi.impl.light.LightElement

class DummyPsiElement(project: Project) : LightElement(PsiManager.getInstance(project), Language.ANY) {
    override fun toString(): String = "DummyPsiElement"
}
