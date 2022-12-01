// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import javax.swing.JComponent

interface WorkspaceSpeedSearchProvider {
    fun highlight(speedSearchEnabledComponent: JComponent)
    fun getElementText(): String?
}
