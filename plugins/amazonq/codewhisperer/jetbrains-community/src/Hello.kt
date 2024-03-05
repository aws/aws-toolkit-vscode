// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.ui.MessageDialogBuilder
import software.aws.toolkits.resources.AmazonQBundle

class Hello : AnAction(AmazonQBundle.message("q.hello")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        MessageDialogBuilder.okCancel("title", AmazonQBundle.message("q.hello"))
            .ask(e.project)
    }
}
