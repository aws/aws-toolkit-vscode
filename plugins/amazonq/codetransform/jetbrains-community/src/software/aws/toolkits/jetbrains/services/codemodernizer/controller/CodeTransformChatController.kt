// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.controller

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.module.ModuleUtil
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.vfs.VirtualFile
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.codemodernizer.ArtifactHandler
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.HilTelemetryMetaData
import software.aws.toolkits.jetbrains.services.codemodernizer.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformActionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformCommand
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCheckingValidProjectChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileHilAlternativeVersionContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalFailedChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalInProgressChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalSuccessChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildDownloadFailureChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilCannotResumeContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilErrorContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilInitialContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilRejectContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilResumeWithErrorContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildHilResumedContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildProjectInvalidChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildProjectValidChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildStartNewTransformFollowup
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformAwaitUserInputChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformBeginChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformDependencyErrorChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformFindingLocalAlternativeDependencyChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformInProgressChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformResultChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformResumingChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformStoppedChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformStoppingChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserCancelledChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserHilSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserInputChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserSelectionSummaryChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserStopTransformChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.AuthenticationNeededExceptionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformCommandMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.IncomingCodeTransformMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeTransformHilDownloadArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.DownloadFailureReason
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenCopyCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenDependencyReportCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.session.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.codemodernizer.session.Session
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.getModuleOrProjectNameForFile
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.toVirtualFile
import software.aws.toolkits.jetbrains.services.codemodernizer.utils.tryGetJdk
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import software.aws.toolkits.resources.AwsToolkitBundle.message

