// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.icons.AllIcons
import com.intellij.notification.NotificationAction
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.RoamingType
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.ToolWindowManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationJob
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.explorer.refreshCwQTree
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.ActiveConnectionType
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.BearerTokenFeatureSet
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.checkBearerConnectionValidity
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerException
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerStartJobResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.InvalidTelemetryReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MAVEN_CONFIGURATION_FILE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ValidationResult
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerState
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeTransformTelemetryState
import software.aws.toolkits.jetbrains.services.codemodernizer.state.StateFlags
import software.aws.toolkits.jetbrains.services.codemodernizer.state.buildState
import software.aws.toolkits.jetbrains.services.codemodernizer.state.getLatestJobId
import software.aws.toolkits.jetbrains.services.codemodernizer.state.toSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow.CodeModernizerBottomToolWindowFactory
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.BuildErrorDialog
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.PreCodeTransformUserDialog
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.ValidationErrorDialog
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.notifyStickyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformCancelSrcComponents
import software.aws.toolkits.telemetry.CodeTransformJavaSourceVersionsAllowed
import software.aws.toolkits.telemetry.CodeTransformJavaTargetVersionsAllowed
import software.aws.toolkits.telemetry.CodeTransformPreValidationError
import software.aws.toolkits.telemetry.CodeTransformStartSrcComponents
import software.aws.toolkits.telemetry.CodetransformTelemetry
import software.aws.toolkits.telemetry.Result
import java.io.File
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import javax.swing.Icon

@State(name = "codemodernizerStates", storages = [Storage("aws.xml", roamingType = RoamingType.PER_OS)])
class CodeModernizerManager(private val project: Project) : PersistentStateComponent<CodeModernizerState>, Disposable {
    private var managerState = CodeModernizerState()
    val codeModernizerBottomWindowPanelManager by lazy { CodeModernizerBottomWindowPanelManager(project) }
    private val codeModernizerBottomWindowPanelContent by lazy {
        val contentManager = getBottomToolWindow().contentManager
        contentManager.removeAllContents(true)
        contentManager.factory.createContent(
            codeModernizerBottomWindowPanelManager,
            message("codemodernizer.toolwindow.scan_display"),
            false,
        ).also {
            Disposer.register(contentManager, it)
        }
    }
    private val supportedBuildFileNames = listOf(MAVEN_CONFIGURATION_FILE_NAME)
    private val supportedJavaMappings = mapOf(
        JavaSdkVersion.JDK_1_8 to setOf(JavaSdkVersion.JDK_17),
        JavaSdkVersion.JDK_11 to setOf(JavaSdkVersion.JDK_17),
    )
    private val isModernizationInProgress = AtomicBoolean(false)
    private val isResumingJob = AtomicBoolean(false)

    private val transformationStoppedByUsr = AtomicBoolean(false)
    private var codeTransformationSession: CodeModernizerSession? = null
        set(session) {
            if (session != null) {
                Disposer.register(this, session)
            }
            field = session
        }
    private val artifactHandler = ArtifactHandler(project, GumbyClient.getInstance(project))

    init {
        CodeModernizerSessionState.getInstance(project).setDefaults()
    }

    fun validate(project: Project): ValidationResult {
        if (isRunningOnRemoteBackend()) {
            return ValidationResult(
                false,
                message("codemodernizer.notification.warn.invalid_project.description.reason.remote_backend"),
                InvalidTelemetryReason(
                    CodeTransformPreValidationError.RemoteRunProject
                )
            )
        }
        val connection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.Q)
        if (!(connection.connectionType == ActiveConnectionType.IAM_IDC && connection is ActiveConnection.ValidBearer)) {
            return ValidationResult(
                false,
                message("codemodernizer.notification.warn.invalid_project.description.reason.not_logged_in"),
                InvalidTelemetryReason(
                    CodeTransformPreValidationError.NonSsoLogin
                )
            )
        }

