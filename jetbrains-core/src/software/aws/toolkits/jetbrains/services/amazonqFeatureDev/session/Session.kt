// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.APPROACH_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.conversationIdNotFound
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.AsyncEventProgressMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.createConversation
import software.aws.toolkits.telemetry.AmazonqTelemetry

class Session(val tabID: String, val project: Project) {
    private var _state: SessionState?
    private var context: FeatureDevSessionContext
    private var preloaderFinished: Boolean = false
    private var _conversationId: String? = null
    private var _latestMessage: String = ""
    private var task: String = ""
    private val proxyClient: FeatureDevClient
    private var approachRetries: Int

    // Used to keep track of whether the current session/tab is currently authenticating/needs authenticating
    var isAuthenticating: Boolean

    init {
        _state = ConversationNotStartedState("", tabID)
        context = FeatureDevSessionContext(project)
        proxyClient = FeatureDevClient.getInstance(project)
        isAuthenticating = false
        approachRetries = APPROACH_RETRY_LIMIT
    }

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    suspend fun preloader(msg: String, messagePublisher: MessagePublisher) {
        if (!preloaderFinished) {
            setupConversation(msg)
            preloaderFinished = true

            AmazonqTelemetry.startChat(amazonqConversationId = this.conversationId)
            val asyncEventProgressMessage = AsyncEventProgressMessage(
                tabId = this.tabID,
                message = null,
                inProgress = true
            )
            messagePublisher.publish(asyncEventProgressMessage)
        }
    }

    /**
     * Starts a conversation with the backend and uploads the repo for the LLMs to be able to use it.
     */
    private fun setupConversation(msg: String) {
        // Store the initial message when setting up the conversation so that if it fails we can retry with this message
        _latestMessage = msg

        _conversationId = createConversation(proxyClient)
        val sessionStateConfig = getSessionStateConfig().copy(conversationId = this.conversationId)
        _state = PrepareRefinementState("", tabID, sessionStateConfig)
    }

    suspend fun send(msg: String): Interaction {
        // When the task/"thing to do" hasn't been set yet, we want it to be the incoming message
        if (task.isEmpty() && msg.isNotEmpty()) {
            task = msg
        }

        _latestMessage = msg
        return nextInteraction(msg)
    }

    private suspend fun nextInteraction(msg: String): Interaction {
        var action = SessionStateAction(
            task = task,
            msg = msg
        )
        val resp = sessionState.interact(action)
        if (resp.nextState != null) {
            // Approach may have been changed after the interaction
            val newApproach = sessionState.approach

            // Move to the next state
            _state = resp.nextState

            // If approach was changed then we need to set it in the next state and this state
            sessionState.approach = newApproach
        }
        return resp.interaction
    }

    private fun getSessionStateConfig(): SessionStateConfig = SessionStateConfig(
        conversationId = this.conversationId,
        proxyClient = this.proxyClient,
        repoContext = this.context
    )

    val conversationId: String
        get() {
            if (_conversationId == null) {
                conversationIdNotFound()
            } else {
                return _conversationId as String
            }
        }
    val sessionState: SessionState
        get() {
            if (_state == null) {
                throw Error("State should be initialized before it's read")
            } else {
                return _state as SessionState
            }
        }

    val latestMessage: String
        get() = this._latestMessage

    fun decreaseRetries() {
        when (sessionState.phase) {
            SessionStatePhase.APPROACH -> approachRetries -= 1
            else -> {}
        }
    }
}
