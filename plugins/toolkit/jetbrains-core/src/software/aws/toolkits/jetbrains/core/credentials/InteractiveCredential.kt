// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.AnAction
import software.aws.toolkits.core.credentials.CredentialIdentifier

/**
 * Interface that indicates that [CredentialIdentifier] may require interaction from a user before they can be used
 */
interface InteractiveCredential : CredentialIdentifier {
    val userActionDisplayMessage: String
    val userActionShortDisplayMessage: String get() = userActionDisplayMessage

    val userAction: AnAction

    /**
     * Determines if user action is required at this time (e.g. may check expiry of cookies, etc)
     */
    fun userActionRequired(): Boolean
}
