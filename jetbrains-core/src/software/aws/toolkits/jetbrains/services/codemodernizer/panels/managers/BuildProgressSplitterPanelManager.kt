// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers

import com.intellij.openapi.project.Project
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.ui.OnePixelSplitter
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStep
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStepStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildProgressStepTreeItem
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildStepStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerException
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ProgressStepId
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.BuildProgressStepDetailsPanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.BuildProgressTreePanel
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.LoadingPanel
import software.aws.toolkits.resources.message
import java.text.SimpleDateFormat
import java.time.Duration
import java.time.Instant
import java.util.Date
import javax.swing.event.TreeSelectionEvent
import javax.swing.event.TreeSelectionListener
import javax.swing.tree.DefaultMutableTreeNode
import kotlin.math.min
import kotlin.time.Duration.Companion.seconds
import kotlin.time.toKotlinDuration

class BuildProgressSplitterPanelManager(private val project: Project) :
    OnePixelSplitter(MODERNIZER_SPLITTER_PROPORTION_KEY, 1.0f) {

    // Active panel UI
    var statusTreePanel = BuildProgressTreePanel()
    var loadingPanel = LoadingPanel(project)
    var buildProgressStepDetailsPanel = BuildProgressStepDetailsPanel()
    val treeSelectionListener = TreeSelectionListener { e: TreeSelectionEvent? ->
        if (statusTreePanel.tree.getLastSelectedPathComponent() != null) {
            val selectedNode = statusTreePanel.tree.getLastSelectedPathComponent() as DefaultMutableTreeNode
            val userObject = selectedNode.userObject
            if (userObject is BuildProgressStepTreeItem) {
                if (isValidStepClick(userObject.id) && userObject.transformationStepId != null) {
                    System.out.println("Is valid stepID")
                    buildProgressStepDetailsPanel.updateListData(userObject.transformationStepId)
                    revalidate()
                    repaint()
                } else {
                    System.out.println("Is NOT valid stepID")
                }
            }
        }
    }
    private val formatter = SimpleDateFormat("MM/dd/yy, HH:mm")
    private var currentBuildingTransformationStep = 1
    private var newBuildingTransformationStep = 1

    init {
        this.autoscrolls = true
        reset()
    }

    fun reset() {
        statusTreePanel = BuildProgressTreePanel()
        statusTreePanel.setUpTreeData(defaultProgressData())
        loadingPanel.reset()
        this.proportion = .5f
        this.firstComponent = statusTreePanel
        this.secondComponent = loadingPanel
    }

    fun setSplitPanelStopView() {
        // If the second component is the loadingPanel, then users
        // have not yet received a modernization plan. We
        // should remove the loading panel and show the left
        // hand panel only
        if (secondComponent == loadingPanel) {
            secondComponent = null
            this.proportion = 1f
        }
        revalidate()
        repaint()
    }

    fun defaultProgressData() = listOf(
        BuildProgressStepTreeItem(message("codemodernizer.toolwindow.progress.waiting"), BuildStepStatus.WORKING, ProgressStepId.ACCEPTED),
    )

    fun setProgressStepsDefaultUI() {
        this.secondComponent = buildProgressStepDetailsPanel
        buildProgressStepDetailsPanel.setDefaultUI()
        // Add tree event listener to render data in the right hand panel
        statusTreePanel.tree.removeTreeSelectionListener(treeSelectionListener)
        statusTreePanel.tree.addTreeSelectionListener(treeSelectionListener)
    }

    /**
     * Searches through the list and updates the step matching the [id] with the [status].
     * Also steps with a lower precedence [ProgressStepId.order] will be updated.
     * Note, if the list size starts growing past a few entries, consider rewriting this as a map.
     * Note, this only works as the transitions are fully linear as of now.
     */
    fun List<BuildProgressStepTreeItem>.update(status: BuildStepStatus, id: ProgressStepId) = this.map {
        if (it.id.order <= id.order) {
            it.copy(status = status)
        } else {
            // when transformation is finished but some plan steps have not updated their status
            if (it.id == ProgressStepId.PLAN_STEP && it.status == BuildStepStatus.WORKING && id == ProgressStepId.TRANSFORMING) {
                it.copy(status = status)
            } else {
                it
            }
        }
    }

    fun handleProgressStateChanged(newState: TransformationStatus, transformationPlan: TransformationPlan?, jdkVersion: JavaSdkVersion) {
        val currentState = statusTreePanel.getCurrentElements()
        val loadingPanelText: String
        // show the details panel when there are progress updates
        // otherwise it would show an empty panel
        val backendProgressStepsAvailable = (
            transformationPlan != null &&
                transformationPlan.hasTransformationSteps() &&
                haveProgressUpdates(transformationPlan)
            )

        fun maybeAdd(stepId: ProgressStepId, string: String) {
            if (currentState.none { it.id == stepId }) {
                currentState.add(BuildProgressStepTreeItem(string, BuildStepStatus.WORKING, stepId))
            }
        }

        if (newState in setOf(
                TransformationStatus.STARTED,
                TransformationStatus.PREPARING,
            )
        ) {
            maybeAdd(ProgressStepId.ACCEPTED, message("codemodernizer.toolwindow.progress.waiting"))
            maybeAdd(ProgressStepId.BUILDING, message("codemodernizer.toolwindow.progress.building"))
        }
        if (newState in setOf(
                TransformationStatus.PREPARED,
                TransformationStatus.PLANNING,
            )
        ) {
            maybeAdd(ProgressStepId.ACCEPTED, message("codemodernizer.toolwindow.progress.waiting"))
            maybeAdd(ProgressStepId.BUILDING, message("codemodernizer.toolwindow.progress.building"))
            maybeAdd(ProgressStepId.PLANNING, message("codemodernizer.toolwindow.progress.planning"))
        }
        if (newState in setOf(
                TransformationStatus.PLANNED,
                TransformationStatus.TRANSFORMING,
            )
        ) {
            maybeAdd(ProgressStepId.ACCEPTED, message("codemodernizer.toolwindow.progress.waiting"))
            maybeAdd(ProgressStepId.BUILDING, message("codemodernizer.toolwindow.progress.building"))
            maybeAdd(ProgressStepId.PLANNING, message("codemodernizer.toolwindow.progress.planning"))
            maybeAdd(ProgressStepId.TRANSFORMING, message("codemodernizer.toolwindow.progress.transforming"))
        }

        if (newState in setOf(
                TransformationStatus.COMPLETED,
                TransformationStatus.PARTIALLY_COMPLETED,
            )
        ) {
            maybeAdd(ProgressStepId.ACCEPTED, message("codemodernizer.toolwindow.progress.waiting"))
            maybeAdd(ProgressStepId.BUILDING, message("codemodernizer.toolwindow.progress.building"))
            maybeAdd(ProgressStepId.PLANNING, message("codemodernizer.toolwindow.progress.planning"))
            maybeAdd(ProgressStepId.TRANSFORMING, message("codemodernizer.toolwindow.progress.transforming"))
        }

        // Figure out if we should add plan steps
        val statuses: List<BuildProgressStepTreeItem> = if (currentState.isEmpty()) {
            defaultProgressData().toList()
        } else {
            if (backendProgressStepsAvailable && transformationPlan != null) {
                currentBuildingTransformationStep = newBuildingTransformationStep
                newBuildingTransformationStep = transformationPlan.transformationSteps().size
                val transformationPlanSteps = transformationPlan.transformationSteps()?.map {
                    getUpdatedBuildProgressStepTreeItem(it)
                }
                transformationPlanSteps?.sortedBy { it.transformationStepId }
                val transformationPlanStepsMayAdded = maybeAddTransformationPlanSteps(transformationPlanSteps)
                currentState.removeAll { it.id == ProgressStepId.PLAN_STEP }
                if (transformationPlanStepsMayAdded.isNullOrEmpty()) {
                    currentState
                } else {
                    currentState + transformationPlanStepsMayAdded
                }
            } else {
                currentState
            }
        }
        val updatedStatuses = when (newState) {
            TransformationStatus.CREATED, TransformationStatus.ACCEPTED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.accepted")
                statuses.update(BuildStepStatus.WORKING, ProgressStepId.ACCEPTED)
            }

            TransformationStatus.STARTED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.accepted")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.ACCEPTED)
            }

            TransformationStatus.PREPARING -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.building", jdkVersion.description)
                statuses.update(BuildStepStatus.DONE, ProgressStepId.ACCEPTED)
            }

            TransformationStatus.PREPARED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.building", jdkVersion.description)
                statuses.update(BuildStepStatus.DONE, ProgressStepId.BUILDING)
            }

            TransformationStatus.PLANNING -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.planning")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.BUILDING)
            }

            TransformationStatus.PLANNED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.planning")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.PLANNING)
            }

            TransformationStatus.TRANSFORMING -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.transforming")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.PLANNING)
            }

            TransformationStatus.TRANSFORMED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.transforming")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.TRANSFORMING)
            }

            TransformationStatus.COMPLETED, TransformationStatus.PARTIALLY_COMPLETED -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.transforming")
                statuses.update(BuildStepStatus.DONE, ProgressStepId.TRANSFORMING)
            }

            TransformationStatus.STOPPING -> {
                loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.stopping")
                statuses
            } // noop

            TransformationStatus.UNKNOWN_TO_SDK_VERSION -> {
                throw CodeModernizerException(message("codemodernizer.notification.warn.unknown_status_response"))
            }

            else -> {
                if (newState == TransformationStatus.STOPPED) {
                    loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.stopping")
                } else {
                    loadingPanelText = message("codemodernizer.toolwindow.scan_in_progress.failed")
                }
                statuses.map {
                    if (it.status == BuildStepStatus.WORKING) {
                        it.copy(status = BuildStepStatus.ERROR)
                    } else {
                        it
                    }
                }
            }
        }
        statusTreePanel.renderTree(updatedStatuses)
        if (backendProgressStepsAvailable) {
            if (this.secondComponent == loadingPanel) {
                this.remove(loadingPanel)
                setProgressStepsDefaultUI()
            }
            if (transformationPlan != null) {
                buildProgressStepDetailsPanel.setTransformationPlan(transformationPlan)
                // automatically jump to the next step's right details' panel only when the current step is finished and next step starts
                if (newBuildingTransformationStep == 1 || currentBuildingTransformationStep != newBuildingTransformationStep) {
                    buildProgressStepDetailsPanel.updateListData(newBuildingTransformationStep)
                }
            }
            repaint()
            revalidate()
        } else if (newState == TransformationStatus.STOPPED) {
            setSplitPanelStopView()
            revalidate()
            repaint()
        } else {
            loadingPanel.updateProgressIndicatorText(loadingPanelText)
        }
    }

    private fun maybeAddTransformationPlanSteps(transformationPlanSteps: List<BuildProgressStepTreeItem>?): List<BuildProgressStepTreeItem>? {
        if (transformationPlanSteps.isNullOrEmpty()) {
            return transformationPlanSteps
        }
        val transformationPlanStepsMayAdded = mutableListOf<BuildProgressStepTreeItem>()
        for (step in transformationPlanSteps) {
            transformationPlanStepsMayAdded.add(step)
            if (step.status == BuildStepStatus.WORKING) {
                // only add the first WORKING step
                break
            }
        }
        return transformationPlanStepsMayAdded
    }

    private fun getUpdatedBuildProgressStepTreeItem(step: TransformationStep): BuildProgressStepTreeItem {
        val startTime = step.startTime()
        val finishedTime = step.endTime()
        val stepId = step.id().toInt()
        val (runtime, endTime) = getTransformationStepTimestamp(startTime, finishedTime)
        val buildStepStatus: BuildStepStatus
        if (step.status() == TransformationStepStatus.CREATED) {
            newBuildingTransformationStep = min(newBuildingTransformationStep, stepId)
            buildStepStatus = BuildStepStatus.WORKING
        } else if (step.status() == TransformationStepStatus.FAILED || step.status() == TransformationStepStatus.UNKNOWN_TO_SDK_VERSION) {
            buildStepStatus = BuildStepStatus.WARNING
        } else {
            buildStepStatus = BuildStepStatus.DONE
        }
        return BuildProgressStepTreeItem(step.name(), buildStepStatus, ProgressStepId.PLAN_STEP, runtime, endTime, step.id().toInt())
    }

    private fun getTransformationStepTimestamp(startTime: Instant?, endTime: Instant?): Pair<String?, String?> {
        if (startTime == null || endTime == null) {
            return null to null
        }
        return Duration.between(startTime, endTime)
            .toKotlinDuration().inWholeSeconds.seconds.toString() to formatter.format(Date.from(endTime))
    }

    private fun haveProgressUpdates(plan: TransformationPlan): Boolean = plan.transformationSteps().any { it.progressUpdates().size > 0 }

    private fun isValidStepClick(stepId: ProgressStepId): Boolean = when (stepId) {
        ProgressStepId.PLAN_STEP -> true
        ProgressStepId.ACCEPTED -> false
        ProgressStepId.BUILDING -> false
        ProgressStepId.PLANNING -> false
        ProgressStepId.TRANSFORMING -> false
        ProgressStepId.ROOT_STEP -> false
    }

    private companion object {
        const val MODERNIZER_SPLITTER_PROPORTION_KEY = "MODERNIZER_SPLITTER_PROPORTION"
    }
}
