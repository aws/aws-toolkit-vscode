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
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.codemodernizer.ArtifactHandler
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeModernizerManager
import software.aws.toolkits.jetbrains.services.codemodernizer.CodeTransformTelemetryManager
import software.aws.toolkits.jetbrains.services.codemodernizer.InboundAppMessagesHandler
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformActionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformCommand
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCheckingValidProjectChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalFailedChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalInProgressChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildCompileLocalSuccessChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildProjectInvalidChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildProjectValidChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildStartNewTransformFollowup
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformInProgressChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformResultChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformResumingChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformStoppedChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildTransformStoppingChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserCancelledChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserInputChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserSelectionSummaryChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.buildUserStopTransformChatContent
import software.aws.toolkits.jetbrains.services.codemodernizer.getModuleOrProjectNameForFile
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.AuthenticationNeededExceptionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformChatMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CodeTransformCommandMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.IncomingCodeTransformMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerJobCompletedResult
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CustomerSelection
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MavenCopyCommandsResult
import software.aws.toolkits.jetbrains.services.codemodernizer.session.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.codemodernizer.session.Session
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.toVirtualFile
import software.aws.toolkits.jetbrains.services.codemodernizer.tryGetJdk
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CodeTransformStartSrcComponents

class CodeTransformChatController(
    private val context: AmazonQAppInitContext,
    private val chatSessionStorage: ChatSessionStorage
) : InboundAppMessagesHandler {
    private val authController = AuthController()
    private val messagePublisher = context.messagesFromAppToUi
    private val telemetry = CodeTransformTelemetryManager.getInstance(context.project)
    private val codeModernizerManager = CodeModernizerManager.getInstance(context.project)
    private val codeTransformChatHelper = CodeTransformChatHelper(context.messagesFromAppToUi, chatSessionStorage)
    private val artifactHandler = ArtifactHandler(context.project, GumbyClient.getInstance(context.project))

    override suspend fun processTransformQuickAction(message: IncomingCodeTransformMessage.Transform) {
        if (!checkForAuth(message.tabId)) {
            return
        }

        CodeTransformTelemetryManager.getInstance(context.project).jobIsStartedFromChatPrompt()

        telemetry.sendUserClickedTelemetry(CodeTransformStartSrcComponents.ChatPrompt)
        codeTransformChatHelper.setActiveCodeTransformTabId(message.tabId)

        if (!message.startNewTransform) {
            if (tryRestoreChatProgress()) {
                return
            }
        }

        codeTransformChatHelper.addNewMessage(
            buildCheckingValidProjectChatContent()
        )

        delay(3000)

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

        delay(500)

        codeTransformChatHelper.addNewMessage(
            buildUserInputChatContent(context.project, validationResult)
        )
    }

    suspend fun tryRestoreChatProgress(): Boolean {
        val isTransformOngoing = codeModernizerManager.isModernizationJobActive()
        val isMvnRunning = codeModernizerManager.isRunningMvn()
        val isTransformationResuming = codeModernizerManager.isModernizationJobResuming()

        while (isTransformationResuming) {
            delay(50)
        }

        if (isMvnRunning) {
            codeTransformChatHelper.addNewMessage(buildCompileLocalInProgressChatContent())
            return true
        }

        if (isTransformOngoing) {
            if (codeModernizerManager.isJobSuccessfullyResumed()) {
                codeTransformChatHelper.addNewMessage(buildTransformResumingChatContent())
            } else {
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

    suspend fun handleMavenBuildResult(mavenBuildResult: MavenCopyCommandsResult) {
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

            addNewMessage(buildTransformInProgressChatContent())
        }

        runInEdt {
            codeModernizerManager.runModernize(mavenBuildResult)
        }
    }

    override suspend fun processCodeTransformStopAction(tabId: String) {
        if (!checkForAuth(tabId)) {
            return
        }
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

    companion object {
        private val logger = getLogger<CodeTransformChatController>()
    }
}
