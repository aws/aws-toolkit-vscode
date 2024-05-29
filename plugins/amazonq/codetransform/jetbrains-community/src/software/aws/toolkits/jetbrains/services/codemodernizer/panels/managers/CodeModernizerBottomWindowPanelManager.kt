// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.application.invokeLater
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.serviceContainer.AlreadyDisposedException
import com.intellij.ui.border.CustomLineBorder
import com.intellij.util.ui.JBUI
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationJob
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.CodeModernizerBanner
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.CodeModernizerJobHistoryTablePanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.LoadingPanel
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow.CodeModernizerBottomToolWindowFactory
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.time.Duration
import java.time.Instant
import java.util.Timer
import java.util.TimerTask
import javax.swing.BorderFactory
import javax.swing.JPanel

class CodeModernizerBottomWindowPanelManager(private val project: Project) : JPanel(BorderLayout()) {
    private var lastShownProgressPanel: Component? = null
    val toolbar = createToolbar().apply {
        targetComponent = this@CodeModernizerBottomWindowPanelManager
        component.border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsRight(1)),
            component.border
        )
    }

    // Loading panel UI
    var fullSizeLoadingPanel = LoadingPanel(project)

    // Active panel UI
    var buildProgressSplitterPanelManager = BuildProgressSplitterPanelManager(project)
    var previousJobHistoryPanel = CodeModernizerJobHistoryTablePanel()
    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(CodeModernizerBottomToolWindowFactory.id)
    val banner = CodeModernizerBanner(project)
    var timer: Timer? = null

    init {
        reset()
    }

    private fun setUI(function: () -> Unit) {
        lastShownProgressPanel = this.components.firstOrNull { it == fullSizeLoadingPanel || it == buildProgressSplitterPanelManager } ?: lastShownProgressPanel
        removeAll()
        add(BorderLayout.WEST, toolbar.component)
        add(BorderLayout.NORTH, banner)
        function.invoke()
        updateRunTime()
        revalidate()
        repaint()
    }

    private fun updateRunTime(now: Instant? = null) {
        try {
            val sessionState = CodeModernizerSessionState.getInstance(project)
            val creationTime = sessionState.currentJobCreationTime
            val stopTime = now ?: sessionState.currentJobStopTime
            if (creationTime == Instant.MIN || stopTime == Instant.MIN) {
                banner.updateRunningTime(null)
            } else {
                banner.updateRunningTime(Duration.between(creationTime, stopTime))
            }
        } catch (e: AlreadyDisposedException) {
            LOG.warn { "Disposed when about to update the runtime" }
            return
        }
    }

    fun setJobStartingUI() = setUI {
        add(BorderLayout.CENTER, fullSizeLoadingPanel)
        banner.clearActions()
        banner.updateContent(message("codemodernizer.toolwindow.banner.job_starting"), AllIcons.General.BalloonInformation)
        fullSizeLoadingPanel.apply {
            removeAll()
            showInProgressIndicator()
            revalidate()
            repaint()
        }

        buildProgressSplitterPanelManager.reset()
    }

    fun setJobFailedToStartUI() = setUI {
        add(BorderLayout.CENTER, fullSizeLoadingPanel)
        banner.clearActions()
        banner.updateContent(message("codemodernizer.toolwindow.banner.job_failed_to_start"), AllIcons.General.Error)
        fullSizeLoadingPanel.apply {
            removeAll()
            showOnlyLabelUI()
            revalidate()
            repaint()
        }
    }

    fun setJobFailedWhileRunningUI() = setUI {
        add(BorderLayout.CENTER, buildProgressSplitterPanelManager)
        banner.updateContent(message("codemodernizer.toolwindow.banner.job_failed_while_running"), AllIcons.General.Error)
        buildProgressSplitterPanelManager.setSplitPanelStopView()
    }

    fun setJobRunningUI() = setUI {
        add(BorderLayout.CENTER, buildProgressSplitterPanelManager)
        banner.updateContent(message("codemodernizer.toolwindow.banner.job_is_running"), AllIcons.General.BalloonInformation)
        buildProgressSplitterPanelManager.apply {
            reset()
            statusTreePanel.setDefaultUI()
            loadingPanel.setDefaultUI()
            revalidate()
            repaint()
        }
    }

    fun setPreviousJobHistoryUI(shouldAddCurrentEndTime: Boolean): JPanel {
        setUI {
            add(BorderLayout.CENTER, previousJobHistoryPanel)
            updatePreviousJobHistoryUI(shouldAddCurrentEndTime)
        }
        return this
    }

    private fun updatePreviousJobHistoryUI(shouldAddCurrentEndTime: Boolean) {
        try {
            var history = CodeModernizerSessionState.getInstance(project).getJobHistory()
            if (shouldAddCurrentEndTime) {
                history =
                    history.map { it.copy(runTime = Duration.between(it.startTime, Instant.now())) }.toTypedArray()
            }
            previousJobHistoryPanel.apply {
                setDefaultUI()
                updateTableData(history)
                revalidate()
                repaint()
            }
            revalidate()
            repaint()
        } catch (e: AlreadyDisposedException) {
            LOG.warn { "Disposed when about to update previous JobHistory" }
            return
        }
    }

    fun showUnalteredJobUI() = setUI {
        if (lastShownProgressPanel != null) {
            add(BorderLayout.CENTER, lastShownProgressPanel)
        } else {
            add(BorderLayout.CENTER, fullSizeLoadingPanel)
            fullSizeLoadingPanel.progressIndicatorLabel.text = "No jobs active"
            fullSizeLoadingPanel.apply {
                removeAll()
                showOnlyLabelUI()
                revalidate()
                repaint()
            }
        }
    }

    fun setJobFinishedUI(result: CodeModernizerJobCompletedResult) = setUI {
        stopTimer()
        buildProgressSplitterPanelManager.apply {
            when (result) {
                is CodeModernizerJobCompletedResult.UnableToCreateJob,
                is CodeModernizerJobCompletedResult.ZipUploadFailed,
                is CodeModernizerJobCompletedResult.JobAbortedZipTooLarge,
                is CodeModernizerJobCompletedResult.JobAbortedMissingDependencies -> setJobFailedToStartUI()

                is CodeModernizerJobCompletedResult.RetryableFailure,
                is CodeModernizerJobCompletedResult.JobFailedInitialBuild,
                is CodeModernizerJobCompletedResult.JobFailed -> setJobFailedWhileRunningUI()

                is CodeModernizerJobCompletedResult.JobPartiallySucceeded,
                is CodeModernizerJobCompletedResult.JobCompletedSuccessfully -> setJobCompletedSuccessfullyUI()

                is CodeModernizerJobCompletedResult.ManagerDisposed -> return@setUI

                is CodeModernizerJobCompletedResult.JobPaused,
                is CodeModernizerJobCompletedResult.Stopped,
                is CodeModernizerJobCompletedResult.JobAbortedBeforeStarting -> userInitiatedStopCodeModernizationUI()
            }
        }
    }

    private fun setJobCompletedSuccessfullyUI() {
        add(BorderLayout.CENTER, buildProgressSplitterPanelManager)
        buildProgressSplitterPanelManager.apply {
            addViewDiffToBanner()
            addViewSummaryToBanner()
            banner.updateContent(message("codemodernizer.toolwindow.banner.run_scan_complete"), AllIcons.Actions.Commit)
            setSplitPanelStopView()
            revalidate()
            repaint()
        }
    }

    fun setProjectInvalidUI(reason: String) = setUI {
        banner.updateContent(reason, AllIcons.General.Error)
        fullSizeLoadingPanel.apply {
            fullSizeLoadingPanel.showFailureUI()
            revalidate()
            repaint()
        }
    }

    fun userInitiatedStopCodeModernizationUI() = setUI {
        stopTimer()
        add(BorderLayout.CENTER, buildProgressSplitterPanelManager)
        buildProgressSplitterPanelManager.setSplitPanelStopView()
        banner.updateContent(message("codemodernizer.toolwindow.banner.job_is_stopped"), AllIcons.General.Error)
    }

    fun createToolbar(): ActionToolbar {
        val actionManager = ActionManager.getInstance()
        val group = actionManager.getAction("aws.toolkit.codemodernizer.toolbar") as ActionGroup
        return actionManager.createActionToolbar(ACTION_PLACE, group, false)
    }

    fun handleJobTransition(new: TransformationStatus, plan: TransformationPlan?, sourceJavaVersion: JavaSdkVersion) = invokeLater {
        if (new in listOf(
                TransformationStatus.PLANNED,
                TransformationStatus.TRANSFORMING,
                TransformationStatus.TRANSFORMED,
                TransformationStatus.PAUSED,
                TransformationStatus.COMPLETED,
                TransformationStatus.PARTIALLY_COMPLETED
            )
        ) {
            addPlanToBanner()
        }
        buildProgressSplitterPanelManager.apply {
            handleProgressStateChanged(new, plan, sourceJavaVersion)
            if (timer == null) {
                timer = Timer()
                timer?.scheduleAtFixedRate(
                    object : TimerTask() {
                        override fun run() = try {
                            val currentJobCreationTime = CodeModernizerSessionState.getInstance(project).currentJobCreationTime
                            if (currentJobCreationTime == Instant.MIN) {
                                stopTimer()
                            }
                            updateRunTime(Instant.now())
                            revalidate()
                            repaint()
                        } catch (_: AlreadyDisposedException) {
                            stopTimer()
                        }
                    },
                    0,
                    1000
                )
            }
        }
        updatePreviousJobHistoryUI(true)
    }

    fun addPlanToBanner() = banner.updateActions(banner.showPlanAction)

    fun addViewDiffToBanner() = banner.updateActions(banner.showDiffAction)

    fun addViewSummaryToBanner() = banner.updateActions(banner.showSummaryAction)

    private fun stopTimer() {
        if (timer != null) {
            timer?.cancel()
            timer?.purge()
            timer = null
        }
    }

    fun reset() {
        stopTimer()
        setUI {
            banner.clearActions()
            banner.updateContent(message("codemodernizer.toolwindow.banner.no_ongoing_job"))
            buildProgressSplitterPanelManager.reset()
            setPreviousJobHistoryUI(false)
        }
    }

    fun setResumeJobUI(currentJobResult: TransformationJob, plan: TransformationPlan?, sourceJavaVersion: JavaSdkVersion) {
        setJobRunningUI()
        buildProgressSplitterPanelManager.apply {
            reset()
            handleProgressStateChanged(currentJobResult.status(), plan, sourceJavaVersion)
        }
    }

    companion object {
        private val LOG = getLogger<CodeModernizerBottomWindowPanelManager>()
        fun getInstance(project: Project): CodeModernizerBottomWindowPanelManager = project.service()
        const val ACTION_PLACE = "CodeModernizerBottomWindowPanel"
    }
}