class CodeTransformChatController(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {
    private val authController = AuthController()
    private val messagePublisher = context.messagesFromAppToUi
    private val codeModernizerManager = CodeModernizerManager.getInstance(context.project)
    private val codeTransformChatHelper = CodeTransformChatHelper(context.messagesFromAppToUi, chatSessionStorage)
    private val artifactHandler = ArtifactHandler(context.project, GumbyClient.getInstance(context.project))
    private val telemetry = CodeTransformTelemetryManager.getInstance(context.project)

    override suspend fun processTransformQuickAction(message: IncomingCodeTransformMessage.Transform) {
        telemetry.prepareForNewJobSubmission()
        if (!checkForAuth(message.tabId)) {
            return
        }

        codeTransformChatHelper.setActiveCodeTransformTabId(message.tabId)

        if (!message.startNewTransform) {
            if (tryRestoreChatProgress()) {
                return
            }
        }

        codeTransformChatHelper.addNewMessage(
            buildCheckingValidProjectChatContent()
        )

        codeTransformChatHelper.chatDelayLong()

        val validationResult = codeModernizerManager.validate(context.project)

        if (!validationResult.valid) {
            codeTransformChatHelper.updateLastPendingMessage(
                buildProjectInvalidChatContent(validationResult)
            )
            codeTransformChatHelper.addNewMessage(
                buildStartNewTransformFollowup()
            )

            return
        }

        codeTransformChatHelper.updateLastPendingMessage(
            buildProjectValidChatContent(validationResult)
        )

        codeTransformChatHelper.chatDelayShort()

        telemetry.jobIsStartedFromChatPrompt()

        codeTransformChatHelper.addNewMessage(
            buildUserInputChatContent(context.project, validationResult)
        )
    }

    suspend fun tryRestoreChatProgress(): Boolean {
        val isTransformOngoing = codeModernizerManager.isModernizationJobActive()
        val isMvnRunning = codeModernizerManager.isRunningMvn()
        val isTransformationResuming = codeModernizerManager.isModernizationJobResuming()

        while (isTransformationResuming) {
            // Poll until transformation is resumed
            delay(50)
        }

        if (isMvnRunning) {
            codeTransformChatHelper.addNewMessage(buildCompileLocalInProgressChatContent())
            return true
        }

        if (isTransformOngoing) {
            if (codeModernizerManager.isJobSuccessfullyResumed()) {
                codeTransformChatHelper.addNewMessage(buildTransformResumingChatContent())
                codeTransformChatHelper.addNewMessage(buildTransformInProgressChatContent())
            } else {
                codeTransformChatHelper.addNewMessage(buildTransformBeginChatContent())
                codeTransformChatHelper.addNewMessage(buildTransformInProgressChatContent())
            }
            return true
        }

        val lastTransformResult = codeModernizerManager.getLastTransformResult()
        if (lastTransformResult != null) {
            codeTransformChatHelper.addNewMessage(buildTransformResumingChatContent())
            handleCodeTransformResult(lastTransformResult)
            return true
        }

        val lastMvnBuildResult = codeModernizerManager.getLastMvnBuildResult()
        if (lastMvnBuildResult != null) {
            codeTransformChatHelper.addNewMessage(buildCompileLocalInProgressChatContent())
            handleMavenBuildResult(lastMvnBuildResult)
            return true
        }

        return false
    }

    override suspend fun processCodeTransformCancelAction(message: IncomingCodeTransformMessage.CodeTransformCancel) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        codeTransformChatHelper.run {
            addNewMessage(buildUserCancelledChatContent())
            addNewMessage(buildStartNewTransformFollowup())
        }
    }

    override suspend fun processCodeTransformStartAction(message: IncomingCodeTransformMessage.CodeTransformStart) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        val (tabId, modulePath, targetVersion) = message

        val moduleVirtualFile: VirtualFile = modulePath.toVirtualFile() as VirtualFile
        val moduleName = context.project.getModuleOrProjectNameForFile(moduleVirtualFile)

        codeTransformChatHelper.run {
            addNewMessage(buildUserSelectionSummaryChatContent(moduleName))

            addNewMessage(buildCompileLocalInProgressChatContent())
        }

        // this should never throw the RuntimeException since invalid JDK case is already handled in previous validation step
        val sourceJdk = ModuleUtil.findModuleForFile(moduleVirtualFile, context.project)?.tryGetJdk(context.project) ?: context.project.tryGetJdk()
            ?: throw RuntimeException("Unable to determine source JDK version")

        val selection = CustomerSelection(
            moduleVirtualFile,
            sourceJdk,
            JavaSdkVersion.JDK_17
        )

        codeModernizerManager.runLocalMavenBuild(context.project, selection)
    }

    private suspend fun handleMavenBuildResult(mavenBuildResult: MavenCopyCommandsResult) {
        if (mavenBuildResult == MavenCopyCommandsResult.Cancelled) {
            codeTransformChatHelper.updateLastPendingMessage(buildUserCancelledChatContent())
            codeTransformChatHelper.addNewMessage(buildStartNewTransformFollowup())
            return
        } else if (mavenBuildResult == MavenCopyCommandsResult.Failure) {
            codeTransformChatHelper.updateLastPendingMessage(buildCompileLocalFailedChatContent())
            codeTransformChatHelper.addNewMessage(buildStartNewTransformFollowup())
            return
        }

        codeTransformChatHelper.run {
            updateLastPendingMessage(buildCompileLocalSuccessChatContent())

//            addNewMessage(buildTransformBeginChatContent())
//            addNewMessage(buildTransformInProgressChatContent())
        }

        runInEdt {
            codeModernizerManager.runModernize(mavenBuildResult)
        }
    }

    override suspend fun processCodeTransformStopAction(tabId: String) {
        if (!checkForAuth(tabId)) {
            return
        }

        updatePomPreviewItem()

        codeTransformChatHelper.run {
            addNewMessage(buildUserStopTransformChatContent())

            addNewMessage(buildTransformStoppingChatContent())
        }

        runBlocking {
            codeModernizerManager.stopModernize()
        }
    }

    override suspend fun processCodeTransformOpenTransformHub(message: IncomingCodeTransformMessage.CodeTransformOpenTransformHub) {
        runInEdt {
            codeModernizerManager.getBottomToolWindow().show()
        }
    }

    override suspend fun processCodeTransformOpenMvnBuild(message: IncomingCodeTransformMessage.CodeTransformOpenMvnBuild) {
        runInEdt {
            codeModernizerManager.getMvnBuildWindow().show()
        }
    }

    override suspend fun processCodeTransformViewDiff(message: IncomingCodeTransformMessage.CodeTransformViewDiff) {
        artifactHandler.displayDiffAction(CodeModernizerSessionState.getInstance(context.project).currentJobId as JobId)
    }

    override suspend fun processCodeTransformViewSummary(message: IncomingCodeTransformMessage.CodeTransformViewSummary) {
        artifactHandler.showTransformationSummary(CodeModernizerSessionState.getInstance(context.project).currentJobId as JobId)
    }

    override suspend fun processCodeTransformNewAction(message: IncomingCodeTransformMessage.CodeTransformNew) {
        processTransformQuickAction(IncomingCodeTransformMessage.Transform(tabId = message.tabId, startNewTransform = true))
    }

    override suspend fun processCodeTransformCommand(message: CodeTransformActionMessage) {
        val activeTabId = codeTransformChatHelper.getActiveCodeTransformTabId() ?: return

        when (message.command) {
            CodeTransformCommand.StopClicked -> {
                messagePublisher.publish(CodeTransformCommandMessage(command = "stop"))
                processCodeTransformStopAction(activeTabId)
            }
            CodeTransformCommand.MavenBuildComplete -> {
                val result = message.mavenBuildResult
                if (result != null) {
                    handleMavenBuildResult(result)
                }
            }
            CodeTransformCommand.UploadComplete -> {
                handleCodeTransformUploadCompleted()
            }
            CodeTransformCommand.TransformComplete -> {
                val result = message.transformResult
                if (result != null) {
                    handleCodeTransformResult(result)
                }
            }
            CodeTransformCommand.TransformStopped -> {
                handleCodeTransformStoppedByUser()
            }
            CodeTransformCommand.TransformResuming -> {
                handleCodeTransformJobResume()
            }
            CodeTransformCommand.StartHil -> {
                handleHil()
            }
            CodeTransformCommand.DownloadFailed -> {
                val result = message.downloadFailure
                if (result != null) {
                    handleDownloadFailed(message.downloadFailure)
                }
            }
            else -> {
                processTransformQuickAction(IncomingCodeTransformMessage.Transform(tabId = activeTabId))
            }
        }
    }

    override suspend fun processTabCreated(message: IncomingCodeTransformMessage.TabCreated) {
        logger.debug { "$FEATURE_NAME: New tab created: $message" }
    }

    private suspend fun checkForAuth(tabId: String): Boolean {
        var session: Session? = null
        try {
            session = chatSessionStorage.getSession(tabId)
            logger.debug { "$FEATURE_NAME: Session created with id: ${session.tabId}" }

            val credentialState = authController.getAuthNeededStates(context.project).amazonQ
            if (credentialState != null) {
                messagePublisher.publish(
                    AuthenticationNeededExceptionMessage(
                        tabId = session.tabId,
                        authType = credentialState.authType,
                        message = credentialState.message
                    )
                )
                session.isAuthenticating = true
                return false
            }
        } catch (err: Exception) {
            messagePublisher.publish(
                CodeTransformChatMessage(
                    tabId = tabId,
                    messageType = ChatMessageType.Answer,
                    message = message("codemodernizer.chat.message.error_request")
                )
            )
            return false
        }

        return true
    }

    override suspend fun processTabRemoved(message: IncomingCodeTransformMessage.TabRemoved) {
        chatSessionStorage.deleteSession(message.tabId)
    }

    override suspend fun processAuthFollowUpClick(message: IncomingCodeTransformMessage.AuthFollowUpWasClicked) {
        authController.handleAuth(context.project, message.authType)
        messagePublisher.publish(
            CodeTransformChatMessage(
                tabId = message.tabId,
                messageType = ChatMessageType.Answer,
                message = message("codemodernizer.chat.message.auth_prompt")
            )
        )
    }

    override suspend fun processBodyLinkClicked(message: IncomingCodeTransformMessage.BodyLinkClicked) {
        BrowserUtil.browse(message.link)
    }

    private suspend fun handleCodeTransformUploadCompleted() {
        codeTransformChatHelper.addNewMessage(buildTransformBeginChatContent())
        codeTransformChatHelper.addNewMessage(buildTransformInProgressChatContent())
    }

    private suspend fun handleCodeTransformJobResume() {
        codeTransformChatHelper.addNewMessage(buildTransformResumingChatContent())
    }

    private suspend fun handleCodeTransformStoppedByUser() {
        codeTransformChatHelper.updateLastPendingMessage(buildTransformStoppedChatContent())
        codeTransformChatHelper.addNewMessage(buildStartNewTransformFollowup())
    }

    private suspend fun handleCodeTransformResult(result: CodeModernizerJobCompletedResult) {
        when (result) {
            is CodeModernizerJobCompletedResult.Stopped, CodeModernizerJobCompletedResult.JobAbortedBeforeStarting -> handleCodeTransformStoppedByUser()
            else -> {
                codeTransformChatHelper.updateLastPendingMessage(
                    buildTransformResultChatContent(result)
                )
                codeTransformChatHelper.addNewMessage(buildStartNewTransformFollowup())
            }
        }
    }

    private suspend fun hilTryResumeAfterError(errorMessage: String) {
        codeTransformChatHelper.addNewMessage(buildHilErrorContent(errorMessage))
        codeTransformChatHelper.addNewMessage(buildHilResumeWithErrorContent())

        try {
            codeModernizerManager.rejectHil()
            runInEdt {
                codeModernizerManager.getBottomToolWindow().show()
            }

            codeTransformChatHelper.chatDelayLong()

            codeModernizerManager.resumePollingFromHil()
        } catch (e: Exception) {
            telemetry.logHil(
                CodeModernizerSessionState.getInstance(context.project).currentJobId?.id.orEmpty(),
                HilTelemetryMetaData(
                    cancelledFromChat = false,
                ),
                success = false,
                reason = "Runtime Error when trying to resume transformation from HIL",
            )
            codeTransformChatHelper.updateLastPendingMessage(buildHilCannotResumeContent())
        }
    }

    private suspend fun handleHil() {
        codeTransformChatHelper.updateLastPendingMessage(buildHilInitialContent())

        val hilDownloadArtifact = codeModernizerManager.getArtifactForHil()

        if (hilDownloadArtifact == null) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.cannot_download_artifact"))
            return
        }

        codeTransformChatHelper.addNewMessage(buildTransformDependencyErrorChatContent(hilDownloadArtifact), codeTransformChatHelper.generateHilPomItemId())
        codeTransformChatHelper.addNewMessage(buildTransformFindingLocalAlternativeDependencyChatContent(), clearPreviousItemButtons = false)
        val createReportResult = codeModernizerManager.createDependencyReport(hilDownloadArtifact)
        if (createReportResult == MavenDependencyReportCommandsResult.Cancelled) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.cancel_dependency_search"))
            return
        } else if (createReportResult == MavenDependencyReportCommandsResult.Failure) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.no_other_versions_found", hilDownloadArtifact.manifest.pomArtifactId))
            return
        }

        val dependency = codeModernizerManager.findAvailableVersionForDependency(
            hilDownloadArtifact.manifest.pomGroupId,
            hilDownloadArtifact.manifest.pomArtifactId
        )

        if (dependency == null || (dependency.majors.isNullOrEmpty() && dependency.minors.isNullOrEmpty() && dependency.incrementals.isNullOrEmpty())) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.no_other_versions_found", hilDownloadArtifact.manifest.pomArtifactId))
            return
        }
        codeTransformChatHelper.updateLastPendingMessage(buildTransformAwaitUserInputChatContent(dependency))
        runInEdt {
            codeModernizerManager.getBottomToolWindow().show()
        }
    }

    private suspend fun handleDownloadFailed(failureReason: DownloadFailureReason) {
        codeTransformChatHelper.addNewMessage(buildDownloadFailureChatContent(failureReason))
        codeTransformChatHelper.addNewMessage(buildStartNewTransformFollowup())
    }

    // Remove open file button after pom.xml is deleted
    private suspend fun updatePomPreviewItem() {
        val hilPomItemId = codeTransformChatHelper.getHilPomItemId() ?: return
        val hilDownloadArtifact = codeModernizerManager.getArtifactForHil()
        if (hilDownloadArtifact != null) {
            codeTransformChatHelper.updateExistingMessage(
                hilPomItemId,
                buildTransformDependencyErrorChatContent(hilDownloadArtifact, false)
            )
        }
        codeTransformChatHelper.clearHilPomItemId()
    }

    override suspend fun processConfirmHilSelection(message: IncomingCodeTransformMessage.ConfirmHilSelection) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        updatePomPreviewItem()

        val selectedVersion = message.version
        val artifact = codeModernizerManager.getCurrentHilArtifact() as CodeTransformHilDownloadArtifact

        codeTransformChatHelper.run {
            addNewMessage(buildUserHilSelection(artifact.manifest.pomArtifactId, artifact.manifest.sourcePomVersion, selectedVersion))

            addNewMessage(buildCompileHilAlternativeVersionContent())
        }

        val copyDependencyResult = codeModernizerManager.copyDependencyForHil(selectedVersion)
        if (copyDependencyResult == MavenCopyCommandsResult.Failure) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.cannot_upload"))
            return
        } else if (copyDependencyResult == MavenCopyCommandsResult.Cancelled) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.cancel_upload"))
            return
        }

        try {
            codeModernizerManager.tryResumeWithAlternativeVersion(selectedVersion)

            telemetry.logHil(
                CodeModernizerSessionState.getInstance(context.project).currentJobId?.id as String,
                HilTelemetryMetaData(
                    dependencyVersionSelected = selectedVersion,
                ),
                success = true,
                reason = "User selected version"
            )

            codeTransformChatHelper.updateLastPendingMessage(buildHilResumedContent())

            runInEdt {
                codeModernizerManager.getBottomToolWindow().show()
            }
            codeModernizerManager.resumePollingFromHil()
        } catch (e: Exception) {
            hilTryResumeAfterError(message("codemodernizer.chat.message.hil.error.cannot_upload"))
        }
    }

    override suspend fun processRejectHilSelection(message: IncomingCodeTransformMessage.RejectHilSelection) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        codeTransformChatHelper.addNewMessage(buildHilRejectContent())

        updatePomPreviewItem()

        try {
            codeModernizerManager.rejectHil()

            telemetry.logHil(
                CodeModernizerSessionState.getInstance(context.project).currentJobId?.id.orEmpty(),
                HilTelemetryMetaData(
                    cancelledFromChat = true,
                ),
                success = false,
                reason = "User cancelled"
            )

            runInEdt {
                codeModernizerManager.getBottomToolWindow().show()
            }
            codeModernizerManager.resumePollingFromHil()
        } catch (e: Exception) {
            telemetry.logHil(
                CodeModernizerSessionState.getInstance(context.project).currentJobId?.id.orEmpty(),
                HilTelemetryMetaData(
                    cancelledFromChat = false,
                ),
                success = false,
                reason = "Runtime Error when trying to resume transformation from HIL",
            )
            codeTransformChatHelper.updateLastPendingMessage(buildHilCannotResumeContent())
        }
    }

    override suspend fun processOpenPomFileHilClicked(message: IncomingCodeTransformMessage.OpenPomFileHilClicked) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        try {
            codeModernizerManager.showHilPomFileAnnotation()
        } catch (e: Exception) {
            telemetry.error("Unknown exception when trying to open hil pom file: ${e.localizedMessage}")
            logger.error { "Unknown exception when trying to open file: ${e.localizedMessage}" }
        }
    }

    companion object {
        private val logger = getLogger<CodeTransformChatController>()
    }
}
