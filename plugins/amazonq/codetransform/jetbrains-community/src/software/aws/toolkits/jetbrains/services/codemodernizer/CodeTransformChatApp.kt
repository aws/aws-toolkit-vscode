// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.ApplicationManager
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQApp
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.auth.isFeatureDevAvailable
import software.aws.toolkits.jetbrains.services.codemodernizer.auth.isCodeTransformAvailable
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformActionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.commands.CodeTransformMessageListener
import software.aws.toolkits.jetbrains.services.codemodernizer.controller.CodeTransformChatController
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.AuthenticationNeededExceptionMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.AuthenticationUpdateMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.CODE_TRANSFORM_TAB_NAME
import software.aws.toolkits.jetbrains.services.codemodernizer.messages.IncomingCodeTransformMessage
import software.aws.toolkits.jetbrains.services.codemodernizer.session.ChatSessionStorage

private enum class CodeTransformMessageTypes(val type: String) {
    TabCreated("new-tab-was-created"),
    TabRemoved("tab-was-removed"),
    Transform("transform"),
    CodeTransformStart("codetransform-start"),
    CodeTransformStop("codetransform-stop"),
    CodeTransformCancel("codetransform-cancel"),
    CodeTransformNew("codetransform-new"),
    CodeTransformOpenTransformHub("codetransform-open-transform-hub"),
    CodeTransformOpenMvnBuild("codetransform-open-mvn-build"),
    ViewDiff("codetransform-view-diff"),
    ViewSummary("codetransform-view-summary"),
    AuthFollowUpWasClicked("auth-follow-up-was-clicked"),
    BodyLinkClicked("response-body-link-click"),
}

class CodeTransformChatApp : AmazonQApp {
    private val scope = disposableCoroutineScope(this)

    override val tabTypes = listOf(CODE_TRANSFORM_TAB_NAME)

    override fun init(context: AmazonQAppInitContext) {
        val chatSessionStorage = ChatSessionStorage()
        val inboundAppMessagesHandler: InboundAppMessagesHandler = CodeTransformChatController(context, chatSessionStorage)

        context.messageTypeRegistry.register(
            CodeTransformMessageTypes.TabCreated.type to IncomingCodeTransformMessage.TabCreated::class,
            CodeTransformMessageTypes.TabRemoved.type to IncomingCodeTransformMessage.TabRemoved::class,
            CodeTransformMessageTypes.Transform.type to IncomingCodeTransformMessage.Transform::class,
            CodeTransformMessageTypes.CodeTransformStart.type to IncomingCodeTransformMessage.CodeTransformStart::class,
            CodeTransformMessageTypes.CodeTransformStop.type to IncomingCodeTransformMessage.CodeTransformStop::class,
            CodeTransformMessageTypes.CodeTransformCancel.type to IncomingCodeTransformMessage.CodeTransformCancel::class,
            CodeTransformMessageTypes.CodeTransformNew.type to IncomingCodeTransformMessage.CodeTransformNew::class,
            CodeTransformMessageTypes.CodeTransformOpenTransformHub.type to IncomingCodeTransformMessage.CodeTransformOpenTransformHub::class,
            CodeTransformMessageTypes.CodeTransformOpenMvnBuild.type to IncomingCodeTransformMessage.CodeTransformOpenMvnBuild::class,
            CodeTransformMessageTypes.ViewDiff.type to IncomingCodeTransformMessage.CodeTransformViewDiff::class,
            CodeTransformMessageTypes.ViewSummary.type to IncomingCodeTransformMessage.CodeTransformViewSummary::class,
            CodeTransformMessageTypes.AuthFollowUpWasClicked.type to IncomingCodeTransformMessage.AuthFollowUpWasClicked::class,
            CodeTransformMessageTypes.BodyLinkClicked.type to IncomingCodeTransformMessage.BodyLinkClicked::class,
        )

        scope.launch {
            merge(CodeTransformMessageListener.instance.flow, context.messagesFromUiToApp.flow).collect { message ->
                // Launch a new coroutine to handle each message
                scope.launch { handleMessage(message, inboundAppMessagesHandler) }
            }
        }

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    scope.launch {
                        val authController = AuthController()
                        val credentialState = authController.getAuthNeededStates(context.project).amazonQ
                        if (credentialState == null) {
                            // Notify tabs about restoring authentication
                            context.messagesFromAppToUi.publish(
                                AuthenticationUpdateMessage(
                                    featureDevEnabled = isFeatureDevAvailable(context.project),
                                    codeTransformEnabled = isCodeTransformAvailable(context.project),
                                    authenticatingTabIDs = chatSessionStorage.getAuthenticatingSessions().map { it.tabId }
                                )
                            )

                            chatSessionStorage.changeAuthenticationNeeded(false)
                            chatSessionStorage.changeAuthenticationNeededNotified(false)
                            CodeTransformMessageListener.instance.onAuthRestored()
                        } else {
                            chatSessionStorage.changeAuthenticationNeeded(true)

                            // Ask for reauth
                            chatSessionStorage.getAuthenticatingSessions().filter { !it.authNeededNotified }.forEach {
                                context.messagesFromAppToUi.publish(
                                    AuthenticationNeededExceptionMessage(
                                        tabId = it.tabId,
                                        authType = credentialState.authType,
                                        message = credentialState.message,
                                    )
                                )
                            }

                            // Prevent multiple calls to activeConnectionChanged
                            chatSessionStorage.changeAuthenticationNeededNotified(true)
                        }
                    }
                }
            }
        )
    }

    private suspend fun handleMessage(message: AmazonQMessage, inboundAppMessagesHandler: InboundAppMessagesHandler) {
        when (message) {
            is IncomingCodeTransformMessage.Transform -> inboundAppMessagesHandler.processTransformQuickAction(message)
            is IncomingCodeTransformMessage.CodeTransformStart -> inboundAppMessagesHandler.processCodeTransformStartAction(message)
            is IncomingCodeTransformMessage.CodeTransformCancel -> inboundAppMessagesHandler.processCodeTransformCancelAction(message)
            is IncomingCodeTransformMessage.CodeTransformStop -> inboundAppMessagesHandler.processCodeTransformStopAction(message.tabId)
            is IncomingCodeTransformMessage.CodeTransformNew -> inboundAppMessagesHandler.processCodeTransformNewAction(message)
            is IncomingCodeTransformMessage.CodeTransformOpenTransformHub -> inboundAppMessagesHandler.processCodeTransformOpenTransformHub(message)
            is IncomingCodeTransformMessage.CodeTransformOpenMvnBuild -> inboundAppMessagesHandler.processCodeTransformOpenMvnBuild(message)
            is IncomingCodeTransformMessage.CodeTransformViewDiff -> inboundAppMessagesHandler.processCodeTransformViewDiff(message)
            is IncomingCodeTransformMessage.CodeTransformViewSummary -> inboundAppMessagesHandler.processCodeTransformViewSummary(message)
            is IncomingCodeTransformMessage.TabCreated -> inboundAppMessagesHandler.processTabCreated(message)
            is IncomingCodeTransformMessage.TabRemoved -> inboundAppMessagesHandler.processTabRemoved(message)
            is IncomingCodeTransformMessage.AuthFollowUpWasClicked -> inboundAppMessagesHandler.processAuthFollowUpClick(message)
            is IncomingCodeTransformMessage.BodyLinkClicked -> inboundAppMessagesHandler.processBodyLinkClicked(message)
            is CodeTransformActionMessage -> inboundAppMessagesHandler.processCodeTransformCommand(message)
        }
    }

    override fun dispose() {
        // nothing to do
    }
}
