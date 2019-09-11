// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.template

import com.intellij.execution.lineMarker.ExecutorAction
import com.intellij.execution.lineMarker.RunLineMarkerContributor
import com.intellij.icons.AllIcons
import com.intellij.psi.PsiElement
import org.jetbrains.yaml.psi.YAMLKeyValue
import software.aws.toolkits.jetbrains.services.cloudformation.Function
import software.aws.toolkits.jetbrains.services.cloudformation.yaml.YamlCloudFormationTemplate

class YamlLambdaRunLineMarkerContributor : RunLineMarkerContributor() {

    override fun getInfo(element: PsiElement): Info? {
        // Only leaf element is allowed
        if (element.firstChild != null) {
            return null
        }

        val parent = element.parent as? YAMLKeyValue ?: return null

        return if (parent.key == element && YamlCloudFormationTemplate.convertPsiToResource(parent) as? Function != null) {
            Info(AllIcons.RunConfigurations.TestState.Run, ExecutorAction.getActions(1), null)
        } else {
            null
        }
    }
}
