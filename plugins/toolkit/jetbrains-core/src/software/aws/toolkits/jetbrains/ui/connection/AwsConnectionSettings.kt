// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.ui.connection

import software.aws.toolkits.jetbrains.ui.CredentialProviderSelector
import software.aws.toolkits.jetbrains.ui.RegionSelector
import javax.swing.JPanel

class AwsConnectionSettings {
    lateinit var panel: JPanel
    lateinit var credentialProvider: CredentialProviderSelector
    lateinit var region: RegionSelector
}
