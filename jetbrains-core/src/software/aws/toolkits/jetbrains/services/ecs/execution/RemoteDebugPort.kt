// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.ui.components.fields.CommaSeparatedIntegersField
import com.intellij.ui.components.fields.valueEditors.CommaSeparatedIntegersValueEditor

class RemoteDebugPort : CommaSeparatedIntegersField(null, 1, 65535, null) {
    init {
        this.columns = 5
    }

    fun setDefaultPorts(ports: List<Int>) {
        emptyText.text = CommaSeparatedIntegersValueEditor.intListToString(ports)
    }

    fun getPorts(): List<Int>? = if (text.isNullOrEmpty()) {
        null
    } else {
        value
    }

    fun setIfNotDefault(remoteDebugPorts: List<Int>?) {
        if (remoteDebugPorts == null) {
            text = null
            return
        }
        val portsString = CommaSeparatedIntegersValueEditor.intListToString(remoteDebugPorts)
        if (portsString != emptyText.text) {
            text = portsString
        }
    }
}
