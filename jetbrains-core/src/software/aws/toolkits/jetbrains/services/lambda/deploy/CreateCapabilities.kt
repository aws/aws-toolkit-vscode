// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.deploy

import com.intellij.ui.components.JBCheckBox
import software.amazon.awssdk.services.cloudformation.model.Capability
import software.aws.toolkits.resources.message

enum class CreateCapabilities(val capability: String, val text: String, val toolTipText: String, val defaultEnabled: Boolean) {
    IAM(
        Capability.CAPABILITY_IAM.toString(),
        message("cloudformation.capabilities.iam"),
        message("cloudformation.capabilities.iam.toolTipText"),
        true
    ),
    NAMED_IAM(
        Capability.CAPABILITY_NAMED_IAM.toString(),
        message("cloudformation.capabilities.named_iam"),
        message("cloudformation.capabilities.named_iam.toolTipText"),
        true
    ),
    AUTO_EXPAND(
        Capability.CAPABILITY_AUTO_EXPAND.toString(),
        message("cloudformation.capabilities.auto_expand"),
        message("cloudformation.capabilities.auto_expand.toolTipText"),
        false
    );
}

class CapabilitiesEnumCheckBoxes {
    private val enums = CreateCapabilities.values()
    val checkboxes = enums.map {
        val box = JBCheckBox(it.text)
        box.toolTipText = it.toolTipText
        box
    }

    var selected: List<CreateCapabilities>
        get() = checkboxes.zip(enums).filter { it.first.isSelected }.map { it.second }
        set(values) = checkboxes.zip(values).forEach { it.first.isSelected = true }
}
