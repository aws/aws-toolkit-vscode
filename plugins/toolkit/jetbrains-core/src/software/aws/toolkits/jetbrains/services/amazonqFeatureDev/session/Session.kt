// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.APPROACH_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.CODE_GENERATION_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.conversationIdNotFound
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAsyncEventProgress
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.createConversation
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteIfExists
import kotlin.io.path.readBytes
import kotlin.io.path.writeBytes

class Session(val tabID: String, val project: Project) {
    private var _state: SessionState?
    var context: FeatureDevSessionContext
    private var preloaderFinished: Boolean = false
    private var _conversationId: String? = null
    private var _latestMessage: String = ""
    private var task: String = ""
    private val proxyClient: FeatureDevClient

    // retry session state vars
    private var approachRetries: Int
    private var codegenRetries: Int

    // Used to keep track of whether the current session/tab is currently authenticating/needs authenticating
    var isAuthenticating: Boolean

    init {
        _state = ConversationNotStartedState("", tabID)
        context = FeatureDevSessionContext(project)
        proxyClient = FeatureDevClient.getInstance(project)
        isAuthenticating = false
        approachRetries = APPROACH_RETRY_LIMIT
        codegenRetries = CODE_GENERATION_RETRY_LIMIT
    }

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    suspend fun preloader(msg: String, messenger: MessagePublisher) {
        if (!preloaderFinished) {
            setupConversation(msg)
            preloaderFinished = true

            messenger.sendAsyncEventProgress(tabId = this.tabID, inProgress = true)
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

    /**
     * Triggered by the Write Code follow-up button to move to the code generation phase
     */
    fun initCodegen(messenger: MessagePublisher) {
        this._state = PrepareCodeGenerationState(
            tabID = sessionState.tabID,
            approach = sessionState.approach,
            config = getSessionStateConfig(),
            filePaths = emptyList(),
            deletedFiles = emptyArray(),
            references = emptyArray(),
            currentIteration = 0,
            messenger = messenger,
        )
        this._latestMessage = ""

        // TODO: add here telemetry for approach being accepted. Will be done in a follow-up
    }

    /**
     * Triggered by the Accept code follow-up button to apply code changes.
     */
    fun acceptChanges(filePaths: List<NewFileZipInfo>, deletedFiles: Array<String>) {
        val projectRootPath = context.projectRoot.toNioPath()

        filePaths.forEach {
            val filePath = projectRootPath.resolve(it.zipFilePath)
            filePath.parent.createDirectories() // Create directories if needed
            filePath.writeBytes(it.newFilePath.readBytes())
        }

        deletedFiles.forEach {
            val deleteFilePath = projectRootPath.resolve(it)
            deleteFilePath.deleteIfExists()
        }

        // TODO: References received from code generation should be logged.
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
            msg = msg,
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
        repoContext = this.context,
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

    val retries: Int
        get() = if (sessionState.phase == SessionStatePhase.CODEGEN) codegenRetries else approachRetries

    fun decreaseRetries() {
        if (sessionState.phase == SessionStatePhase.CODEGEN) {
            codegenRetries -= 1
        } else {
            approachRetries -= 1
        }
    }
}
