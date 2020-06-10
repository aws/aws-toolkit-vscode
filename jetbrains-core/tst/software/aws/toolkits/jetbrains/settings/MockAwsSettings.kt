// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.testFramework.ApplicationRule
import java.util.UUID

class MockAwsSettings : AwsSettings {
    override var isTelemetryEnabled: Boolean = true
    override var promptedForTelemetry: Boolean = false
    override var useDefaultCredentialRegion: UseAwsCredentialRegion = UseAwsCredentialRegion.Prompt
    override val clientId: UUID = UUID.randomUUID()

    internal fun reset() {
        isTelemetryEnabled = true
        promptedForTelemetry = false
        useDefaultCredentialRegion = UseAwsCredentialRegion.Prompt
    }
}

class AwsSettingsRule : ApplicationRule() {
    val settings by lazy {
        AwsSettings.getInstance()
    }

    override fun after() {
        (settings as MockAwsSettings).reset()
    }
}
