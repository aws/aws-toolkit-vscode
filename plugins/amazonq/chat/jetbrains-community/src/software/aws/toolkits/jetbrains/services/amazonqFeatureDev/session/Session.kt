// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.CODE_GENERATION_RETRY_LIMIT
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FEATURE_NAME
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.MAX_PROJECT_SIZE_BYTES
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.conversationIdNotFound
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAsyncEventProgress
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevService
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.resolveAndCreateOrUpdateFile
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.resolveAndDeleteFile
import software.aws.toolkits.jetbrains.services.cwc.controller.ReferenceLogController

class Session(val tabID: String, val project: Project) {
    var context: FeatureDevSessionContext
    val sessionStartTime = System.currentTimeMillis()

    private var _state: SessionState?
    private var preloaderFinished: Boolean = false
    private var _conversationId: String? = null
    private var _latestMessage: String = ""
    private var task: String = ""
    private val proxyClient: FeatureDevClient
    private val featureDevService: FeatureDevService

    // retry session state vars
    private var codegenRetries: Int

    // Used to keep track of whether the current session/tab is currently authenticating/needs authenticating
    var isAuthenticating: Boolean

    init {
        context = FeatureDevSessionContext(project, MAX_PROJECT_SIZE_BYTES)
        proxyClient = FeatureDevClient.getInstance(project)
        featureDevService = FeatureDevService(proxyClient, project)
        _state = ConversationNotStartedState("", tabID)
        isAuthenticating = false
        codegenRetries = CODE_GENERATION_RETRY_LIMIT
    }

    fun conversationIDLog(conversationId: String) = "$FEATURE_NAME Conversation ID: $conversationId"

    /**
     * Preload any events that have to run before a chat message can be sent
     */
    suspend fun preloader(msg: String, messenger: MessagePublisher) {
        if (!preloaderFinished) {
            setupConversation(msg, messenger)
            preloaderFinished = true
            messenger.sendAsyncEventProgress(tabId = this.tabID, inProgress = true)
            featureDevService.sendFeatureDevEvent(this.conversationId)
        }
    }

    /**
     * Starts a conversation with the backend and uploads the repo for the LLMs to be able to use it.
     */
    private fun setupConversation(msg: String, messenger: MessagePublisher) {
        // Store the initial message when setting up the conversation so that if it fails we can retry with this message
        _latestMessage = msg

        _conversationId = featureDevService.createConversation()
        logger<Session>().info(conversationIDLog(this.conversationId))

        val sessionStateConfig = getSessionStateConfig().copy(conversationId = this.conversationId)
        _state = PrepareCodeGenerationState(
            tabID = sessionState.tabID,
            approach = sessionState.approach,
            config = sessionStateConfig,
            filePaths = emptyList(),
            deletedFiles = emptyList(),
            references = emptyList(),
            currentIteration = 0, // first code gen iteration
            uploadId = "", // There is no code gen uploadId so far
            messenger = messenger,
        )
    }

    /**
     * Triggered by the Insert code follow-up button to apply code changes.
     */
    fun insertChanges(filePaths: List<NewFileZipInfo>, deletedFiles: List<DeletedFileInfo>, references: List<CodeReferenceGenerated>) {
        val selectedSourceFolder = context.selectedSourceFolder.toNioPath()

        filePaths.forEach { resolveAndCreateOrUpdateFile(selectedSourceFolder, it.zipFilePath, it.fileContent) }

        deletedFiles.forEach { resolveAndDeleteFile(selectedSourceFolder, it.zipFilePath) }

        ReferenceLogController.addReferenceLog(references, project)

        // Taken from https://intellij-support.jetbrains.com/hc/en-us/community/posts/206118439-Refresh-after-external-changes-to-project-structure-and-sources
        VfsUtil.markDirtyAndRefresh(true, true, true, context.selectedSourceFolder)
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
        repoContext = this.context,
        featureDevService = this.featureDevService,
    )

    val conversationId: String
        get() {
            if (_conversationId == null) {
                conversationIdNotFound()
            } else {
                return _conversationId as String
            }
        }

    val conversationIdUnsafe: String?
        get() = _conversationId

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
        get() = codegenRetries

    fun decreaseRetries() {
        codegenRetries -= 1
    }
}
