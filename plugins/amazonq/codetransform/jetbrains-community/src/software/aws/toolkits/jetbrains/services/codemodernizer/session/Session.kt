// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.session

data class Session(
    val tabId: String
) {
    var isAuthenticating: Boolean = false
    var authNeededNotified: Boolean = false
}
