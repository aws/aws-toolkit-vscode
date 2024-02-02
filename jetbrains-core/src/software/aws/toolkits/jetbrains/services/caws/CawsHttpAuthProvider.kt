// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.MessageDialogBuilder
import com.intellij.util.AuthData
import git4idea.remote.GitHttpAuthDataProvider
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.sono.CodeCatalystCredentialManager
import software.aws.toolkits.jetbrains.services.caws.pat.generateAndStorePat
import software.aws.toolkits.jetbrains.services.caws.pat.getPat
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.resources.message
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

class CawsHttpAuthProvider : GitHttpAuthDataProvider {
    // globally only offer to make a new PAT at most once every 15s
    private val lastRefreshPrompt = AtomicLong(0)

    // framework will actually call this twice on first reject
    override fun forgetPassword(project: Project, url: String, authData: AuthData) {
        synchronized(this) {
            val now = Instant.now().epochSecond
            if (now - lastRefreshPrompt.getAndSet(now) < 15) {
                return
            }
        }

        val yesNo = computeOnEdt(ModalityState.defaultModalityState()) {
            MessageDialogBuilder.yesNo(
                message("caws.clone.invalid_pat"),
                message("caws.clone.invalid_pat.help")
            )
                .ask(project)
        }

        if (yesNo) {
            generateAndStorePat(CodeCatalystCredentialManager.getInstance(project).getSettingsAndPromptAuth().awsClient(), authData.login)
        }
    }

    override fun getAuthData(project: Project, url: String, login: String): AuthData? {
        if (CawsEndpoints.isCawsGit(url)) {
            return getPat(login)?.let { AuthData(login, it.getPasswordAsString()) }
        }

        return null
    }
}
