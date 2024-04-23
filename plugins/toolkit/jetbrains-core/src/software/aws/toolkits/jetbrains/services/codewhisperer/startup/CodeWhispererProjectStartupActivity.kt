// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.startup

import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererExpired
import software.aws.toolkits.jetbrains.services.codewhisperer.importadder.CodeWhispererImportAdderListener
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager.Companion.CODEWHISPERER_USER_ACTION_PERFORMED
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererFeatureConfigService
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FEATURE_CONFIG_POLL_INTERVAL_IN_MS
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.promptReAuth
import software.aws.toolkits.jetbrains.services.codewhisperer.util.calculateIfIamIdentityCenterConnection
import software.aws.toolkits.jetbrains.utils.isRunningOnCWNotSupportedRemoteBackend
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message

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

        // ---- Everything below will be triggered only when CW is enabled, everything above will be triggered once per project ----

        if (runOnce) return

        checkRemoteDevVersionAndPromptUpdate()

        // Reconnect CodeWhisperer on startup
        promptReAuth(project, isPluginStarting = true)
        if (isCodeWhispererExpired(project)) return

        // Init featureConfig job
        initFeatureConfigPollingJob(project)

        calculateIfIamIdentityCenterConnection(project) {
            ApplicationManager.getApplication().executeOnPooledThread {
                CodeWhispererModelConfigurator.getInstance().listCustomizations(project, passive = true)
            }
        }

        // install intellsense autotrigger listener, this only need to be executed once
        project.messageBus.connect().subscribe(LookupManagerListener.TOPIC, CodeWhispererIntelliSenseAutoTriggerListener)
        project.messageBus.connect().subscribe(CODEWHISPERER_USER_ACTION_PERFORMED, CodeWhispererImportAdderListener)

        runOnce = true
    }

    // Start a job that runs every 30 mins
    private fun initFeatureConfigPollingJob(project: Project) {
        projectCoroutineScope(project).launch {
            while (isActive) {
                CodeWhispererFeatureConfigService.getInstance().fetchFeatureConfigs(project)
                delay(FEATURE_CONFIG_POLL_INTERVAL_IN_MS)
            }
        }
    }

    private fun checkRemoteDevVersionAndPromptUpdate() {
        if (!isRunningOnCWNotSupportedRemoteBackend()) return
        notifyWarn(
            title = message("codewhisperer.notification.remote.ide_unsupported.title"),
            content = message("codewhisperer.notification.remote.ide_unsupported.message"),
        )
    }
}
