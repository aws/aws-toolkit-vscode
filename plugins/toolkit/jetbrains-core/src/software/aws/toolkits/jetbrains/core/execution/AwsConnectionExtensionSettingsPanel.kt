// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector
import software.aws.toolkits.jetbrains.ui.RegionSelector
import javax.swing.JPanel
import javax.swing.JRadioButton

class AwsConnectionExtensionSettingsPanel {
    lateinit var panel: JPanel
    lateinit var none: JRadioButton
    lateinit var useCurrentConnection: JRadioButton
    lateinit var manuallyConfiguredConnection: JRadioButton
    lateinit var credentialProvider: CredentialProviderSelector
    lateinit var region: RegionSelector
}
