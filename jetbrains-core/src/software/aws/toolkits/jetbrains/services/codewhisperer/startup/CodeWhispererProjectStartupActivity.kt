// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyErrorAccountless
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyWarnAccountless
import java.util.Date
import java.util.Timer
import kotlin.concurrent.schedule

// TODO: add logics to check if we want to remove recommendation suspension date when user open the IDE
class CodeWhispererProjectStartupActivity : StartupActivity.DumbAware {
    private var runOnce = false

    /**
     * Should be invoked when
     * (1) new users accept CodeWhisperer ToS (have to be triggered manually))
     * (2) existing users open the IDE (automatically triggered)
     */
    override fun runActivity(project: Project) {
        if (!isCodeWhispererEnabled(project)) return
        if (runOnce) return

        // install intellsense autotrigger listener, this only need to be executed 1 time
        project.messageBus.connect().subscribe(LookupManagerListener.TOPIC, CodeWhispererIntlliSenseAutoTriggerListener)

        // show notification to accountless users
        showAccountlessNotificationIfNeeded(project)
        runOnce = true
    }

    private fun showAccountlessNotificationIfNeeded(project: Project) {
        if (CodeWhispererExplorerActionManager.getInstance().checkActiveCodeWhispererConnectionType(project) == CodeWhispererLoginType.Accountless) {
            // simply show a notification when user login with Accountless, and it's still supported by CodeWhisperer
            if (!isExpired()) {
                notifyWarnAccountless()

                // to handle the case when user open the IDE when Accountless not yet expired but expire soon e.g. 30min etc.
                Timer().schedule(CodeWhispererConstants.EXPIRE_DATE) { notifyErrorAndDisableAccountless(project) }
            } else {
                notifyErrorAndDisableAccountless(project)
            }
        }
    }

    private fun notifyErrorAndDisableAccountless(project: Project) {
        // show an error and deactivate CW when user login with Accountless, and it already expired
        notifyErrorAccountless()
        CodeWhispererExplorerActionManager.getInstance().nullifyAccountlessCredentialIfNeeded()
        invokeLater { project.refreshDevToolTree() }
    }
}

// TODO: do we have time zone issue with Date?
private fun isExpired() = CodeWhispererConstants.EXPIRE_DATE.before(Date())