        if (ProjectRootManager.getInstance(project).contentRoots.isEmpty()) {
            return ValidationResult(
                false,
                message("codemodernizer.notification.warn.invalid_project.description.reason.missing_content_roots"),
                InvalidTelemetryReason(
                    CodeTransformPreValidationError.NoPom
                )
            )
        }
        val supportedModules = getSupportedModulesInProject().toSet()
        val validProjectJdk = project.getSupportedJavaMappingsForProject(supportedJavaMappings).isNotEmpty()
        if (supportedModules.isEmpty() && !validProjectJdk) {
            return ValidationResult(
                false,
                message("codemodernizer.notification.warn.invalid_project.description.reason.invalid_jdk_versions", supportedJavaMappings.keys.joinToString()),
                InvalidTelemetryReason(
                    CodeTransformPreValidationError.UnsupportedJavaVersion,
                    project.tryGetJdk().toString()
                )
            )
        }
        val validatedBuildFiles = getSupportedBuildFilesInProject()
        return if (validatedBuildFiles.isNotEmpty()) {
            ValidationResult(true, validatedBuildFiles = validatedBuildFiles)
        } else {
            ValidationResult(
                false,
                message("codemodernizer.notification.warn.invalid_project.description.reason.no_valid_files", supportedBuildFileNames.joinToString()),
                InvalidTelemetryReason(
                    CodeTransformPreValidationError.NonMavenProject,
                    if (isGradleProject(project)) "Gradle build" else "other build"
                )
            )
        }
    }

    /**
     * The initial landing UI for the results view panel.
     * This method adds code content to the problems view if not already added.
     * When [setSelected] is true, code scan panel is set to be in focus.
     */
    fun addCodeModernizeUI(setSelected: Boolean = false, moduleOrProjectNameForFile: String? = null) = runInEdt {
        val appModernizerBottomWindow = getBottomToolWindow()
        if (!appModernizerBottomWindow.contentManager.contents.contains(codeModernizerBottomWindowPanelContent)) {
            appModernizerBottomWindow.contentManager.addContent(codeModernizerBottomWindowPanelContent)
        }
        codeModernizerBottomWindowPanelContent.displayName = message("codemodernizer.toolwindow.scan_display")
        if (moduleOrProjectNameForFile == null) {
            appModernizerBottomWindow.stripeTitle = message("codemodernizer.toolwindow.label_no_job")
        } else {
            appModernizerBottomWindow.stripeTitle = message("codemodernizer.toolwindow.label", moduleOrProjectNameForFile)
        }

        if (setSelected) {
            appModernizerBottomWindow.contentManager.setSelectedContent(codeModernizerBottomWindowPanelContent)
            appModernizerBottomWindow.show()
        }
    }

    /**
     * @description Main function for triggering the start of elastic gumby migration.
     */
    fun initModernizationJobUI(shouldOpenBottomWindowOnStart: Boolean = true, moduleOrProjectNameForFile: String) {
        isModernizationInProgress.set(true)
        // Refresh CodeWhisperer Explorer tree node to reflect scan in progress.
        project.refreshCwQTree()
        // Initialize the bottom toolkit window with content
        addCodeModernizeUI(shouldOpenBottomWindowOnStart, moduleOrProjectNameForFile)
        codeModernizerBottomWindowPanelManager.setJobStartingUI()
    }

    fun validateAndStart(srcStartComponent: CodeTransformStartSrcComponents = CodeTransformStartSrcComponents.DevToolsStartButton) =
        projectCoroutineScope(project).launch {
            sendUserClickedTelemetry(srcStartComponent)
            if (isModernizationInProgress.getAndSet(true)) return@launch
            val validationResult = validate(project)
            runInEdt {
                if (validationResult.valid) {
                    runModernize(validationResult.validatedBuildFiles) ?: isModernizationInProgress.set(false)
                } else {
                    warnUnsupportedProject(validationResult.invalidReason)
                    sendValidationResultTelemetry(validationResult)
                    isModernizationInProgress.set(false)
                }
            }
        }

    private fun sendUserClickedTelemetry(srcStartComponent: CodeTransformStartSrcComponents) {
        CodeTransformTelemetryState.instance.setSessionId()
        CodeTransformTelemetryState.instance.setStartTime()
        CodetransformTelemetry.isDoubleClickedToTriggerUserModal(
            codeTransformStartSrcComponents = srcStartComponent,
            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
        )
    }

    private fun sendValidationResultTelemetry(validationResult: ValidationResult) {
        if (!validationResult.valid) {
            CodetransformTelemetry.isDoubleClickedToTriggerInvalidProject(
                codeTransformPreValidationError = validationResult.invalidTelemetryReason.category ?: CodeTransformPreValidationError.Unknown,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                result = Result.Failed,
                reason = validationResult.invalidTelemetryReason.additonalInfo
            )
        }
    }

    fun stopModernize() {
        if (isModernizationJobActive()) {
            userInitiatedStopCodeModernization()
            CodetransformTelemetry.jobIsCancelledByUser(
                codeTransformCancelSrcComponents = CodeTransformCancelSrcComponents.DevToolsStopButton,
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId()
            )
        }
    }

    fun runModernize(validatedBuildFiles: List<VirtualFile>): Job? {
        initStopParameters()
        val customerSelection = getCustomerSelection(validatedBuildFiles) ?: return null
        CodetransformTelemetry.jobStartedCompleteFromPopupDialog(
            codeTransformJavaSourceVersionsAllowed = CodeTransformJavaSourceVersionsAllowed.from(customerSelection.sourceJavaVersion.name),
            codeTransformJavaTargetVersionsAllowed = CodeTransformJavaTargetVersionsAllowed.from(customerSelection.targetJavaVersion.name),
            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId()
        )
        initModernizationJobUI(true, project.getModuleOrProjectNameForFile(customerSelection.configurationFile))
        val session = createCodeModernizerSession(customerSelection, project)
        codeTransformationSession = session
        return launchModernizationJob(session)
    }

    private fun initStopParameters() {
        codeTransformationSession = null
        transformationStoppedByUsr.set(false)
        CodeModernizerSessionState.getInstance(project).currentJobStatus = TransformationStatus.UNKNOWN_TO_SDK_VERSION
        CodeModernizerSessionState.getInstance(project).currentJobCreationTime = Instant.MIN
        CodeModernizerSessionState.getInstance(project).currentJobStopTime = Instant.MIN
    }

    fun getCustomerSelection(validatedBuildFiles: List<VirtualFile>): CustomerSelection? = PreCodeTransformUserDialog(
        project,
        validatedBuildFiles,
        supportedJavaMappings,
    ).create()

    private fun notifyJobFailure(failureReason: String?, retryable: Boolean) {
        val reason = failureReason ?: message("codemodernizer.notification.info.modernize_failed.unknown_failure_reason") // should not happen
        val retryablestring = if (retryable) message("codemodernizer.notification.info.modernize_failed.failure_is_retryable") else ""
        notifyStickyInfo(
            message("codemodernizer.notification.info.modernize_failed.title"),
            message("codemodernizer.notification.info.modernize_failed.description", reason, retryablestring),
            project,
        )
    }

    internal fun notifyTransformationStopped() {
        notifyInfo(
            message("codemodernizer.notification.info.transformation_stop.title"),
            message("codemodernizer.notification.info.transformation_stop.content"),
            project,
        )
    }

    internal fun notifyUnableToResumeJob() {
        notifyStickyInfo(
            message("codemodernizer.notification.info.transformation_resume.title"),
            message("codemodernizer.notification.info.transformation_resume.content"),
            project,
        )
    }

    internal fun notifyTransformationStartStopping() {
        notifyInfo(
            message("codemodernizer.notification.info.transformation_start_stopping.title"),
            message("codemodernizer.notification.info.transformation_start_stopping.content"),
            project,
        )
    }

    internal fun notifyTransformationStartCannotYetStop() {
        notifyError(
            message("codemodernizer.notification.info.transformation_start_stopping.failed_title"),
            message("codemodernizer.notification.info.transformation_start_stopping.failed_as_job_not_started"),
            project,
        )
    }

    internal fun notifyTransformationFailedToStop(message: String) {
        notifyError(
            message("codemodernizer.notification.info.transformation_start_stopping.failed_title"),
            message("codemodernizer.notification.info.transformation_start_stopping.failed_content", message),
            project,
        )
    }

    fun launchModernizationJob(session: CodeModernizerSession) = projectCoroutineScope(project).launch {
        val result = initModernizationJob(session)
        postModernizationJob(result)
    }

    fun resumeJob(session: CodeModernizerSession, lastJobId: JobId, currentJobResult: TransformationJob) = projectCoroutineScope(project).launch {
        if (isModernizationJobActive()) {
            runInEdt { getBottomToolWindow().show() }
            return@launch
        }
        try {
            val plan = if (currentJobResult.status() in STATES_WHERE_PLAN_EXIST) {
                try {
                    delay(1000)
                    session.fetchPlan(lastJobId).transformationPlan()
                } catch (_: Exception) {
                    null
                }
            } else {
                null
            }
            CodeModernizerSessionState.getInstance(project).currentJobCreationTime = currentJobResult.creationTime()
            codeTransformationSession = session
            initModernizationJobUI(false, project.getModuleOrProjectNameForFile(session.sessionContext.configurationFile))
            codeModernizerBottomWindowPanelManager.setResumeJobUI(currentJobResult, plan, session.sessionContext.sourceJavaVersion)
            session.resumeJob(currentJobResult.creationTime())
            val result = handleJobStarted(lastJobId, session)
            postModernizationJob(result)
        } catch (e: Exception) {
            notifyUnableToResumeJob()
            LOG.warn(e) { e.message.toString() }
            return@launch
        }
    }

    fun setJobOngoing(jobId: JobId, sessionContext: CodeModernizerSessionContext) {
        isModernizationInProgress.set(true)
        managerState = buildState(sessionContext, true, jobId)
    }

    fun setJobNotOngoing() {
        isModernizationInProgress.set(false)
        managerState.flags[StateFlags.IS_ONGOING] = false
    }

    /**
     *Start the modernization job and return the reference
     */
    internal suspend fun initModernizationJob(session: CodeModernizerSession): CodeModernizerJobCompletedResult {
        val result = session.createModernizationJob()
        return when (result) {
            is CodeModernizerStartJobResult.ZipCreationFailed -> {
                CodeModernizerJobCompletedResult.UnableToCreateJob(
                    message("codemodernizer.notification.warn.zip_creation_failed", result.reason),
                    false,
                )
            }

            is CodeModernizerStartJobResult.UnableToStartJob -> {
                CodeModernizerJobCompletedResult.UnableToCreateJob(
                    message("codemodernizer.notification.warn.unable_to_start_job", result.exception), // TODO maybe not display the entire message
                    true,
                )
            }

            is CodeModernizerStartJobResult.Started -> {
                handleJobStarted(result.jobId, session)
            }

            is CodeModernizerStartJobResult.Disposed -> {
                CodeModernizerJobCompletedResult.ManagerDisposed
            }

            is CodeModernizerStartJobResult.Cancelled -> {
                CodeModernizerJobCompletedResult.JobAbortedBeforeStarting
            }
        }
    }

    suspend fun handleJobStarted(jobId: JobId, session: CodeModernizerSession): CodeModernizerJobCompletedResult {
        setJobOngoing(jobId, session.sessionContext)
        // Init the splitter panel to show progress and progress steps
        // https://plugins.jetbrains.com/docs/intellij/general-threading-rules.html#write-access
        ApplicationManager.getApplication().invokeLater {
            codeModernizerBottomWindowPanelManager.setJobRunningUI()
        }

        return session.pollUntilJobCompletion(jobId) { new, plan ->
            codeModernizerBottomWindowPanelManager.handleJobTransition(new, plan, session.sessionContext.sourceJavaVersion)
        }
    }

    internal fun postModernizationJob(result: CodeModernizerJobCompletedResult) {
        if (result is CodeModernizerJobCompletedResult.ManagerDisposed) {
            return
        }
        // https://plugins.jetbrains.com/docs/intellij/general-threading-rules.html#write-access
        ApplicationManager.getApplication().invokeLater {
            setJobNotOngoing()
            project.refreshCwQTree()
            if (!transformationStoppedByUsr.get()) {
                informUserOfCompletion(result)
                codeModernizerBottomWindowPanelManager.setJobFinishedUI(result)
            } else {
                codeModernizerBottomWindowPanelManager.userInitiatedStopCodeModernizationUI()
                notifyTransformationStopped()
                transformationStoppedByUsr.set(false)
            }
        }
    }

    fun tryResumeJob() = projectCoroutineScope(project).launch {
        try {
            val notYetResumed = isResumingJob.compareAndSet(false, true)
            if (!notYetResumed) return@launch

            LOG.warn { "Attempting to resume job, current state is: $managerState" }
            if (!managerState.flags.getOrDefault(StateFlags.IS_ONGOING, false)) return@launch
            val context = managerState.toSessionContext(project)
            val session = CodeModernizerSession(context)
            val lastJobId = managerState.getLatestJobId()
            LOG.warn { "Attempting to resume job with id $lastJobId" }
            val result = session.getJobDetails(lastJobId)
            when (result.status()) {
                TransformationStatus.COMPLETED -> {
                    notifyStickyInfo(
                        message("codemodernizer.manager.job_finished_title"),
                        message("codemodernizer.manager.job_finished_content"),
                        project,
                        listOf(displayDiffNotificationAction(lastJobId), displaySummaryNotificationAction(lastJobId), viewTransformationHubAction())
                    )
                    resumeJob(session, lastJobId, result)
                    setJobNotOngoing()
                }

                TransformationStatus.PARTIALLY_COMPLETED -> {
                    notifyStickyInfo(
                        message("codemodernizer.notification.info.modernize_failed.title"),
                        message("codemodernizer.manager.job_failed_content", result.reason()),
                        project,
                        listOf(displayDiffNotificationAction(lastJobId), displaySummaryNotificationAction(lastJobId), viewTransformationHubAction())
                    )
                    resumeJob(session, lastJobId, result)
                    setJobNotOngoing()
                }

                TransformationStatus.UNKNOWN_TO_SDK_VERSION -> {
                    notifyStickyInfo(
                        message("codemodernizer.notification.warn.on_resume.unknown_status_response.title"),
                        message("codemodernizer.notification.warn.on_resume.unknown_status_response.content"),
                    )
                    setJobNotOngoing()
                }

                TransformationStatus.STOPPED, TransformationStatus.STOPPING -> {
                    setJobNotOngoing()
                }

                else -> {
                    resumeJob(session, lastJobId, result)
                    notifyStickyInfo(
                        message("codemodernizer.manager.job_ongoing_title"),
                        message("codemodernizer.manager.job_ongoing_content"),
                        project,
                        listOf(resumeJobNotificationAction(session, lastJobId, result)),
                    )
                }
            }
            CodetransformTelemetry.jobIsResumedAfterIdeClose(
                codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                codeTransformJobId = lastJobId.id,
                codeTransformStatus = result.status().toString()
            )
        } catch (e: AccessDeniedException) {
            LOG.warn { "Unable to resume job as credentials are invalid" }
            // User is logged in with old or invalid credentials, nothing to do until they log in with valid credentials
        } catch (e: Exception) {
            LOG.warn { "Unable to resume job as an unexpected exception occurred ${e.stackTraceToString()}" }
        } finally {
            isResumingJob.set(false)
        }
    }

    private fun viewTransformationHubAction() = NotificationAction.createSimple(message("codemodernizer.notification.info.modernize_complete.view_summary")) {
        getBottomToolWindow().show()
    }

    private fun resumeJobNotificationAction(session: CodeModernizerSession, lastJobId: JobId, currentJobResult: TransformationJob) =
        NotificationAction.createSimple(message("codemodernizer.notification.info.modernize_ongoing.view_status")) {
            resumeJob(session, lastJobId, currentJobResult)
        }

    private fun displayDiffNotificationAction(jobId: JobId): NotificationAction = NotificationAction.createSimple(
        message("codemodernizer.notification.info.modernize_complete.view_diff")
    ) {
        artifactHandler.displayDiffAction(jobId)
    }

    private fun displaySummaryNotificationAction(jobId: JobId) =
        NotificationAction.createSimple(message("codemodernizer.notification.info.modernize_complete.view_summary")) {
            artifactHandler.showTransformationSummary(jobId)
        }

    fun informUserOfCompletion(result: CodeModernizerJobCompletedResult) {
        CodetransformTelemetry.totalRunTime(
            codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
            codeTransformResultStatusMessage = result.toString(),
            codeTransformRunTimeLatency = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime(), Instant.now())
        )
        when (result) {
            is CodeModernizerJobCompletedResult.UnableToCreateJob -> notifyJobFailure(
                result.failureReason,
                result.retryable,
            )

            is CodeModernizerJobCompletedResult.RetryableFailure -> notifyJobFailure(
                result.failureReason,
                true,
            )

            is CodeModernizerJobCompletedResult.JobFailed -> notifyJobFailure(
                result.failureReason,
                false,
            )

            is CodeModernizerJobCompletedResult.JobFailedInitialBuild -> {
                ApplicationManager.getApplication().invokeLater {
                    runInEdt { BuildErrorDialog.create(result.failureReason) }
                }
            }

            is CodeModernizerJobCompletedResult.JobPartiallySucceeded -> notifyStickyInfo(
                message("codemodernizer.notification.info.modernize_partial_complete.title"),
                message("codemodernizer.notification.info.modernize_partial_complete.content", result.targetJavaVersion.description),
                project,
                listOf(displayDiffNotificationAction(result.jobId), displaySummaryNotificationAction(result.jobId)),
            )

            is CodeModernizerJobCompletedResult.JobCompletedSuccessfully -> notifyStickyInfo(
                message("codemodernizer.notification.info.modernize_complete.title"),
                message("codemodernizer.notification.info.modernize_complete.content"),
                project,
                listOf(displayDiffNotificationAction(result.jobId), displaySummaryNotificationAction(result.jobId)),
            )

            is CodeModernizerJobCompletedResult.ManagerDisposed -> LOG.warn { "Manager disposed" }
            is CodeModernizerJobCompletedResult.JobAbortedBeforeStarting -> LOG.warn { "Job was aborted" }
        }
    }

    fun createCodeModernizerSession(customerSelection: CustomerSelection, project: Project) = CodeModernizerSession(
        CodeModernizerSessionContext(
            project,
            customerSelection.configurationFile,
            customerSelection.sourceJavaVersion,
            customerSelection.targetJavaVersion,
        ),
    )

    fun showModernizationProgressUI() = codeModernizerBottomWindowPanelManager.showUnalteredJobUI()

    fun showPreviousJobHistoryUI() {
        codeModernizerBottomWindowPanelManager.setPreviousJobHistoryUI(isModernizationJobActive())
    }

    fun userInitiatedStopCodeModernization() {
        notifyTransformationStartStopping()
        if (transformationStoppedByUsr.getAndSet(true)) return
        val currentId = codeTransformationSession?.getActiveJobId()?.id
        projectCoroutineScope(project).launch {
            try {
                val success = codeTransformationSession?.stopTransformation(currentId) ?: true // no session -> no job to stop
                if (!success) {
                    // This should not happen
                    throw CodeModernizerException(message("codemodernizer.notification.info.transformation_start_stopping.as_no_response"))
                } else {
                    // Code successfully stopped toast will display when post job is run after this
                    CodetransformTelemetry.totalRunTime(
                        codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                        codeTransformResultStatusMessage = "JobCanceled",
                        codeTransformRunTimeLatency = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime(), Instant.now())
                    )
                }
            } catch (e: Exception) {
                LOG.error(e) { e.message.toString() }
                notifyTransformationFailedToStop(e.localizedMessage)
                CodetransformTelemetry.totalRunTime(
                    codeTransformSessionId = CodeTransformTelemetryState.instance.getSessionId(),
                    codeTransformResultStatusMessage = "JobCanceled",
                    codeTransformRunTimeLatency = calculateTotalLatency(CodeTransformTelemetryState.instance.getStartTime(), Instant.now())
                )
            }
        }
    }

    fun isModernizationJobActive(): Boolean = isModernizationInProgress.get()

    fun getBottomToolWindow() = ToolWindowManager.getInstance(project).getToolWindow(CodeModernizerBottomToolWindowFactory.id)
        ?: error(message("codemodernizer.toolwindow.problems_window_not_found"))

    fun getRunActionButtonIcon(): Icon =
        if (isModernizationInProgress.get()) AllIcons.Actions.Suspend else AllIcons.Actions.Execute

    override fun getState(): CodeModernizerState = CodeModernizerState().apply {
        lastJobContext.putAll(managerState.lastJobContext)
        flags.putAll(managerState.flags)
    }

    override fun loadState(state: CodeModernizerState) {
        managerState.lastJobContext.clear()
        managerState.lastJobContext.putAll(state.lastJobContext)
        managerState.flags.clear()
        managerState.flags.putAll(state.flags)
    }

    private fun findBuildFiles(sourceFolder: File): List<File> {
        /**
         * For every dir, check if any supported build files (pom.xml etc) exists.
         * If found store it and stop further recursion.
         */
        val buildFiles = mutableListOf<File>()
        sourceFolder.walkTopDown()
            .maxDepth(5)
            .onEnter { currentDir ->
                supportedBuildFileNames.forEach {
                    val maybeSupportedFile = currentDir.resolve(MAVEN_CONFIGURATION_FILE_NAME)
                    if (maybeSupportedFile.exists()) {
                        buildFiles.add(maybeSupportedFile)
                        return@onEnter false
                    }
                }
                return@onEnter true
            }.forEach {
                // noop, collects the sequence
            }
        return buildFiles
    }

    private fun getSupportedBuildFilesInProject(): List<VirtualFile> {
        /**
         * Strategy:
         * 1. Find folders with pom.xml or build.gradle.kts or build.gradle
         * 2. Filter out subdirectories
         */
        val projectRootManager = ProjectRootManager.getInstance(project)
        val probableProjectRoot = project.basePath?.toVirtualFile() // May point to only one intellij module (the first opened one)
        val probableContentRoots = projectRootManager.contentRoots.toMutableSet() // May not point to the topmost folder of modules
        probableContentRoots.add(probableProjectRoot) // dedupe
        val topLevelRoots = filterOnlyParentFiles(probableContentRoots)
        val detectedBuildFiles = topLevelRoots.flatMap { root ->
            findBuildFiles(root.toNioPath().toFile()).mapNotNull { it.path.toVirtualFile() }
        }

        val supportedModules = getSupportedModulesInProject().toSet()
        val validProjectJdk = project.getSupportedJavaMappingsForProject(supportedJavaMappings).isNotEmpty()
        return detectedBuildFiles.filter {
            val moduleOfFile = runReadAction { projectRootManager.fileIndex.getModuleForFile(it) }
            return@filter (moduleOfFile in supportedModules) || (moduleOfFile == null && validProjectJdk)
        }
    }

    private fun getSupportedModulesInProject() = project.modules.filter {
        val moduleJdk = it.tryGetJdk(project) ?: return@filter false
        moduleJdk in supportedJavaMappings
    }

    fun warnUnsupportedProject(reason: String?) {
        addCodeModernizeUI(true)
        val maybeUnknownReason = reason ?: message("codemodernizer.notification.warn.invalid_project.description.reason.unknown")
        codeModernizerBottomWindowPanelManager.setProjectInvalidUI(maybeUnknownReason)
        ApplicationManager.getApplication().invokeLater {
            runInEdt { ValidationErrorDialog.create(maybeUnknownReason) }
        }
    }

    fun getTransformationPlan(): TransformationPlan? = codeTransformationSession?.getTransformationPlan()
    fun getTransformationSummary(): TransformationSummary? {
        val job = codeTransformationSession?.getActiveJobId() ?: return null
        return artifactHandler.getSummary(job)
    }

    companion object {
        fun getInstance(project: Project): CodeModernizerManager = project.service()
        val LOG = getLogger<CodeModernizerManager>()
    }

    override fun dispose() {}
    fun showTransformationSummary() {
        val job = codeTransformationSession?.getActiveJobId() ?: return
        artifactHandler.showTransformationSummary(job)
    }

    fun showTransformationPlan() {
        codeTransformationSession?.tryOpenTransformationPlanEditor()
    }

    fun showDiff() {
        val job = codeTransformationSession?.getActiveJobId() ?: return
        artifactHandler.displayDiffAction(job)
    }

    fun handleCredentialsChanged() {
        codeTransformationSession?.dispose()
        codeModernizerBottomWindowPanelManager.reset()
        isModernizationInProgress.set(false)
    }
}
