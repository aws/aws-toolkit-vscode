// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.actions

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import org.jetbrains.annotations.NotNull
import javax.swing.Icon

class OpenBrowserAction(title: String, icon: Icon? = null, private val url: String) : AnAction(title, null, icon), DumbAware {
    override fun actionPerformed(@NotNull e: AnActionEvent) {
        try {
            BrowserUtil.browse(url)
        } catch (_: Exception) {
            // ignore
        }
    }
}
