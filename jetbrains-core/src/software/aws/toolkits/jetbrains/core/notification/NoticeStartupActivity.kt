// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

class NoticeStartupActivity : StartupActivity, DumbAware {
    override fun runActivity(project: Project) {
        val noticeManager =
            ServiceManager.getService(NoticeManager::class.java)

        val notices = noticeManager.getRequiredNotices(NoticeType.notices(), project)
        noticeManager.notify(notices, project)
    }
}
