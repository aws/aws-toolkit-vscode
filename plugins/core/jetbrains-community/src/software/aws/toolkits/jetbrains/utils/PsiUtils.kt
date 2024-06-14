// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.injected.editor.VirtualFileWindow
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.psi.PsiElement

fun PsiElement.isTestOrInjectedText(): Boolean {
    val project = this.project
    val virtualFile = this.containingFile.virtualFile ?: return false
    if (this.isInjectedText() || ProjectRootManager.getInstance(project).fileIndex.isInTestSourceContent(virtualFile)) {
        return true
    }

    return false
}

fun PsiElement.isInjectedText(): Boolean {
    val virtualFile = this.containingFile.virtualFile ?: return false
    if (virtualFile is VirtualFileWindow) {
        return true
    }

    return false
}
