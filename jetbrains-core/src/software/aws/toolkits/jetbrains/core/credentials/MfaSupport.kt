// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

interface MfaRequiredInteractiveCredentials : InteractiveCredential {
    override val userActionDisplayMessage: String get() = message("credentials.mfa.display", displayName)
    override val userActionShortDisplayMessage: String get() = message("credentials.mfa.display.short")

    override val userAction: AnAction get() = RefreshConnectionAction(message("credentials.mfa.action"))

    override fun userActionRequired(): Boolean = true
}

fun promptForMfaToken(name: String, mfaSerial: String): String = runBlocking {
    withContext(getCoroutineUiContext(ModalityState.any())) {
        Messages.showInputDialog(
            message("credentials.mfa.message", mfaSerial),
            message("credentials.mfa.title", name),
            null
        ) ?: throw IllegalStateException("MFA challenge is required")
    }
}
